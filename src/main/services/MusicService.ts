import { BrowserWindow } from 'electron';
import { prisma } from '../lib/prisma';
import { configureProvider } from '../lib/api-client';
import { ProviderFactory } from '../providers/ProviderFactory';
import { TaskManager } from './TaskManager';
import { downloadToMusicStorage, getLocalAudioUrl, getFilenameFromUrl } from '../utils/music-storage';
import { describeUpstreamError } from '../utils/upstream-error';
import type { MusicProvider, TaskResult } from '../providers/types';
import type { GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams, UploadResult } from '../../shared/types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MusicService {
  private taskManager = TaskManager.getInstance();
  private window: BrowserWindow | null;
  /** 图床上传失败时是否允许回退到 Cloudflare 隧道（默认关闭） */
  private activeUseTunnel = false;

  constructor(window?: BrowserWindow | null) {
    this.window = window ?? null;
  }

  private async loadActiveConfig(): Promise<void> {
    try {
      const config = await prisma.providerConfig.findFirst({ where: { isActive: true } });
      if (config && config.apiKey) {
        configureProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });
        this.activeUseTunnel = config.useTunnel;
      }
    } catch {
      // DB not available yet, use env defaults
    }
  }

  /**
   * 图床（uguu）上传失败时，是否允许回退到 Cloudflare 隧道。
   * 默认关闭：隧道的临时 hostname 需要 DNS 传播时间，第三方回调常因此抓不到文件。
   */
  async shouldUseTunnel(): Promise<boolean> {
    await this.loadActiveConfig();
    return this.activeUseTunnel;
  }

  setWindow(window: BrowserWindow | null) {
    this.window = window;
  }

  private getProvider(model: string): MusicProvider {
    return ProviderFactory.getProvider(model);
  }

  private async downloadAudioLocally(musicItem: { audio_url?: string; title?: string }, trackId: string, index: number): Promise<string | null> {
    if (!musicItem.audio_url) return null;
    try {
      const filename = getFilenameFromUrl(musicItem.audio_url, trackId, index, musicItem.title);
      await downloadToMusicStorage(musicItem.audio_url, filename);
      return getLocalAudioUrl(filename);
    } catch (err) {
      console.error(`Failed to download audio locally for track ${trackId}:`, err);
      return null;
    }
  }

  /**
   * 轮询一个任务直到终态。上传音频这类"必须先拿到 clip_id 才能继续"的
   * 流程会同步等待，其余生成流程仍走 TaskManager 异步轮询。
   */
  private async waitForTask(
    provider: MusicProvider,
    taskId: string,
    timeoutMs: number,
    intervalMs = 5000
  ): Promise<TaskResult> {
    const deadline = Date.now() + timeoutMs;
    await sleep(3000); // 文档建议首次等待约 3 秒

    let last: TaskResult | null = null;
    for (;;) {
      try {
        const status = await provider.getTaskStatus(taskId);
        last = status;
        if (status.status === 'completed' || status.status === 'failed') return status;
      } catch (err) {
        // 429 / 网络抖动不应直接判定失败，超时前继续重试
        if (Date.now() > deadline) throw err;
      }

      if (Date.now() > deadline) {
        if (last) return last;
        throw new Error('等待任务结果超时');
      }
      await sleep(intervalMs);
    }
  }

  private async handleResult(taskId: string, result: TaskResult) {
    if (!result.result?.music?.length) return;

    // Find the original track record (earliest created for this taskId)
    const original = await prisma.musicTrack.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });

    // 词曲分离的产物是一个 zip（只有 file_url，没有 audio_url），单独处理
    if (original?.mode === 'stems') {
      const items = result.result.music.filter(m => m.audio_url || m.file_url || m.url);
      const existing = await prisma.stemTrack.count({ where: { musicTrackId: original.id } });
      if (existing === 0) {
        await prisma.stemTrack.createMany({
          data: items.map((m, i) => ({
            musicTrackId: original.id,
            stemType: m.mime_type === 'application/zip' || m.file_url?.endsWith('.zip')
              ? '分轨包 (zip)'
              : (m.title || `音轨 ${i + 1}`),
            audioUrl: m.audio_url || m.file_url || m.url || null,
            title: m.title || null,
            duration: m.duration ?? null,
          })),
        });
      }
      await prisma.musicTrack.update({
        where: { id: original.id },
        data: { status: 'completed', errorMessage: null, clipId: items[0]?.clip_id ?? original.clipId },
      });
      return;
    }

    // First song: update the original MusicTrack record
    const firstMusic = result.result.music.find(m => m.audio_url);
    if (firstMusic && original) {
      const localAudioUrl = await this.downloadAudioLocally(firstMusic, original.id, 0);
      await prisma.musicTrack.update({
        where: { id: original.id },
        data: {
          status: 'completed',
          errorMessage: null,
          title: firstMusic.title || null,
          audioUrl: firstMusic.audio_url || null,
          localAudioUrl: localAudioUrl,
          videoUrl: firstMusic.video_url || null,
          imageUrl: firstMusic.image_url || firstMusic.image_large_url || null,
          lyrics: firstMusic.lyrics || null,
          duration: firstMusic.duration || null,
          tags: firstMusic.tags ? JSON.stringify(firstMusic.tags) : null,
          clipId: firstMusic.clip_id || null,
        },
      });
    } else {
      await prisma.musicTrack.updateMany({
        where: { taskId },
        data: { status: 'completed', errorMessage: null },
      });
    }

    // Extra songs: create additional MusicTrack records
    let extraIndex = 1;
    for (const m of result.result.music) {
      if (!m.audio_url) continue;
      if (firstMusic && m === firstMusic) continue; // skip the first one (already updated)

      const newTrack = await prisma.musicTrack.create({
        data: {
          taskId,
          model: original?.model || 'suno',
          mode: original?.mode || 'generation',
          status: 'completed',
          title: m.title || null,
          audioUrl: m.audio_url || null,
          videoUrl: m.video_url || null,
          imageUrl: m.image_url || m.image_large_url || null,
          lyrics: m.lyrics || null,
          duration: m.duration || null,
          tags: m.tags ? JSON.stringify(m.tags) : null,
          prompt: original?.prompt || null,
          params: original?.params || null,
          clipId: m.clip_id || null,
        },
      });

      // Download audio locally for extra songs
      const localAudioUrl = await this.downloadAudioLocally(m, newTrack.id, extraIndex);
      if (localAudioUrl) {
        await prisma.musicTrack.update({
          where: { id: newTrack.id },
          data: { localAudioUrl },
        });
      }
      extraIndex++;
    }
  }

  async submitGeneration(params: GenerationParams): Promise<{ taskId: string; id: string }> {
    await this.loadActiveConfig();
    const model = params.model || 'suno';
    const provider = this.getProvider(model);

    const submitResult = await provider.generate(params);

    const track = await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model,
        mode: params.custom ? 'custom' : 'inspiration',
        status: 'submitted',
        prompt: params.prompt || params.lyrics || null,
        style: params.style || null,
        params: JSON.stringify(params),
      },
    });

    this.taskManager.startPolling(
      {
        taskId: submitResult.taskId,
        provider,
        interval: 5000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId, id: track.id };
  }

  /**
   * 定位衍生操作的源曲目：Suno 用 task_id 定位，Flow Music 用 clip_id 定位。
   */
  private async findSourceTrack(params: { taskId: string; clipId?: string }) {
    if (params.clipId) {
      const byClip = await prisma.musicTrack.findFirst({
        where: { clipId: params.clipId },
        orderBy: { createdAt: 'asc' },
      });
      if (byClip) return byClip;
    }
    return prisma.musicTrack.findFirst({ where: { taskId: params.taskId } });
  }

  async submitCover(params: CoverParams): Promise<{ taskId: string }> {
    await this.loadActiveConfig();
    const model = params.model || 'suno';
    const provider = this.getProvider(model);

    const submitResult = await provider.cover!(params);

    const parentTrack = await this.findSourceTrack(params);

    await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model,
        mode: 'cover',
        status: 'submitted',
        prompt: params.prompt || params.gptDescription || null,
        style: params.tags || null,
        parentId: parentTrack?.id || null,
        params: JSON.stringify(params),
      },
    });

    this.taskManager.startPolling(
      {
        taskId: submitResult.taskId,
        provider,
        interval: 5000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId };
  }

  async submitExtend(params: ExtendParams): Promise<{ taskId: string }> {
    await this.loadActiveConfig();
    const model = params.model || 'suno';
    const provider = this.getProvider(model);

    const submitResult = await provider.extend!(params);

    const parentTrack = await this.findSourceTrack(params);

    await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model,
        mode: 'extend',
        status: 'submitted',
        prompt: params.prompt || params.gptDescription || null,
        parentId: parentTrack?.id || null,
        params: JSON.stringify(params),
      },
    });

    this.taskManager.startPolling(
      {
        taskId: submitResult.taskId,
        provider,
        interval: 5000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId };
  }

  async submitStems(params: StemsParams): Promise<{ taskId: string }> {
    await this.loadActiveConfig();
    const model = params.model || 'suno';
    const provider = this.getProvider(model);

    const submitResult = await provider.separateStems!(params);

    const parentTrack = await this.findSourceTrack(params);

    await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model,
        mode: 'stems',
        status: 'submitted',
        parentId: parentTrack?.id || null,
        params: JSON.stringify(params),
      },
    });

    this.taskManager.startPolling(
      {
        taskId: submitResult.taskId,
        provider,
        interval: 5000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId };
  }

  async submitMV(params: MVParams): Promise<{ taskId: string }> {
    await this.loadActiveConfig();
    const model = params.model || 'suno';
    const provider = this.getProvider(model);

    const submitResult = await provider.generateMV!(params);

    const parentTrack = await this.findSourceTrack(params);

    await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model,
        mode: 'mv',
        status: 'submitted',
        parentId: parentTrack?.id || null,
        params: JSON.stringify(params),
      },
    });

    this.taskManager.startPolling(
      {
        taskId: submitResult.taskId,
        provider,
        interval: 5000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId };
  }

  async getTaskStatus(taskId: string): Promise<TaskResult> {
    // Try to find the track in DB to know which provider
    const track = await prisma.musicTrack.findFirst({ where: { taskId } });
    const provider = this.getProvider(track?.model || 'suno');
    return provider.getTaskStatus(taskId);
  }

  async generateAlignedLyrics(params: { taskId: string; audioIndex?: number }): Promise<{ filtered: string; full: string }> {
    await this.loadActiveConfig();
    const provider = this.getProvider('suno');
    const submitResult = await provider.alignedLyrics!({ taskId: params.taskId, audioIndex: params.audioIndex ?? 1 });

    // Fetch original lyrics from DB
    const originalTrack = await prisma.musicTrack.findFirst({
      where: { taskId: params.taskId },
      orderBy: { createdAt: 'asc' },
    });
    const originalLyricsText = originalTrack?.prompt || originalTrack?.lyrics || '';

    // Poll synchronously until completed
    const alignedTaskId = submitResult.taskId;
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const status = await provider.getTaskStatus(alignedTaskId);

      if (status.status === 'completed') {
        let fullLrc = '';
        let filteredLrc = '';

        if (status.rawAlignment && status.rawAlignment.length > 0) {
          // Build lines from alignment data (preserving raw text)
          const alignedLines: { time: number; text: string }[] = [];
          let currentLine = '';
          let lineStartTime = 0;

          for (const item of status.rawAlignment) {
            const word = item.word;
            if (word.includes('\n')) {
              const parts = word.split('\n');
              for (let p = 0; p < parts.length; p++) {
                if (parts[p]) currentLine += parts[p];
                if (p < parts.length - 1) {
                  if (currentLine.trim()) {
                    alignedLines.push({ time: lineStartTime, text: currentLine.trim() });
                  }
                  currentLine = '';
                  lineStartTime = item.start_s;
                }
              }
            } else {
              if (!currentLine) lineStartTime = item.start_s;
              currentLine += word;
            }
          }
          if (currentLine.trim()) {
            alignedLines.push({ time: lineStartTime, text: currentLine.trim() });
          }

          // Full version: use original lyrics lines with timestamps from alignment
          if (originalLyricsText) {
            const origLines = originalLyricsText.split('\n').filter(l => l.trim());
            let alignIdx = 0;
            const lrcLines: string[] = [];

            for (const origLine of origLines) {
              const trimmed = origLine.trim();
              if (!trimmed) continue;

              // Find matching alignment line
              let bestTime = alignedLines[alignIdx]?.time ?? 0;
              // Try to match by looking for the first few chars of origLine in alignedLines
              const searchStr = trimmed.replace(/[\[\]]/g, '').slice(0, 10).trim();
              for (let j = alignIdx; j < alignedLines.length; j++) {
                const alignedClean = alignedLines[j].text.replace(/[\[\]]/g, '').trim();
                if (alignedClean.startsWith(searchStr) || searchStr.startsWith(alignedClean.slice(0, 10))) {
                  bestTime = alignedLines[j].time;
                  alignIdx = j + 1;
                  break;
                }
              }

              const min = Math.floor(bestTime / 60);
              const sec = bestTime % 60;
              const timeStr = `${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
              lrcLines.push(`[${timeStr}]${trimmed}`);
            }
            fullLrc = lrcLines.join('\n');
          } else {
            // Fallback: use raw alignment lines
            fullLrc = alignedLines
              .map(l => {
                const min = Math.floor(l.time / 60);
                const sec = l.time % 60;
                const timeStr = `${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
                return `[${timeStr}]${l.text}`;
              })
              .join('\n');
          }

          // Filtered version: remove style/prompt lines
          const filteredLines = alignedLines.filter(l => {
            const text = l.text.replace(/\[.*?\]/g, '').trim();
            if (!text) return false;
            if (/style\s*tag/i.test(text)) return false;
            // Check if line matches original lyrics
            if (originalLyricsText) {
              const cleanOriginal = originalLyricsText.replace(/\[.*?\]/g, '').replace(/Style\s*tag:.*/gi, '');
              const lineWords = text.split(/[\s,]+/).filter(w => w.length > 0);
              if (lineWords.length === 0) return false;
              const matchingWords = lineWords.filter(w => cleanOriginal.includes(w));
              return matchingWords.length / lineWords.length >= 0.3;
            }
            return true;
          });

          filteredLrc = filteredLines
            .map(l => {
              const min = Math.floor(l.time / 60);
              const sec = l.time % 60;
              const timeStr = `${String(min).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
              return `[${timeStr}]${l.text}`;
            })
            .join('\n');
        } else if (status.result?.music?.[0]?.lyrics) {
          fullLrc = status.result.music[0].lyrics;
          filteredLrc = fullLrc;
        }

        // Don't save to DB - keep original lyrics in the detail page unchanged
        return { filtered: filteredLrc, full: fullLrc };
      }

      if (status.status === 'failed') {
        throw new Error(status.error?.message || '歌词时间轴生成失败');
      }
    }

    throw new Error('歌词时间轴生成超时');
  }

  /**
   * 上传外部音频，并等到任务完成、拿到 clip_id 后返回。
   * Flow Music 与 Suno 的上传端点不同，必须按所选模型路由。
   */
  async submitUpload(audioUrl: string, model = 'suno'): Promise<UploadResult> {
    await this.loadActiveConfig();
    const provider = this.getProvider(model);

    if (!provider.upload) {
      throw new Error(`${provider.name} 不支持上传音频`);
    }

    const submitResult = await provider.upload(audioUrl);
    console.log(`[upload] 已提交给上游 (model=${model}): task=${submitResult.taskId}`);

    const track = await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model,
        mode: 'upload',
        status: 'submitted',
        params: JSON.stringify({ audioUrl }),
      },
    });

    // 上传本身也是异步任务：只有完成后才能从 result.music[0].clip_id 拿到源音乐标识，
    // 后续翻唱 / 续写 / 分轨都基于这个 clip_id。
    let finalStatus: TaskResult;
    try {
      finalStatus = await this.waitForTask(provider, submitResult.taskId, 180000);
    } catch (err) {
      const msg = describeUpstreamError(
        err instanceof Error ? err.message : '音频导入失败',
        { taskId: submitResult.taskId, stage: '导入音频' }
      );
      await prisma.musicTrack
        .update({ where: { id: track.id }, data: { status: 'failed', errorMessage: msg } })
        .catch(() => {});
      throw new Error(msg);
    }

    if (finalStatus.status !== 'completed') {
      // 上游把失败原因放在 result.error 里（例如内容政策拦截），打印原始体方便排查
      console.error(
        `[upload] 上游导入任务失败 task=${submitResult.taskId}: ${JSON.stringify(finalStatus.error ?? {})}`
      );
      const msg = describeUpstreamError(finalStatus.error?.message || '音频导入失败', {
        taskId: submitResult.taskId,
        stage: '导入音频',
      });
      await prisma.musicTrack
        .update({ where: { id: track.id }, data: { status: 'failed', errorMessage: msg } })
        .catch(() => {});
      throw new Error(msg);
    }

    const item = finalStatus.result?.music?.find(m => m.clip_id || m.audio_url || m.url);
    const clipId = item?.clip_id ?? null;
    const remoteAudioUrl = item?.audio_url ?? item?.url ?? null;
    const duration = item?.duration ?? null;
    const title = item?.title ?? null;

    // 本地再存一份：既方便离线播放，也让详情页能"重新上传本地文件换算新 clip_id"
    const localAudioUrl = remoteAudioUrl
      ? await this.downloadAudioLocally(
          { audio_url: remoteAudioUrl, title: title ?? undefined },
          track.id,
          0
        )
      : null;

    await prisma.musicTrack.update({
      where: { id: track.id },
      data: {
        status: 'completed',
        errorMessage: null,
        clipId,
        audioUrl: remoteAudioUrl,
        localAudioUrl,
        title,
        duration,
      },
    });

    return {
      taskId: submitResult.taskId,
      trackId: track.id,
      clipId,
      audioUrl: remoteAudioUrl,
      title,
      duration,
    };
  }
}