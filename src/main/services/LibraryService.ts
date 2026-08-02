import { prisma } from '../lib/prisma';
import { deleteLocalFileByUrl } from '../utils/music-storage';
import type { LibraryFilter, LibraryResult, MusicTrackData } from '../../shared/types';

export class LibraryService {
  async list(filter: LibraryFilter): Promise<LibraryResult> {
    const where: Record<string, unknown> = {};
    const conditions: Record<string, unknown>[] = [];

    if (filter.search) {
      conditions.push(
        { title: { contains: filter.search } },
        { prompt: { contains: filter.search } },
        { lyrics: { contains: filter.search } },
        { style: { contains: filter.search } },
      );
    }
    if (filter.model) where.model = filter.model;
    if (filter.mode) where.mode = filter.mode;
    if (filter.status) where.status = filter.status;

    if (conditions.length > 0) {
      where.OR = conditions;
    }

    const page = filter.page || 1;
    const pageSize = filter.pageSize || 20;

    const [tracks, total] = await Promise.all([
      prisma.musicTrack.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { stems: true },
      }),
      prisma.musicTrack.count({ where }),
    ]);

    return {
      tracks: tracks.map(t => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        stems: t.stems.map(s => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
        })),
      })) as unknown as MusicTrackData[],
      total,
      page,
    };
  }

  async getById(id: string): Promise<MusicTrackData | null> {
    const track = await prisma.musicTrack.findUnique({
      where: { id },
      include: {
        stems: true,
        parent: true,
        children: {
          include: { stems: true },
        },
      },
    });

    if (!track) return null;

    return {
      ...track,
      createdAt: track.createdAt.toISOString(),
      updatedAt: track.updatedAt.toISOString(),
      stems: track.stems.map(s => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
      parent: track.parent ? {
        ...track.parent,
        createdAt: track.parent.createdAt.toISOString(),
        updatedAt: track.parent.updatedAt.toISOString(),
        stems: [],
        children: [],
        parent: null,
        parentId: null,
      } : null,
      children: track.children.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        stems: c.stems.map(s => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
        })),
      })),
    } as unknown as MusicTrackData;
  }

  async delete(id: string): Promise<void> {
    // Clean up local audio file if it exists
    const track = await prisma.musicTrack.findUnique({ where: { id }, select: { localAudioUrl: true } });
    if (track?.localAudioUrl) {
      deleteLocalFileByUrl(track.localAudioUrl);
    }
    await prisma.musicTrack.delete({ where: { id } });
  }
}