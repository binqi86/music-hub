import React, { useState, useEffect } from 'react';
import { Sparkles, Mic, Upload, Settings, X, Check, Loader, Wand2, FileAudio } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StyleTagPicker } from '../components/ui/StyleTagPicker';
import { useGenerationStore, isTerminalStatus } from '../stores/generation-store';
import { generateMusic, generateCover, uploadAudio, getTaskStatus } from '../lib/electron-api';
import { getModelLabel, getModeLabel } from '../lib/utils';
import { SUNO_LIMITS, FLOWMUSIC_LIMITS, joinStyleForApi, validateTextLengths } from '../../shared/limits';

interface GenerationFormData {
  model: 'suno' | 'flowmusic';
  mode: 'inspiration' | 'custom' | 'cover';
  prompt: string;
  soundPrompt: string;
  lyrics: string;
  style: string;
  title: string;
  instrumental: boolean;
  version: string;
  vocalGender: string;
  language: string;
  duration: number;
  bpm: string;
  length: number;
  strength: number;
}

/** 已就绪的翻唱源：clip_id 来自上传任务完成后返回的 result.music[0].clip_id */
interface CoverSource {
  taskId: string;
  clipId: string | null;
  title: string | null;
  duration: number | null;
}

const initialForm: GenerationFormData = {
  model: 'suno',
  mode: 'inspiration',
  prompt: '',
  soundPrompt: '',
  lyrics: '',
  style: '',
  title: '',
  instrumental: false,
  version: 'v6',
  vocalGender: '',
  language: '',
  duration: 0,
  bpm: '',
  length: 60,
  strength: 0.5,
};

/** Suno 公共版本，见官方「Suno V6 通用约定」 */
const SUNO_VERSIONS = ['v6', 'v6-wild', 'v6-mini'];

