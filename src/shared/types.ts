export interface MusicTrackData {
  id: string;
  taskId: string;
  title: string | null;
  lyrics: string | null;
  prompt: string | null;
  style: string | null;
  model: string;
  mode: string;
  status: string;
  audioUrl: string | null;
  videoUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
  params: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  stems: StemTrackData[];
  parent: MusicTrackData | null;
  children: MusicTrackData[];
}

export interface StemTrackData {
  id: string;
  musicTrackId: string;
  stemType: string;
  audioUrl: string | null;
  title: string | null;
  duration: number | null;
  createdAt: string;
}

export interface GenerationParams {
  prompt?: string;
  lyrics?: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  version?: string;
  model?: string;
  custom?: boolean;
  vocalGender?: string;
  language?: string;
  negativeTags?: string;
  autoLyrics?: boolean;
  personaId?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  duration?: number;
  bpm?: string;
  length?: number;
  seed?: string;
  soundPrompt?: string;
}

export interface CoverParams {
  taskId: string;
  audioIndex?: number;
  model?: string;
  prompt?: string;
  gptDescription?: string;
  title?: string;
  tags?: string;
  version?: string;
  custom?: boolean;
  vocalGender?: string;
  negativeTags?: string;
  styleWeight?: number;
  weirdnessConstraint?: number;
  audioWeight?: number;
  personaId?: string;
}

export interface ExtendParams {
  taskId: string;
  audioIndex?: number;
  continueAt: number;
  model?: string;
  version?: string;
  custom?: boolean;
  prompt?: string;
  gptDescription?: string;
  title?: string;
  tags?: string;
  vocalGender?: string;
}

export interface StemsParams {
  taskId: string;
  audioIndex?: number;
  stemType?: string;
  model?: string;
}

export interface MVParams {
  taskId: string;
  audioIndex?: number;
  model?: string;
  preset?: string;
}

export interface SubmitResponse {
  taskId: string;
  status: string;
}

export interface TaskResult {
  taskId: string;
  status: string;
  progress: number;
  result?: {
    music?: Array<{
      audio_url?: string;
      video_url?: string;
      image_url?: string;
      image_large_url?: string;
      title?: string;
      lyrics?: string;
      duration?: number;
      tags?: string;
      audio_id?: string;
      clip_id?: string;
      wav_url?: string;
      file_url?: string;
      url?: string;
      mime_type?: string;
      size_bytes?: number;
    }>;
    lyrics?: Array<{
      title?: string;
      lyrics?: string;
    }>;
  };
  rawAlignment?: Array<{
    word: string;
    start_s: number;
    end_s: number;
    p_align: number;
    success: boolean;
  }>;
  error?: {
    message: string;
  };
  cost?: number;
  credits_cost?: number;
  actual_time?: number;
}

export interface ProviderConfigData {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  displayName: string;
  isActive: boolean;
  useTunnel: boolean;
}

export interface LibraryFilter {
  search?: string;
  model?: string;
  mode?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface LibraryResult {
  tracks: MusicTrackData[];
  total: number;
  page: number;
}

export interface ElectronAPI {
  // Music generation
  generateMusic: (params: GenerationParams) => Promise<SubmitResponse>;
  generateCover: (params: CoverParams) => Promise<SubmitResponse>;
  generateExtend: (params: ExtendParams) => Promise<SubmitResponse>;
  separateStems: (params: StemsParams) => Promise<SubmitResponse>;
  generateMV: (params: MVParams) => Promise<SubmitResponse>;
  generateAlignedLyrics: (params: { taskId: string; audioIndex?: number }) => Promise<{ filtered: string; full: string }>;
  getTaskStatus: (taskId: string) => Promise<TaskResult>;

  // Upload
  uploadAudio: () => Promise<{ taskId: string } | null>;

  // Library
  getLibrary: (filter: LibraryFilter) => Promise<LibraryResult>;
  getTrack: (id: string) => Promise<MusicTrackData | null>;
  deleteTrack: (id: string) => Promise<void>;

  // Provider config
  getProviderConfigs: () => Promise<ProviderConfigData[]>;
  updateProviderConfig: (id: string, data: { apiKey?: string; baseUrl?: string; displayName?: string; isActive?: boolean }) => Promise<ProviderConfigData>;
  setActiveProvider: (id: string) => Promise<void>;

  // File operations
  downloadFile: (url: string, filename: string) => Promise<string>;

  // Event listeners (main -> renderer)
  onTaskUpdate: (callback: (data: { taskId: string; status: string; progress: number }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}