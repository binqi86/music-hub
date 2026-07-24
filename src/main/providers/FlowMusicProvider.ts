import { apiClient } from '../lib/api-client';
import type { MusicProvider, SubmitResponse, TaskResult, GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams } from './types';

export class FlowMusicProvider implements MusicProvider {
  readonly id = 'flowmusic';
  readonly name = 'Flow Music';

  async generate(params: GenerationParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = { model: 'flowmusic' };

    if (params.soundPrompt) body.sound_prompt = params.soundPrompt;
    if (params.lyrics) body.lyrics = params.lyrics;
    if (params.title) body.title = params.title;
    if (params.bpm) body.bpm = params.bpm;
    if (params.length) body.length = params.length;
    if (params.seed) body.seed = params.seed;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async getTaskStatus(taskId: string): Promise<TaskResult> {
    const response = await apiClient.get<{
      code: number;
      data: {
        id: string;
        status: string;
        progress: number;
        result?: {
          music?: Array<{
            audio_url?: string;
            video_url?: string;
            image_url?: string;
            title?: string;
            lyrics?: string;
            duration?: number;
            clip_id?: string;
            wav_url?: string;
            lyrics_id?: string;
            lyrics_timing_markers?: number[][];
          }>;
          lyrics?: Array<{
            title?: string;
            lyrics?: string;
          }>;
        };
        error?: { message: string };
        cost?: number;
        credits_cost?: number;
        actual_time?: number;
      };
    }>(`/v1/music/tasks/${taskId}`);

    const d = response.data;
    return {
      taskId: d.id,
      status: d.status,
      progress: d.progress,
      result: d.result ? {
        music: d.result.music?.map(m => ({
          audio_url: m.audio_url,
          video_url: m.video_url,
          image_url: m.image_url,
          title: m.title,
          lyrics: m.lyrics,
          duration: m.duration ? Number(m.duration) : undefined,
          clip_id: m.clip_id,
          wav_url: m.wav_url,
        })),
        lyrics: d.result.lyrics,
      } : undefined,
      error: d.error,
      cost: d.cost,
      credits_cost: d.credits_cost,
      actual_time: d.actual_time,
    };
  }

  async cover(params: CoverParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'flowmusic',
      clip_id: params.taskId, // Flow Music uses clip_id, mapping from taskId
      instruction: params.gptDescription || params.prompt || '',
      strength: 0.5,
    };

    if (params.title) body.title = params.title;
    if (params.tags) body.instruction = `将这首歌曲改为${params.tags}风格`;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/coverFlowMusic',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async extend(params: ExtendParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'flowmusic',
      clip_id: params.taskId,
      extend_from_s: params.continueAt,
      extend_s: 30, // default extension duration
      instruction: params.gptDescription || params.prompt || '延续主歌旋律',
    };

    if (params.title) body.title = params.title;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/extendFlowMusic',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async separateStems(params: StemsParams): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/stemsFlowMusic',
      {
        model: 'flowmusic',
        clip_id: params.taskId,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async generateMV(params: MVParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'flowmusic',
      clip_id: params.taskId,
    };

    if (params.preset) body.preset = params.preset;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/videoClipFlowMusic',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async generateLyrics(params: { prompt: string; model?: string }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/lyricsFlowMusic',
      { model: 'flowmusic', prompt: params.prompt }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async upload(audioUrl: string): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/uploadAudioFlowMusic',
      { model: 'flowmusic', audio_url: audioUrl }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  // Flow Music specific: replace section
  async replaceMusic(params: {
    taskId: string;
    audioIndex?: number;
    startTime?: number;
    endTime?: number;
    prompt?: string;
    gptDescription?: string;
    tags?: string;
    version?: string;
  }): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'flowmusic',
      clip_id: params.taskId,
      instruction: params.gptDescription || params.prompt || '',
    };
    if (params.startTime !== undefined) body.start_time = params.startTime;
    if (params.endTime !== undefined) body.end_time = params.endTime;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/replaceFlowMusic',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  // Stubs for optional Suno-only methods
  async inspo(): Promise<SubmitResponse> { throw new Error('Flow Music does not support inspo endpoint'); }
  async remaster(): Promise<SubmitResponse> { throw new Error('Flow Music does not support remaster'); }
  async concat(): Promise<SubmitResponse> { throw new Error('Flow Music does not support concat'); }
  async createVoice(): Promise<SubmitResponse> { throw new Error('Flow Music does not support createVoice'); }
  async removeSection(): Promise<SubmitResponse> { throw new Error('Flow Music does not support removeSection'); }
  async crop(): Promise<SubmitResponse> { throw new Error('Flow Music does not support crop'); }
  async fadeIn(): Promise<SubmitResponse> { throw new Error('Flow Music does not support fadeIn'); }
  async fadeOut(): Promise<SubmitResponse> { throw new Error('Flow Music does not support fadeOut'); }
  async adjustSpeed(): Promise<SubmitResponse> { throw new Error('Flow Music does not support adjustSpeed'); }
  async mashup(): Promise<SubmitResponse> { throw new Error('Flow Music does not support mashup'); }
  async sample(): Promise<SubmitResponse> { throw new Error('Flow Music does not support sample'); }
  async midi(): Promise<SubmitResponse> { throw new Error('Flow Music does not support midi'); }
  async alignedLyrics(): Promise<SubmitResponse> { throw new Error('Flow Music does not support alignedLyrics'); }
  async bpm(): Promise<SubmitResponse> { throw new Error('Flow Music does not support bpm'); }
  async wav(): Promise<SubmitResponse> { throw new Error('Flow Music does not support wav'); }
  async stemsAll(): Promise<SubmitResponse> { throw new Error('Flow Music does not support stemsAll'); }
  async addVocals(): Promise<SubmitResponse> { throw new Error('Flow Music does not support addVocals'); }
  async addInstrumental(): Promise<SubmitResponse> { throw new Error('Flow Music does not support addInstrumental'); }
  async vox(): Promise<SubmitResponse> { throw new Error('Flow Music does not support vox'); }
  async persona(): Promise<SubmitResponse> { throw new Error('Flow Music does not support persona'); }
}