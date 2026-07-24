import type { IpcMain } from 'electron';
import { downloadFile } from '../utils/download';

export function registerFileHandlers(ipcMain: IpcMain) {
  ipcMain.handle('file:download', async (_event, url: string, filename: string) => {
    try {
      return await downloadFile(url, filename);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Download failed');
    }
  });
}