export function Generate() {
  const [form, setForm] = useState<GenerationFormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverSource, setCoverSource] = useState<CoverSource | null>(null);
  const [uploading, setUploading] = useState(false);
  const { activeTasks, addTask, updateTask, bumpRevision } = useGenerationStore();

  const updateField = <K extends keyof GenerationFormData>(
    key: K,
    value: GenerationFormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  /** 曲风标签最终发给接口的字符串（标签内部用 "|||" 分隔，提交时转成 ", "）。 */
  const buildStyleString = () => {
    const joined = joinStyleForApi(form.style);
    if (!form.language) return joined;
    return joined ? `${form.language}, ${joined}` : form.language;
  };

  /**
   * 提交前的长度校验：接口对文本字段有字符数上限，超了会被拒或截断，
   * 与其让用户等一轮才报错，不如在这里直接拦下并说明超出多少。
   * 具体规则见 shared/limits.ts（按合并后真正发出去的长度计算）。
   */
  const validateLengths = (): string | null =>
    validateTextLengths({
      model: form.model,
      mode: form.mode,
      prompt: form.prompt,
      soundPrompt: form.soundPrompt,
      lyrics: form.lyrics,
      styleString: buildStyleString(),
      title: form.title,
    });

  // 对账：进入页面时重新查一次仍未结束的任务。
  // 主进程每 5 秒推送状态，但应用重启或事件丢失时内存里的状态可能是旧的，
  // 会出现"歌已经生成完了、卡片还在转圈"的假象。
  useEffect(() => {
    const pending = useGenerationStore
      .getState()
      .activeTasks.filter((t) => !isTerminalStatus(t.status));

    pending.forEach((task) => {
      getTaskStatus(task.taskId)
        .then((status) => {
          updateTask(task.taskId, { status: status.status, progress: status.progress ?? 0 });
          if (isTerminalStatus(status.status)) bumpRevision();
        })
        .catch(() => {
          // 查不到就保持原状，等待下一轮推送
        });
    });
  }, []);

  const handleUpload = async () => {
    setError(null);
    setUploading(true);
    try {
      const result = await uploadAudio({ model: form.model });
      if (!result) return; // 用户取消选择

      setCoverSource({
        taskId: result.taskId,
        clipId: result.clipId,
        title: result.title,
        duration: result.duration,
      });

      // Flow Music 的翻唱必须带 clip_id；上传完成却没拿到说明源音频无法被引用
      if (form.model === 'flowmusic' && !result.clipId) {
        setError('上传完成但未取得 clip_id，请换一个音频文件重试');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (form.mode === 'cover') {
      if (!coverSource) {
        setError('请先上传要翻唱的音频文件');
        return;
      }
      if (form.model === 'flowmusic' && !coverSource.clipId) {
        setError('源音频尚未解析出 clip_id，请重新上传');
        return;
      }
    } else if (form.model === 'suno') {
      if (form.mode === 'inspiration' && !form.prompt.trim()) {
        setError('请输入音乐描述');
        return;
      } else if (form.mode === 'custom' && !form.lyrics.trim() && !form.instrumental) {
        setError('请输入歌词或开启纯音乐模式');
        return;
      }
    } else {
      // Flow Music
      if (form.mode === 'inspiration' && !form.soundPrompt.trim()) {
        setError('请输入音乐风格描述');
        return;
      } else if (form.mode === 'custom' && !form.lyrics.trim() && !form.soundPrompt.trim()) {
        setError('歌词和风格描述至少填一项');
        return;
      }
    }

    const lengthError = validateLengths();
    if (lengthError) {
      setError(lengthError);
      return;
    }

    setSubmitting(true);
    try {
      const styleWithLang = buildStyleString();

      let result: { taskId: string; id?: string };

      if (form.mode === 'cover') {
        result = await generateCover({
          taskId: coverSource!.taskId,
          clipId: coverSource!.clipId || undefined,
          tags: styleWithLang || undefined,
          title: form.title || undefined,
          model: form.model,
          strength: form.model === 'flowmusic' ? form.strength : undefined,
        });
      } else if (form.model === 'suno') {
        // 官方约定：灵感模式（custom=false）下 title / style 会被忽略，
        // 风格只能通过描述文本表达，因此把曲风标签合并进描述。
        const isInspiration = form.mode === 'inspiration';
        const promptText = isInspiration && styleWithLang
          ? `${form.prompt.trim()}${form.prompt.trim() ? '\n\n' : ''}风格：${styleWithLang}`
          : form.prompt;

        result = await generateMusic({
          model: form.model,
          prompt: isInspiration ? promptText : undefined,
          lyrics: form.mode === 'custom' ? form.lyrics : undefined,
          style: form.mode === 'custom' ? styleWithLang || undefined : undefined,
          title: form.title || undefined,
          instrumental: form.instrumental,
          custom: form.mode === 'custom',
          version: form.version,
          vocalGender: form.vocalGender || undefined,
        });
      } else {
        // Flow Music：曲风标签合并进风格描述。
        // 注意用 joinStyleForApi 转成逗号分隔，直接把内部 "|||" 分隔符发给接口是错的。
        const flowStyle = joinStyleForApi(form.style);
        let flowPrompt = form.soundPrompt || '';
        if (flowStyle) {
          flowPrompt = flowPrompt ? `${flowPrompt}, ${flowStyle}` : flowStyle;
        }
        result = await generateMusic({
          model: form.model,
          soundPrompt: flowPrompt || undefined,
          lyrics: form.mode === 'custom' ? form.lyrics : undefined,
          title: form.title || undefined,
          length: form.length || undefined,
        });
      }

      addTask({
        taskId: result.taskId,
        model: form.model,
        mode: form.mode === 'cover' ? 'cover' : form.mode,
        status: 'submitted',
        progress: 0,
        createdAt: Date.now(),
        trackId: result.id,
      });

      setForm((prev) => ({ ...initialForm, model: prev.model }));
      setCoverSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const isSunoInspiration = form.model === 'suno' && form.mode === 'inspiration';
  const coverReady = !!coverSource && (form.model !== 'flowmusic' || !!coverSource.clipId);
  const titleMax = form.model === 'suno' ? SUNO_LIMITS.title : FLOWMUSIC_LIMITS.title;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">音乐生成</h1>

      {/* Model selector */}
      <Card className="p-6 mb-6">
        <label className="text-sm text-theme-secondary mb-3 block">选择模型</label>
        <div className="flex gap-3">
          {(['suno', 'flowmusic'] as const).map((model) => (
            <button
              key={model}
              onClick={() => {
                updateField('model', model);
                setCoverSource(null);
              }}
              className={`flex-1 p-4 rounded-lg border-2 transition ${
                form.model === model
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-surface-700 hover:border-surface-600'
              }`}
            >
              <p className="font-medium">{getModelLabel(model)}</p>
              <p className="text-xs text-theme-secondary mt-1">
                {model === 'suno' ? '通用音乐生成' : '流式音乐生成'}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* Mode selector */}
      <Card className="p-6 mb-6">
        <label className="text-sm text-theme-secondary mb-3 block">生成模式</label>
        <div className="flex gap-3 mb-4">
          {(['inspiration', 'custom', 'cover'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateField('mode', mode)}
              className={`flex-1 p-4 rounded-lg border-2 transition ${
                form.mode === mode
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-surface-700 hover:border-surface-600'
              }`}
            >
              <p className="text-sm font-medium flex items-center gap-2 justify-center">
                {mode === 'inspiration' ? <Sparkles className="w-4 h-4" /> :
                 mode === 'custom' ? <Mic className="w-4 h-4" /> :
                 <Wand2 className="w-4 h-4" />}
                {mode === 'inspiration' ? '灵感模式' :
                 mode === 'custom' ? '自定义模式' : '翻唱模式'}
              </p>
              <p className="text-xs text-theme-secondary mt-1">
                {mode === 'inspiration' ? '描述风格/情绪' :
                 mode === 'custom' ? '提供歌词/曲风' : '重新演绎已有歌曲'}
              </p>
            </button>
          ))}
        </div>

        {form.mode === 'inspiration' ? (
          form.model === 'suno' ? (
            <div>
              <label className="text-sm text-theme-secondary mb-2 block">音乐描述</label>
              <textarea
                value={form.prompt}
                onChange={(e) => updateField('prompt', e.target.value)}
                placeholder="写给谁、什么故事、什么情绪，一句话就能生成..."
                className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 h-24 resize-none"
                maxLength={SUNO_LIMITS.inspirationPrompt}
              />
              <p className="text-xs text-theme-tertiary mt-1 text-right">{form.prompt.length}/{SUNO_LIMITS.inspirationPrompt}</p>
            </div>
          ) : (
            <div>
              <label className="text-sm text-theme-secondary mb-2 block">音乐风格描述</label>
              <textarea
                value={form.soundPrompt}
                onChange={(e) => updateField('soundPrompt', e.target.value)}
                placeholder="描述想要的音乐风格，例如：upbeat pop music with piano"
                className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 h-24 resize-none"
                maxLength={FLOWMUSIC_LIMITS.soundPrompt}
              />
              <p className="text-xs text-theme-tertiary mt-1 text-right">{form.soundPrompt.length}/{FLOWMUSIC_LIMITS.soundPrompt}</p>
            </div>
          )
        ) : form.mode === 'custom' ? (
          <div>
            <label className="text-sm text-theme-secondary mb-2 block">歌词</label>
            <textarea
              value={form.lyrics}
              onChange={(e) => updateField('lyrics', e.target.value)}
              placeholder="[Verse]\n写你的歌词...\n\n[Chorus]\n副歌部分..."
              className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 h-32 resize-none font-mono"
              maxLength={SUNO_LIMITS.lyrics}
            />
            <p className="text-xs text-theme-tertiary mt-1 text-right">{form.lyrics.length}/{SUNO_LIMITS.lyrics}</p>
            {form.model === 'flowmusic' && (
              <div className="mt-3">
                <label className="text-sm text-theme-secondary mb-2 block">风格描述（与歌词至少填一项）</label>
                <input
                  type="text"
                  value={form.soundPrompt}
                  onChange={(e) => updateField('soundPrompt', e.target.value)}
                  placeholder="energetic rock with electric guitar"
                  className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
                  maxLength={FLOWMUSIC_LIMITS.soundPrompt}
                />
              </div>
            )}
          </div>
        ) : (
          /* Cover mode — 只支持本地上传 */
          <div className="space-y-4">
            <div>
              <label className="text-sm text-theme-secondary mb-2 block">源音频（本地上传）</label>
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={handleUpload} loading={uploading} disabled={uploading}>
                  <Upload className="w-4 h-4" />
                  {coverSource ? '重新上传' : '上传音频'}
                </Button>
                {uploading && (
                  <span className="text-xs text-theme-secondary flex items-center gap-1.5">
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    上传并解析中，需要十几秒，请稍候…
                  </span>
                )}
              </div>

              {!uploading && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-theme-tertiary">
                    音频会先托管成公网临时链接供接口取走；非 mp3/wav 会自动转码
                  </p>
                  <p className="text-xs text-amber-500/90">
                    请上传自己录制或已授权的音频：已发行歌曲、明星人声会被上游内容审核拒绝
                  </p>
                </div>
              )}

              {coverSource && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg border border-surface-700 bg-surface-900">
                  <FileAudio className="w-4 h-4 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="text-theme-primary">
                      {coverSource.title || '已上传音频'}
                      {coverSource.duration ? ` · ${Math.round(coverSource.duration)} 秒` : ''}
                    </p>
                    <p className="text-theme-tertiary mt-0.5 break-all">
                      {coverSource.clipId
                        ? `clip_id: ${coverSource.clipId}`
                        : `task_id: ${coverSource.taskId}`}
                    </p>
                  </div>
                </div>
              )}

              <p className="text-xs text-theme-tertiary mt-2">
                引用 ID 在服务器上不会长期保留，所以翻唱只支持上传本地音频后立即改编。
              </p>
            </div>

            {form.model === 'flowmusic' && (
              <div>
                <label className="text-sm text-theme-secondary mb-2 block">
                  改编强度 {form.strength.toFixed(2)}
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={form.strength}
                  onChange={(e) => updateField('strength', parseFloat(e.target.value))}
                  className="w-full accent-brand-500"
                />
                <p className="text-xs text-theme-tertiary mt-1">越大改动越大，0.5 左右为平衡值</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Style tags */}
      {form.mode !== 'cover' && (
        <Card className="p-6 mb-6">
          <label className="text-sm text-theme-secondary mb-3 block">曲风标签</label>
          <StyleTagPicker value={form.style} onChange={(v) => updateField('style', v)} />
          {form.model === 'flowmusic' && (
            <p className="text-xs text-theme-tertiary mt-2">曲风标签会自动合并到风格描述中</p>
          )}
          {isSunoInspiration && (
            <p className="text-xs text-theme-tertiary mt-2">
              Suno 灵感模式不支持独立风格字段，所选标签会自动合并进上方描述
            </p>
          )}
        </Card>
      )}

      {form.mode === 'cover' && (
        <Card className="p-6 mb-6">
          <label className="text-sm text-theme-secondary mb-3 block">目标风格</label>
          <StyleTagPicker value={form.style} onChange={(v) => updateField('style', v)} />
          <p className="text-xs text-theme-tertiary mt-2">
            留空则仅按原标题重制；填写后会作为「改为某风格」的改编指令
          </p>
        </Card>
      )}

      {/* Title and language */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            {isSunoInspiration ? (
              <>
                <label className="text-sm text-theme-secondary mb-2 block">标题</label>
                <p className="text-xs text-theme-tertiary py-3">
                  Suno 灵感模式会忽略自定义标题，生成后由模型自动命名
                </p>
              </>
            ) : (
              <>
                <label className="text-sm text-theme-secondary mb-2 block">标题</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  placeholder="歌曲标题"
                  className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
                  maxLength={titleMax}
                />
                {form.title.length > 0 && (
                  <p className="text-xs text-theme-tertiary mt-1 text-right">{form.title.length}/{titleMax}</p>
                )}
              </>
            )}
          </div>
          {form.model === 'suno' ? (
            <div>
              <label className="text-sm text-theme-secondary mb-2 block">语言</label>
              <select
                value={form.language}
                onChange={(e) => updateField('language', e.target.value)}
                className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
              >
                <option value="">自动</option>
                <option value="Chinese">中文</option>
                <option value="English">英文</option>
                <option value="Japanese">日文</option>
                <option value="Korean">韩文</option>
                <option value="Cantonese">粤语</option>
                <option value="Spanish">西班牙语</option>
                <option value="Russian">俄语</option>
                <option value="French">法语</option>
                <option value="German">德语</option>
                <option value="Portuguese">葡萄牙语</option>
                <option value="Arabic">阿拉伯语</option>
                <option value="Hindi">印地语</option>
                <option value="Italian">意大利语</option>
                <option value="Thai">泰语</option>
                <option value="Vietnamese">越南语</option>
              </select>
            </div>
          ) : (
            <div />
          )}
        </div>
      </Card>

      {/* Advanced options */}
      <Card className="p-6 mb-6">
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm text-theme-secondary hover:text-theme-primary">
            <Settings className="w-4 h-4" />
            高级选项
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {form.model === 'suno' ? (
              <>
                <div>
                  <label className="text-sm text-theme-secondary mb-2 block">模型版本</label>
                  <select
                    value={form.version}
                    onChange={(e) => updateField('version', e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
                  >
                    {SUNO_VERSIONS.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <p className="text-xs text-theme-tertiary mt-1">Suno 公共版本只有 v6 系列</p>
                </div>
                <div>
                  <label className="text-sm text-theme-secondary mb-2 block">人声性别</label>
                  <select
                    value={form.vocalGender}
                    onChange={(e) => updateField('vocalGender', e.target.value)}
                    className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="">自动</option>
                    <option value="Male">男声</option>
                    <option value="Female">女声</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="instrumental"
                    checked={form.instrumental}
                    onChange={(e) => updateField('instrumental', e.target.checked)}
                    className="accent-brand-500"
                  />
                  <label htmlFor="instrumental" className="text-sm text-theme-secondary">
                    纯音乐 (无歌词)
                  </label>
                </div>
              </>
            ) : (
              <div>
                <label className="text-sm text-theme-secondary mb-2 block">生成时长（秒）</label>
                <input
                  type="number"
                  min={1}
                  max={240}
                  value={form.length}
                  onChange={(e) => updateField('length', parseInt(e.target.value) || 60)}
                  className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
                />
                <p className="text-xs text-theme-tertiary mt-1">1 ~ 240 秒</p>
              </div>
            )}
          </div>
        </details>
      </Card>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <X className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <Button
        size="lg"
        className="w-full"
        loading={submitting}
        disabled={form.mode === 'cover' && (!coverReady || uploading)}
        onClick={handleSubmit}
      >
        {form.mode === 'cover' ? <Wand2 className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
        {submitting ? '提交中...' : form.mode === 'cover' ? '开始翻唱' : '开始生成'}
      </Button>

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">生成任务</h2>
          <div className="space-y-3">
            {activeTasks.map((task) => {
              const done = isTerminalStatus(task.status);
              return (
                <Card key={task.taskId} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {task.status === 'completed' ? (
                        <Check className="w-5 h-5 text-green-500" />
                      ) : task.status === 'failed' ? (
                        <X className="w-5 h-5 text-red-500" />
                      ) : (
                        <Loader className="w-5 h-5 text-yellow-500 animate-spin" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {getModelLabel(task.model)} - {getModeLabel(task.mode)}
                        </p>
                        <p className="text-xs text-theme-secondary">
                          {task.status === 'completed' ? '已完成' :
                           task.status === 'failed' ? '失败' :
                           `生成中... ${task.progress ?? 0}%`}
                        </p>
                      </div>
                    </div>
                    <Badge variant={
                      task.status === 'completed' ? 'success' :
                      task.status === 'failed' ? 'danger' : 'warning'
                    }>
                      {task.status}
                    </Badge>
                  </div>
                  {!done && (
                    <div className="mt-3 h-1 bg-surface-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(Math.max(task.progress ?? 0, 0), 100)}%` }}
                      />
                    </div>
                  )}
                  {task.error && !done && (
                    <p className="text-xs text-amber-400 mt-2">状态查询异常：{task.error}</p>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
