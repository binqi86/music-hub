import { apiClient } from '../lib/api-client';
import type { MusicProvider, SubmitResponse, TaskResult, GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams } from './types';
import { normalizeTaskStatus } from './types';

export class SunoProvider implements MusicProvider {
  readonly id = 'suno';
  readonly name = 'Suno';

  async generate(params: GenerationParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = { model: 'suno' };

    const isCustom = params.custom ?? !!params.lyrics;
    body.custom = isCustom;

    if (params.version) body.version = params.version;
    if (params.instrumental) body.instrumental = true;

    if (isCustom) {
      if (params.lyrics) body.prompt = params.lyrics;
      if (params.title) body.title = params.title;
      if (params.style) body.style = params.style;
      if (params.negativeTags) body.negative_tags = params.negativeTags;
      if (params.autoLyrics) body.auto_lyrics = true;
      if (params.personaId) body.persona_id = params.personaId;
      if (params.styleWeight !== undefined) body.style_weight = params.styleWeight;
      if (params.weirdnessConstraint !== undefined) body.weirdness_constraint = params.weirdnessConstraint;
      if (params.audioWeight !== undefined) body.audio_weight = params.audioWeight;
    } else {
      if (params.prompt) body.prompt = params.prompt;
    }

    if (params.vocalGender) body.vocal_gender = params.vocalGender;

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
            image_large_url?: string;
            title?: string;
            lyrics?: string;
            duration?: number;
            tags?: string;
            audio_id?: string;
          }>;
          alignment?: Array<{
            word: string;
            start_s: number;
            end_s: number;
            p_align: number;
            success: boolean;
          }>;
        };
        error?: { message: string };
      };
    }>(`/v1/music/tasks/${taskId}`);

    const d = response.data;
    return {
      taskId: d.id,
      status: normalizeTaskStatus(d.status),
      progress: d.progress,
      result: d.result ? {
        music: d.result.music?.map(m => ({
          audio_url: m.audio_url,
          video_url: m.video_url,
          image_url: m.image_url,
          image_large_url: m.image_large_url,
          title: m.title,
          lyrics: m.lyrics,
          duration: m.duration,
          tags: m.tags,
          audio_id: m.audio_id,
        })),
      } : undefined,
      rawAlignment: d.result?.alignment,
      error: d.error,
    };
  }

  async cover(params: CoverParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
    };

    if (params.version) body.version = params.version;
    if (params.custom !== undefined) body.custom = params.custom;
    if (params.prompt) body.prompt = params.prompt;
    if (params.gptDescription) body.gpt_description = params.gptDescription;
    if (params.title) body.title = params.title;
    if (params.tags) body.tags = params.tags;
    if (params.negativeTags) body.negative_tags = params.negativeTags;
    if (params.vocalGender) body.vocal_gender = params.vocalGender;
    if (params.styleWeight !== undefined) body.style_weight = params.styleWeight;
    if (params.weirdnessConstraint !== undefined) body.weirdness_constraint = params.weirdnessConstraint;
    if (params.audioWeight !== undefined) body.audio_weight = params.audioWeight;
    if (params.personaId) body.persona_id = params.personaId;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/coverSong',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async extend(params: ExtendParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
      continue_at: params.continueAt,
    };

    if (params.version) body.version = params.version;
    if (params.custom !== undefined) body.custom = params.custom;
    if (params.prompt) body.prompt = params.prompt;
    if (params.gptDescription) body.gpt_description = params.gptDescription;
    if (params.title) body.title = params.title;
    if (params.tags) body.tags = params.tags;
    if (params.vocalGender) body.vocal_gender = params.vocalGender;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/extend',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async separateStems(params: StemsParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
    };

    if (params.stemType) body.stem_type = params.stemType;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/stems',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async generateMV(params: MVParams): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
    };

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/generateMp4',
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
      '/v1/music/generations/uploadTask',
      { model: 'suno', audioFilePath: audioUrl }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async remaster(params: { taskId: string; audioIndex?: number; version?: string }): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
    };
    if (params.version) body.version = params.version;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/remaster',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async concat(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/concat',
      { model: 'suno', task_id: params.taskId, audio_index: params.audioIndex ?? 1 }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async createVoice(params: { audioUrl: string }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/createVoice',
      { model: 'suno', audio_url: params.audioUrl }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async inspo(params: {
    audioUrls: string[];
    prompt?: string;
    title?: string;
    tags?: string;
    version?: string;
    vocalGender?: string;
  }): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      audio_urls: params.audioUrls,
    };
    if (params.prompt) body.prompt = params.prompt;
    if (params.title) body.title = params.title;
    if (params.tags) body.tags = params.tags;
    if (params.version) body.version = params.version;
    if (params.vocalGender) body.vocal_gender = params.vocalGender;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/inspo',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

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
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
    };
    if (params.startTime !== undefined) body.start_time = params.startTime;
    if (params.endTime !== undefined) body.end_time = params.endTime;
    if (params.prompt) body.prompt = params.prompt;
    if (params.gptDescription) body.gpt_description = params.gptDescription;
    if (params.tags) body.tags = params.tags;
    if (params.version) body.version = params.version;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/replaceMusic',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async removeSection(params: {
    taskId: string;
    audioIndex?: number;
    startTime: number;
    endTime: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/removeSection',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        start_time: params.startTime,
        end_time: params.endTime,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async crop(params: {
    taskId: string;
    audioIndex?: number;
    startTime: number;
    endTime: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/crop',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        start_time: params.startTime,
        end_time: params.endTime,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async fadeIn(params: {
    taskId: string;
    audioIndex?: number;
    fadeInDuration: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/fadeIn',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        fade_in_duration: params.fadeInDuration,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async fadeOut(params: {
    taskId: string;
    audioIndex?: number;
    fadeOutDuration: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/fadeOut',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        fade_out_duration: params.fadeOutDuration,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async adjustSpeed(params: {
    taskId: string;
    audioIndex?: number;
    speed: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/adjustSpeed',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        speed: params.speed,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async mashup(params: {
    taskId: string;
    audioIndex?: number;
    mashupTaskId: string;
    mashupAudioIndex?: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/mashup',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        mashup_task_id: params.mashupTaskId,
        mashup_audio_index: params.mashupAudioIndex ?? 1,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async sample(params: {
    taskId: string;
    audioIndex?: number;
    startTime: number;
    endTime: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/sample',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        start_time: params.startTime,
        end_time: params.endTime,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async midi(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/midi',
      { model: 'suno', task_id: params.taskId, audio_index: params.audioIndex ?? 1 }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async alignedLyrics(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/alignedLyrics',
      { model: 'suno', task_id: params.taskId, audio_index: params.audioIndex ?? 1 }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async bpm(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/bpm',
      { model: 'suno', task_id: params.taskId, audio_index: params.audioIndex ?? 1 }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async wav(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/wav',
      { model: 'suno', task_id: params.taskId, audio_index: params.audioIndex ?? 1 }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async stemsAll(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/stemsAll',
      { model: 'suno', task_id: params.taskId, audio_index: params.audioIndex ?? 1 }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async addVocals(params: {
    taskId: string;
    audioIndex?: number;
    stemTaskId: string;
    stemAudioIndex?: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/addVocals',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        stem_task_id: params.stemTaskId,
        stem_audio_index: params.stemAudioIndex ?? 1,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async addInstrumental(params: {
    taskId: string;
    audioIndex?: number;
    stemTaskId: string;
    stemAudioIndex?: number;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/addInstrumental',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        stem_task_id: params.stemTaskId,
        stem_audio_index: params.stemAudioIndex ?? 1,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async vox(params: {
    taskId: string;
    audioIndex?: number;
    prompt?: string;
  }): Promise<SubmitResponse> {
    const body: Record<string, unknown> = {
      model: 'suno',
      task_id: params.taskId,
      audio_index: params.audioIndex ?? 1,
    };
    if (params.prompt) body.prompt = params.prompt;

    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/vox',
      body
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }

  async persona(params: {
    taskId: string;
    audioIndex?: number;
    personaName: string;
  }): Promise<SubmitResponse> {
    const response = await apiClient.post<{ code: number; data: Array<{ status: string; task_id: string }> }>(
      '/v1/music/generations/persona',
      {
        model: 'suno',
        task_id: params.taskId,
        audio_index: params.audioIndex ?? 1,
        persona_name: params.personaName,
      }
    );

    return { taskId: response.data[0].task_id, status: response.data[0].status };
  }
}