import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI, GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams, LibraryFilter } from '../shared/types';

const electronAPI: ElectronAPI = {
  // Music generation
  generateMusic: (params: GenerationParams) => ipcRenderer.invoke('music:generate', params),
  generateCover: (params: CoverParams) => ipcRenderer.invoke('music:cover', params),
  generateExtend: (params: ExtendParams) => ipcRenderer.invoke('music:extend', params),
  separateStems: (params: StemsParams) => ipcRenderer.invoke('music:stems', params),
  generateMV: (params: MVParams) => ipcRenderer.invoke('music:mv', params),
  generateAlignedLyrics: (params: { taskId: string; audioIndex?: number }) => ipcRenderer.invoke('music:aligned-lyrics', params) as Promise<{ filtered: string; full: string }>,
  getTaskStatus: (taskId: string) => ipcRenderer.invoke('music:task-status', taskId),
  uploadAudio: () => ipcRenderer.invoke('music:upload-audio'),

  // Library
  getLibrary: (filter: LibraryFilter) => ipcRenderer.invoke('library:list', filter),
  getTrack: (id: string) => ipcRenderer.invoke('library:get', id),
  deleteTrack: (id: string) => ipcRenderer.invoke('library:delete', id),

  // Provider config
  getProviderConfigs: () => ipcRenderer.invoke('provider:list'),
  updateProviderConfig: (id: string, data) => ipcRenderer.invoke('provider:update', id, data),
  setActiveProvider: (id: string) => ipcRenderer.invoke('provider:set-active', id),

  // File operations
  downloadFile: (url: string, filename: string) => ipcRenderer.invoke('file:download', url, filename),

  // Event listeners
  onTaskUpdate: (callback: (data: { taskId: string; status: string; progress: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { taskId: string; status: string; progress: number }) => callback(data);
    ipcRenderer.on('music:task-update', handler);
    return () => {
      ipcRenderer.removeListener('music:task-update', handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);