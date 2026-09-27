/**
 * 把上游返回的错误信息翻译成用户能直接行动的说法。
 *
 * 背景：2026-09-26 用户上传《薛之谦 - 演员》做翻唱，链路本身全部正常
 * （ffmpeg 转码 → uguu 图床 → 自检 HTTP 206 → 上游成功建任务），
 * 但任务执行后被上游判为「因特定内容政策被拦截（如公众人物、未成年人、音频版权）」。
 * 这类问题不是程序故障，却会被当成「软件坏了」——因为那时界面只原样抛出这句话。
 *
 * 约定：只在能明确归类时改写，其余情况原样返回，避免吞掉上游的真实原因。
 */

const POLICY_PATTERNS = [
  /内容政策|内容审核|内容策略|公众人物|未成年人|音频版权|版权音频/i,
  /content[_\s-]?polic|copyright|public figure|celebrity|minor(?!it)|nsfw|moderation/i,
];

export function isContentPolicyError(message: string): boolean {
  if (!message) return false;
  return POLICY_PATTERNS.some((re) => re.test(message));
}

export interface UpstreamErrorOptions {
  /** 出问题的任务 ID，便于用户拿着去问上游 */
  taskId?: string;
  /** 「导入音频」/「翻唱」等动作名，用于让提示更贴合场景 */
  stage?: string;
}

/**
 * 生成面向用户的错误文案。命中内容政策时，会明确说明
 * 「不是上传链路故障」并给出可尝试的替代素材。
 */
export function describeUpstreamError(raw: string, options: UpstreamErrorOptions = {}): string {
  const base = (raw || '').trim();
  if (!base) return '';
  if (!isContentPolicyError(base)) return base;

  const where = options.taskId ? `（任务 ${options.taskId}）` : '';
  const stage = options.stage ? `${options.stage}时` : '';
  const detail = base.replace(/[。.\s]+$/, '');

  return (
    `音频托管与上传都已成功，是上游在${stage}的内容审核拦下了这段音频${where}：${detail}。` +
    '这通常意味着素材涉及已发行录音、公众人物人声或未授权版权内容。' +
    '请换一段自己录制、自己演奏或已获授权的音频再试（清唱、自制伴奏、无版权音乐均可）。'
  );
}
