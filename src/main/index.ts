import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import path from 'path';
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

app.whenReady().then(async () => {
  // Ensure music storage directory exists
  getMusicStoragePath();

  // Register custom protocol handler for serving local music files
  protocol.handle('local-music', (request) => {
    const url = new URL(request.url);
    const musicStoragePath = getMusicStoragePath();
    // local-music:///encoded-filename.mp3 → pathname is "/encoded-filename.mp3"
    const filename = decodeURIComponent(url.pathname.slice(1));
    const filePath = path.join(musicStoragePath, filename);
    return net.fetch('file://' + filePath);
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