import { create } from 'zustand';
import type { MusicTrackData } from '../../shared/types';

interface PlayerState {
  currentTrack: MusicTrackData | null;
  queue: MusicTrackData[];
  queueIndex: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  currentTime: number;
  duration: number;

  play: (track: MusicTrackData) => void;
  pause: () => void;
  resume: () => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setQueue: (tracks: MusicTrackData[], index: number) => void;
  addToQueue: (track: MusicTrackData) => void;
  clearQueue: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  volume: 0.7,
  isMuted: false,
  currentTime: 0,
  duration: 0,

  play: (track) => set({ currentTrack: track, isPlaying: true, currentTime: 0, duration: 0 }),

  pause: () => set({ isPlaying: false }),

  resume: () => set({ isPlaying: true }),

  togglePlay: () => {
    const { isPlaying, currentTrack } = get();
    if (!currentTrack) return;
    set({ isPlaying: !isPlaying });
  },

  next: () => {
    const { queue, queueIndex } = get();
    if (queueIndex < queue.length - 1) {
      const nextTrack = queue[queueIndex + 1];
      set({ currentTrack: nextTrack, queueIndex: queueIndex + 1, isPlaying: true, currentTime: 0, duration: 0 });
    } else {
      set({ isPlaying: false });
    }
  },

  prev: () => {
    const { queue, queueIndex } = get();
    if (queueIndex > 0) {
      const prevTrack = queue[queueIndex - 1];
      set({ currentTrack: prevTrack, queueIndex: queueIndex - 1, isPlaying: true, currentTime: 0, duration: 0 });
    }
  },

  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  seek: (time) => set({ currentTime: time }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),

  setQueue: (tracks, index) => {
    set({
      queue: tracks,
      queueIndex: index,
      currentTrack: tracks[index],
      isPlaying: true,
      currentTime: 0,
      duration: 0,
    });
  },

  addToQueue: (track) => {
    const { queue } = get();
    set({ queue: [...queue, track] });
  },

  clearQueue: () => set({ queue: [], queueIndex: -1 }),
}));