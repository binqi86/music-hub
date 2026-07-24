import type { IpcMain } from 'electron';
import { BrowserWindow, dialog } from 'electron';
import path from 'path';
import { MusicService } from '../services/MusicService';
import { startLocalFileServer, stopLocalFileServer } from '../utils/local-server';
import { createCloudflareTunnel } from '../utils/cloudflare-tunnel';

export function registerMusicHandlers(ipcMain: IpcMain, window: BrowserWindow | null) {
  const musicService = new MusicService(window);

  ipcMain.handle('music:generate', async (_event, params) => {
    try {
      return await musicService.submitGeneration(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Generation failed');
    }
  });

  ipcMain.handle('music:cover', async (_event, params) => {
    try {
      return await musicService.submitCover(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Cover failed');
    }
  });

  ipcMain.handle('music:extend', async (_event, params) => {
    try {
      return await musicService.submitExtend(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Extend failed');
    }
  });

  ipcMain.handle('music:stems', async (_event, params) => {
    try {
      return await musicService.submitStems(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Stem separation failed');
    }
  });

  ipcMain.handle('music:mv', async (_event, params) => {
    try {
      return await musicService.submitMV(params);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'MV generation failed');
    }
  });

  ipcMain.handle('music:task-status', async (_event, taskId) => {
    try {
      return await musicService.getTaskStatus(taskId);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get task status');
    }
  });

  ipcMain.handle('music:upload-audio', async () => {
    const win = window || BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('No window available');

    try {
      const result = await dialog.showOpenDialog(win, {
        title: '选择音频文件',
        filters: [
          { name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];

      // Check if tunnel is enabled for the active provider
      const useTunnel = await musicService.shouldUseTunnel();
      let publicUrl: string;

      if (useTunnel) {
        // Start local HTTP server + Cloudflare Tunnel
        const localUrl = await startLocalFileServer(filePath);
        const localPort = new URL(localUrl).port;
        const tunnel = await createCloudflareTunnel(parseInt(localPort));
        const filename = path.basename(filePath);
        publicUrl = `${tunnel.url}/${filename}`;
        console.log(`Public file URL via Cloudflare Tunnel: ${publicUrl}`);

        // Store cleanup refs
        const tunnelStop = tunnel.stop;
        // Attach cleanup to task completion via the handler scope
        const originalTaskResult = await musicService.submitUpload(publicUrl);
        // Clean up tunnel and server after submission
        tunnelStop();
        stopLocalFileServer();
        return originalTaskResult;
      } else {
        // Tunnel disabled
        throw new Error('当前供应商未启用上传隧道，请在设置中开启 Cloudflare 隧道，或手动提供公网可访问的音频 URL');
      }
    } catch (error) {
      stopLocalFileServer();
      throw new Error(error instanceof Error ? error.message : 'Upload failed');
    }
  });
}