import React, { useState, useEffect } from 'react';
import { Sparkles, Music, Mic, Upload, Settings, X, Check, Loader, Wand2, Search } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { StyleTagPicker } from '../components/ui/StyleTagPicker';
import { useGenerationStore } from '../stores/generation-store';
import { generateMusic, generateCover, uploadAudio, getLibrary } from '../lib/electron-api';
import { getModelLabel, getModeLabel } from '../lib/utils';
import type { MusicTrackData } from '../../shared/types';

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
  version: 'v5.5',
  vocalGender: '',
  language: '',
  duration: 0,
  bpm: '',
  length: 60,
};

export function Generate() {
  const [form, setForm] = useState<GenerationFormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverSourceId, setCoverSourceId] = useState('');
  const [libraryTracks, setLibraryTracks] = useState<MusicTrackData[]>([]);
  const [coverSearch, setCoverSearch] = useState('');
  const { activeTasks, addTask, updateTask, removeTask } = useGenerationStore();

  // Load library tracks for cover mode
  useEffect(() => {
    if (form.mode === 'cover') {
      getLibrary({ pageSize: 50, status: 'completed', search: coverSearch || undefined })
        .then((result) => setLibraryTracks(result.tracks))
        .catch(() => {});
    }
  }, [form.mode, coverSearch]);

  const updateField = <K extends keyof GenerationFormData>(
    key: K,
    value: GenerationFormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleUpload = async () => {
    try {
      const result = await uploadAudio();
      if (result) {
        setCoverSourceId(result.taskId);
      }
    } catch (err) {
      setError('上传失败');
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (form.mode === 'cover') {
      if (!coverSourceId.trim()) {
        setError('请选择源歌曲或上传音频文件');
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

    setSubmitting(true);
    try {
      let styleWithLang = form.style;
      if (form.language) {
        styleWithLang = styleWithLang ? `${form.language}, ${styleWithLang}` : form.language;
      }

      let result: { taskId: string; id?: string };

      if (form.mode === 'cover') {
        result = await generateCover({
          taskId: coverSourceId,
          tags: styleWithLang || undefined,
          title: form.title || undefined,
          vocalGender: form.vocalGender || undefined,
          model: form.model,
        });
      } else if (form.model === 'suno') {
        result = await generateMusic({
          model: form.model,
          prompt: form.mode === 'inspiration' ? form.prompt : undefined,
          lyrics: form.mode === 'custom' ? form.lyrics : undefined,
          style: styleWithLang || undefined,
          title: form.title || undefined,
          instrumental: form.instrumental,
          custom: form.mode === 'custom',
          version: form.version,
          vocalGender: form.vocalGender || undefined,
        });
      } else {
        // Flow Music
        // Combine style tags into sound_prompt
        let flowPrompt = form.soundPrompt || '';
        if (form.style) {
          flowPrompt = flowPrompt
            ? `${flowPrompt}, ${form.style}`
            : form.style;
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

      setForm(initialForm);
      setCoverSourceId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  // Listen for task updates
  useEffect(() => {
    const cleanup = window.electronAPI.onTaskUpdate((data) => {
      updateTask(data.taskId, {
        status: data.status,
        progress: data.progress,
      });

      if (data.status === 'completed' || data.status === 'failed') {
        setTimeout(() => removeTask(data.taskId), 10000);
      }
    });
    return cleanup;
  }, []);

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
              onClick={() => updateField('model', model)}
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
                maxLength={500}
              />
              <p className="text-xs text-theme-tertiary mt-1 text-right">{form.prompt.length}/500</p>
            </div>
          ) : (
            <div>
              <label className="text-sm text-theme-secondary mb-2 block">音乐风格描述</label>
              <textarea
                value={form.soundPrompt}
                onChange={(e) => updateField('soundPrompt', e.target.value)}
                placeholder="描述想要的音乐风格，例如：upbeat pop music with piano"
                className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 h-24 resize-none"
                maxLength={500}
              />
              <p className="text-xs text-theme-tertiary mt-1 text-right">{form.soundPrompt.length}/500</p>
            </div>
          )
        ) : form.mode === 'custom' ? (
          <div>
            <label className="text-sm text-theme-secondary mb-2 block">
              {form.model === 'suno' ? '歌词' : '歌词'}
            </label>
            <textarea
              value={form.lyrics}
              onChange={(e) => updateField('lyrics', e.target.value)}
              placeholder="[Verse]\n写你的歌词...\n\n[Chorus]\n副歌部分..."
              className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 h-32 resize-none font-mono"
            />
          </div>
        ) : (
          /* Cover mode */
          <div className="space-y-4">
            <div>
              <label className="text-sm text-theme-secondary mb-2 block">源歌曲</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={coverSourceId}
                  onChange={(e) => setCoverSourceId(e.target.value)}
                  placeholder="输入任务 ID 或从下方选择..."
                  className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
                />
                <Button variant="primary" onClick={handleUpload}>
                  <Upload className="w-4 h-4" />
                  上传音频
                </Button>
              </div>
            </div>

            {/* Library tracks */}
            <div>
              <label className="text-xs text-theme-secondary mb-1 block">从曲库选择:</label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-tertiary" />
                <input
                  type="text"
                  value={coverSearch}
                  onChange={(e) => setCoverSearch(e.target.value)}
                  placeholder="搜索歌曲..."
                  className="w-full bg-surface-900 border border-surface-700 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
              {libraryTracks.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1 border border-surface-700 rounded-lg p-2">
                  {libraryTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => setCoverSourceId(track.taskId)}
                      className={`block w-full text-left text-xs px-3 py-2 rounded transition-colors ${
                        coverSourceId === track.taskId
                          ? 'bg-brand-500/20 text-brand-300'
                          : 'text-theme-secondary hover:bg-surface-700 hover:text-theme-primary'
                      }`}
                    >
                      {track.title || 'Untitled'} — {getModelLabel(track.model)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-theme-tertiary">无匹配结果</p>
              )}
            </div>
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
        </Card>
      )}

      {form.mode === 'cover' && (
        <Card className="p-6 mb-6">
          <label className="text-sm text-theme-secondary mb-3 block">目标风格</label>
          <StyleTagPicker value={form.style} onChange={(v) => updateField('style', v)} />
        </Card>
      )}

      {/* Title and language */}
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-theme-secondary mb-2 block">标题</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="歌曲标题"
              className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
            />
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
            <div /> // Flow Music 不需要 BPM
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
                    <option value="v5.5">v5.5</option>
                    <option value="v5">v5</option>
                    <option value="v4.5">v4.5</option>
                    <option value="v4">v4</option>
                  </select>
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
            {activeTasks.map((task) => (
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
                         `生成中... ${task.progress}%`}
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
                {task.status !== 'completed' && task.status !== 'failed' && (
                  <div className="mt-3 h-1 bg-surface-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-500 rounded-full transition-all duration-500"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}