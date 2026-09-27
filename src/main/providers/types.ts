import type { SubmitResponse, TaskResult, GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams } from '../../shared/types';
export type { SubmitResponse, TaskResult, GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams };

// APIMart 任务接口返回的完成/失败状态字符串与代码中的规范值不完全一致
// （例如完成后返回 "complete" 而非 "completed"），在解析边界统一归一化，
// 使 TaskManager / 渲染层只需处理 'completed' / 'failed' 两种终态。
export function normalizeTaskStatus(status: string): string {
  const s = (status || '').toLowerCase();
  if (['complete', 'completed', 'success', 'succeeded', 'finished', 'done'].includes(s)) {
    return 'completed';
  }
  if (['failed', 'error', 'canceled', 'cancelled', 'expired'].includes(s)) {
    return 'failed';
  }
  return status;
}

/**
 * 从「提交类」接口的响应里取出 task_id。
 *
 * APIMart 的提交接口统一返回 `{ code, data: [{ status, task_id }] }`，
 * 但失败时可能返回错误体、或 data 不是数组。直接读 `data[0].task_id`
 * 会抛出 "Cannot read properties of undefined"，把真正的原因盖掉。
 * 这里统一校验并把原始响应带进错误信息，方便定位。
 */
export function extractSubmittedTask(payload: unknown, context: string): SubmitResponse {
  const first = (payload as { data?: unknown } | null)?.data;
  const item = Array.isArray(first) ? (first[0] as { task_id?: string; status?: string } | undefined) : undefined;

  if (!item || typeof item.task_id !== 'string' || !item.task_id) {
    let raw = '';
    try {
      raw = JSON.stringify(payload);
    } catch {
      raw = String(payload);
    }
    throw new Error(`${context}：上游返回了无法识别的结果 ${raw.slice(0, 300)}`);
  }

  return { taskId: item.task_id, status: item.status || 'submitted' };
}

export interface MusicProvider {
  readonly id: string;
  readonly name: string;

  generate(params: GenerationParams): Promise<SubmitResponse>;
  getTaskStatus(taskId: string): Promise<TaskResult>;

  cover?(params: CoverParams): Promise<SubmitResponse>;
  extend?(params: ExtendParams): Promise<SubmitResponse>;
  separateStems?(params: StemsParams): Promise<SubmitResponse>;
  generateMV?(params: MVParams): Promise<SubmitResponse>;
  generateLyrics?(params: { prompt: string; model?: string }): Promise<SubmitResponse>;
  upload?(audioUrl: string): Promise<SubmitResponse>;
  remaster?(params: { taskId: string; audioIndex?: number; version?: string }): Promise<SubmitResponse>;
  concat?(params: { taskId: string; audioIndex?: number }): Promise<SubmitResponse>;
  createVoice?(params: { audioUrl: string }): Promise<SubmitResponse>;
  inspo?(params: {
    audioUrls: string[];
    prompt?: string;
    title?: string;
    tags?: string;
    version?: string;
    vocalGender?: string;
  }): Promise<SubmitResponse>;
  replaceMusic?(params: {
    taskId: string;
    audioIndex?: number;
    startTime?: number;
    endTime?: number;
    prompt?: string;
    gptDescription?: string;
    tags?: string;
    version?: string;
  }): Promise<SubmitResponse>;
  removeSection?(params: {
    taskId: string;
    audioIndex?: number;
    startTime: number;
    endTime: number;
  }): Promise<SubmitResponse>;
  crop?(params: {
    taskId: string;
    audioIndex?: number;
    startTime: number;
    endTime: number;
  }): Promise<SubmitResponse>;
  fadeIn?(params: {
    taskId: string;
    audioIndex?: number;
    fadeInDuration: number;
  }): Promise<SubmitResponse>;
  fadeOut?(params: {
    taskId: string;
    audioIndex?: number;
    fadeOutDuration: number;
  }): Promise<SubmitResponse>;
  adjustSpeed?(params: {
    taskId: string;
    audioIndex?: number;
    speed: number;
  }): Promise<SubmitResponse>;
  mashup?(params: {
    taskId: string;
    audioIndex?: number;
    mashupTaskId: string;
    mashupAudioIndex?: number;
  }): Promise<SubmitResponse>;
  sample?(params: {
    taskId: string;
    audioIndex?: number;
    startTime: number;
    endTime: number;
  }): Promise<SubmitResponse>;
  midi?(params: {
    taskId: string;
    audioIndex?: number;
  }): Promise<SubmitResponse>;
  alignedLyrics?(params: {
    taskId: string;
    audioIndex?: number;
  }): Promise<SubmitResponse>;
  bpm?(params: {
    taskId: string;
    audioIndex?: number;
  }): Promise<SubmitResponse>;
  wav?(params: {
    taskId: string;
    audioIndex?: number;
  }): Promise<SubmitResponse>;
  stemsAll?(params: {
    taskId: string;
    audioIndex?: number;
  }): Promise<SubmitResponse>;
  addVocals?(params: {
    taskId: string;
    audioIndex?: number;
    stemTaskId: string;
    stemAudioIndex?: number;
  }): Promise<SubmitResponse>;
  addInstrumental?(params: {
    taskId: string;
    audioIndex?: number;
    stemTaskId: string;
    stemAudioIndex?: number;
  }): Promise<SubmitResponse>;
  vox?(params: {
    taskId: string;
    audioIndex?: number;
    prompt?: string;
  }): Promise<SubmitResponse>;
  persona?(params: {
    taskId: string;
    audioIndex?: number;
    personaName: string;
  }): Promise<SubmitResponse>;
}