import { BrowserWindow } from 'electron';
import { prisma } from '../lib/prisma';
import { configureProvider } from '../lib/api-client';
import { ProviderFactory } from '../providers/ProviderFactory';
import { TaskManager } from './TaskManager';
import type { MusicProvider, TaskResult } from '../providers/types';
import type { GenerationParams, CoverParams, ExtendParams, StemsParams, MVParams } from '../../shared/types';

export class MusicService {
  private taskManager = TaskManager.getInstance();
  private window: BrowserWindow | null;
  private activeUseTunnel = true;

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

  private async handleResult(taskId: string, result: TaskResult) {
    if (!result.result?.music?.length) return;

    // Find the original track record (earliest created for this taskId)
    const original = await prisma.musicTrack.findFirst({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });

    // First song: update the original MusicTrack record
    const firstMusic = result.result.music.find(m => m.audio_url);
    if (firstMusic && original) {
      await prisma.musicTrack.update({
        where: { id: original.id },
        data: {
          status: 'completed',
          title: firstMusic.title || null,
          audioUrl: firstMusic.audio_url || null,
          videoUrl: firstMusic.video_url || null,
          imageUrl: firstMusic.image_url || firstMusic.image_large_url || null,
          lyrics: firstMusic.lyrics || null,
          duration: firstMusic.duration || null,
          tags: firstMusic.tags ? JSON.stringify(firstMusic.tags) : null,
        },
      });
    } else {
      await prisma.musicTrack.updateMany({
        where: { taskId },
        data: { status: 'completed' },
      });
    }

    // Extra songs: create additional MusicTrack records
    for (const m of result.result.music) {
      if (!m.audio_url) continue;
      if (firstMusic && m === firstMusic) continue; // skip the first one (already updated)

      await prisma.musicTrack.create({
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
        },
      });
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
        interval: 3000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId, id: track.id };
  }

  async submitCover(params: CoverParams): Promise<{ taskId: string }> {
    await this.loadActiveConfig();
    const model = params.model || 'suno';
    const provider = this.getProvider(model);

    const submitResult = await provider.cover!(params);

    const parentTrack = await prisma.musicTrack.findFirst({ where: { taskId: params.taskId } });

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
        interval: 3000,
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

    const parentTrack = await prisma.musicTrack.findFirst({ where: { taskId: params.taskId } });

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
        interval: 3000,
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

    const parentTrack = await prisma.musicTrack.findFirst({ where: { taskId: params.taskId } });

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
        interval: 3000,
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

    const parentTrack = await prisma.musicTrack.findFirst({ where: { taskId: params.taskId } });

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
        interval: 3000,
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

  async submitUpload(audioUrl: string): Promise<{ taskId: string }> {
    await this.loadActiveConfig();
    // Use Suno upload endpoint by default
    const provider = this.getProvider('suno');
    const submitResult = await provider.upload!(audioUrl);

    await prisma.musicTrack.create({
      data: {
        taskId: submitResult.taskId,
        model: 'suno',
        mode: 'upload',
        status: 'submitted',
        params: JSON.stringify({ audioUrl }),
      },
    });

    this.taskManager.startPolling(
      {
        taskId: submitResult.taskId,
        provider,
        interval: 3000,
        onComplete: (result) => this.handleResult(submitResult.taskId, result),
        onError: () => {},
      },
      this.window ?? undefined
    );

    return { taskId: submitResult.taskId };
  }
}