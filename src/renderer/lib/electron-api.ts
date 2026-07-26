export async function generateMusic(params: {
  model?: string;
  prompt?: string;
  soundPrompt?: string;
  lyrics?: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  custom?: boolean;
  version?: string;
  vocalGender?: string;
  bpm?: string;
  length?: number;
}) {
  return window.electronAPI.generateMusic(params);
}

export async function generateCover(params: {
  taskId: string;
  audioIndex?: number;
  prompt?: string;
  gptDescription?: string;
  tags?: string;
  title?: string;
  model?: string;
  vocalGender?: string;
}) {
  return window.electronAPI.generateCover(params);
}

export async function generateExtend(params: {
  taskId: string;
  audioIndex?: number;
  continueAt: number;
  prompt?: string;
  gptDescription?: string;
  model?: string;
}) {
  return window.electronAPI.generateExtend(params);
}

export async function separateStems(params: {
  taskId: string;
  audioIndex?: number;
  stemType?: string;
  model?: string;
}) {
  return window.electronAPI.separateStems(params);
}

export async function generateMV(params: {
  taskId: string;
  audioIndex?: number;
  model?: string;
}) {
  return window.electronAPI.generateMV(params);
}

export async function generateAlignedLyrics(params: { taskId: string; audioIndex?: number }): Promise<{ filtered: string; full: string }> {
  return window.electronAPI.generateAlignedLyrics(params);
}

export async function getTaskStatus(taskId: string) {
  return window.electronAPI.getTaskStatus(taskId);
}

export async function getLibrary(filter: {
  search?: string;
  model?: string;
  mode?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  return window.electronAPI.getLibrary(filter);
}

export async function getTrack(id: string) {
  return window.electronAPI.getTrack(id);
}

export async function deleteTrack(id: string) {
  return window.electronAPI.deleteTrack(id);
}

export async function downloadFile(url: string, filename: string) {
  return window.electronAPI.downloadFile(url, filename);
}

export async function uploadAudio() {
  return window.electronAPI.uploadAudio();
}

export async function getProviderConfigs() {
  return window.electronAPI.getProviderConfigs();
}

export async function updateProviderConfig(id: string, data: { apiKey?: string; baseUrl?: string; displayName?: string; isActive?: boolean; useTunnel?: boolean }) {
  return window.electronAPI.updateProviderConfig(id, data);
}

export async function setActiveProvider(id: string) {
  return window.electronAPI.setActiveProvider(id);
}