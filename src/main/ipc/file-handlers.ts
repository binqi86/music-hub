import type { IpcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { downloadFile } from '../utils/download';
import { getLocalFilePath, getFilenameFromLocalUrl } from '../utils/music-storage';

export function registerFileHandlers(ipcMain: IpcMain) {
  ipcMain.handle('file:download', async (_event, url: string, filename: string) => {
    try {
      return await downloadFile(url, filename);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Download failed');
    }
  });

  ipcMain.handle('file:copy-local', async (_event, localAudioUrl: string, outputFilename: string) => {
    try {
      const sourceFilename = getFilenameFromLocalUrl(localAudioUrl);
      const sourcePath = getLocalFilePath(sourceFilename);
      if (!fs.existsSync(sourcePath)) {
        throw new Error('Local file not found');
      }
      const destPath = path.join(app.getPath('downloads'), outputFilename);
      // Avoid overwriting existing files
      let finalPath = destPath;
      let counter = 1;
      while (fs.existsSync(finalPath)) {
        const ext = path.extname(outputFilename);
        const base = path.basename(outputFilename, ext);
        finalPath = path.join(app.getPath('downloads'), `${base} (${counter})${ext}`);
        counter++;
      }
      fs.copyFileSync(sourcePath, finalPath);
      return finalPath;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Copy failed');
    }
  });
}