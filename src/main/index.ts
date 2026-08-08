import { app, BrowserWindow, ipcMain, protocol } from 'electron';
import path from 'path';
import fs from 'fs';
import { prisma } from './lib/prisma';
import { registerMusicHandlers } from './ipc/music-handlers';
import { registerLibraryHandlers } from './ipc/library-handlers';
import { registerFileHandlers } from './ipc/file-handlers';
import { registerProviderHandlers } from './ipc/provider-handlers';
import { getMusicStoragePath } from './utils/music-storage';

let mainWindow: BrowserWindow | null = null;

// Register custom protocol scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-music',
    privileges: { stream: true, supportFetchAPI: true, bypassCSP: true },
  },
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Music Hub',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

async function seedDefaultProvider() {
  const existing = await prisma.providerConfig.findUnique({ where: { name: 'apimart' } });
  if (!existing) {
    await prisma.providerConfig.create({
      data: {
        name: 'apimart',
        apiKey: '',
        baseUrl: 'https://api.apimart.ai',
        displayName: 'APIMart',
        isActive: true,
      },
    });
    console.log('Seeded default APIMart provider config');
  }
}

function getContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.webm': 'audio/webm',
  };
  return types[ext] || 'application/octet-stream';
}

app.whenReady().then(async () => {
  // Ensure music storage directory exists
  getMusicStoragePath();

  // Register custom protocol handler for serving local music files.
  // Must implement HTTP Range requests manually: without them, <audio>/<video>
  // elements treat the source as unseekable and ignore currentTime changes.
  // (net.fetch('file://') does not honor Range — see electron/electron#38749.)
  protocol.handle('local-music', async (request) => {
    const url = new URL(request.url);
    const musicStoragePath = getMusicStoragePath();
    // local-music:///encoded-filename.mp3 → pathname is "/encoded-filename.mp3"
    const filename = decodeURIComponent(url.pathname.slice(1));
    const filePath = path.join(musicStoragePath, filename);

    const data = await fs.promises.readFile(filePath);
    const size = data.length;
    const range = request.headers.get('Range');

    const baseHeaders: Record<string, string> = {
      'Content-Type': getContentType(filename),
      'Accept-Ranges': 'bytes',
    };

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
        if (start < size && start <= end) {
          return new Response(data.subarray(start, end + 1), {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${size}`,
            },
          });
        }
        return new Response(null, { status: 416 });
      }
    }

    return new Response(data, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(size) },
    });
  });

  await seedDefaultProvider();
  createWindow();
  registerMusicHandlers(ipcMain, mainWindow);
  registerLibraryHandlers(ipcMain);
  registerFileHandlers(ipcMain);
  registerProviderHandlers(ipcMain);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});