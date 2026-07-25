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