import type { IpcMain } from 'electron';
import { LibraryService } from '../services/LibraryService';

const libraryService = new LibraryService();

export function registerLibraryHandlers(ipcMain: IpcMain) {
  ipcMain.handle('library:list', async (_event, filter) => {
    try {
      return await libraryService.list(filter);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to list library');
    }
  });

  ipcMain.handle('library:get', async (_event, id) => {
    try {
      return await libraryService.getById(id);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to get track');
    }
  });

  ipcMain.handle('library:delete', async (_event, id) => {
    try {
      await libraryService.delete(id);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete track');
    }
  });
}