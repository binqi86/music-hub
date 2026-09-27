/**
 * 接口层的文本长度上限（字符数，按 Unicode 字符计算）。
 *
 * 出处：APIMart 文档「Suno V6 通用约定与任务查询」→ 文本与权重限制
 * https://docs.apimart.ai/cn/api-reference/audios/suno/overview
 *   - 灵感描述 prompt（主生成）/ gpt_description（操作接口）：3000 字符
 *   - 歌词     prompt（custom=true）：5000 字符
 *   - 风格     style（主生成）/ tags（操作接口）：1000 字符
 *   - 标题     title：80 字符
 *
 * Flow Music（flowmusic）官方文档未给出字符上限，仅要求 sound_prompt 与 lyrics
 * 至少一项非空；这里取与 Suno 描述同档的保守值，避免超长请求被网关拒绝。
 *
 * 注意：接口限制的是「字符数」，不是「标签个数」——标签在提交前会被拼成
 * 一个字符串，接口看不到有几个标签。所以 UI 不再限制标签数量，改为按字符数约束。
 */
export const SUNO_LIMITS = {
  inspirationPrompt: 3000,
  lyrics: 5000,
  style: 1000,
  title: 80,
} as const;

export const FLOWMUSIC_LIMITS = {
  soundPrompt: 3000,
  lyrics: 5000,
  title: 80,
} as const;

/** 标签个数的防呆上限（非接口限制，仅避免界面被极端输入拖垮）。 */
export const MAX_STYLE_TAGS = 50;

/**
 * 标签在内部用 "|||" 分隔存储，提交时转成接口期望的逗号分隔字符串。
 * 校验字符数时必须用这个结果，才是接口实际收到的长度。
 */
export function joinStyleForApi(value: string): string {
  return value
    .split('|||')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

export interface LengthCheckInput {
  model: 'suno' | 'flowmusic';
  mode: 'inspiration' | 'custom' | 'cover';
  /** Suno 灵感模式的描述文本（合并标签之前的原始输入） */
  prompt: string;
  /** Flow Music 的风格描述（合并标签之前） */
  soundPrompt: string;
  lyrics: string;
  /** 已 joinStyleForApi + 语言前缀后的风格串 */
  styleString: string;
  title: string;
}

/**
 * 提交前的文本长度校验。返回给用户看的错误信息；一切正常返回 null。
 *
 * 说明：Suno 灵感模式与 Flow Music 的标签会被合并进描述文本，
 * 所以这里按「合并后真正要发出去的长度」来算，而不是各字段单算。
 */
export function validateTextLengths(input: LengthCheckInput): string | null {
  const { model, mode, prompt, soundPrompt, lyrics, styleString, title } = input;
  const problems: string[] = [];
  const check = (label: string, len: number, max: number) => {
    if (len > max) problems.push(`${label} ${len}/${max}，超出 ${len - max} 字符`);
  };
  const sunoInspiration = model === 'suno' && mode === 'inspiration';

  if (model === 'suno') {
    if (mode === 'inspiration') {
      const promptText = styleString
        ? `${prompt.trim()}${prompt.trim() ? '\n\n' : ''}风格：${styleString}`
        : prompt;
      check('音乐描述', promptText.length, SUNO_LIMITS.inspirationPrompt);
    } else if (mode === 'custom') {
      check('歌词', lyrics.length, SUNO_LIMITS.lyrics);
      check('曲风标签', styleString.length, SUNO_LIMITS.style);
    } else {
      // 翻唱：标签作为改编指令传给 tags
      check('目标风格', styleString.length, SUNO_LIMITS.style);
    }
    if (!sunoInspiration) check('标题', title.length, SUNO_LIMITS.title);
  } else {
    // Flow Music：灵感 / 自定义模式下标签合并进风格描述
    if (mode !== 'cover') {
      const flowPrompt = styleString
        ? soundPrompt
          ? `${soundPrompt}, ${styleString}`
          : styleString
        : soundPrompt;
      check('音乐风格描述', flowPrompt.length, FLOWMUSIC_LIMITS.soundPrompt);
      if (mode === 'custom') check('歌词', lyrics.length, FLOWMUSIC_LIMITS.lyrics);
    }
    check('标题', title.length, FLOWMUSIC_LIMITS.title);
  }

  return problems.length
    ? `以下内容超出接口长度限制，请精简后再提交：${problems.join('；')}`
    : null;
}
