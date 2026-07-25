import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { prisma } from './lib/prisma';
import { registerMusicHandlers } from './ipc/music-handlers';
import { registerLibraryHandlers } from './ipc/library-handlers';
import { registerFileHandlers } from './ipc/file-handlers';
import { registerProviderHandlers } from './ipc/provider-handlers';

let mainWindow: BrowserWindow | null = null;

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