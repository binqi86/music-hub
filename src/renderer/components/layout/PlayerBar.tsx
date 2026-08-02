import React, { useRef, useEffect } from 'react';
import { usePlayerStore } from '../../stores/player-store';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

export function PlayerBar() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    currentTime,
    duration,
    togglePlay,
    next,
    prev,
    setVolume,
    toggleMute,
    seek,
    setIsPlaying,
    setCurrentTime,
    setDuration,
  } = usePlayerStore();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && currentTrack?.audioUrl) {
      const audioSrc = currentTrack.localAudioUrl || currentTrack.audioUrl;
      audio.src = audioSrc;
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    next();
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    if (audioRef.current) {
      const newTime = percent * duration;
      audioRef.current.currentTime = newTime;
      seek(newTime);
    }
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentTrack) {
    return (
      <div className="h-16 bg-surface-950 border-t border-surface-700/30 flex items-center justify-center">
        <p className="text-theme-secondary text-sm">选择一首歌开始播放</p>
      </div>
    );
  }

  return (
    <div className="h-16 bg-surface-950 border-t border-surface-700/30 flex items-center px-4 gap-4">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Track info */}
      <div className="flex items-center gap-3 w-48">
        {currentTrack.imageUrl && (
          <img
            src={currentTrack.imageUrl}
            alt=""
            className="w-10 h-10 rounded object-cover"
          />
        )}
        <div className="truncate">
          <p className="text-sm font-medium truncate">{currentTrack.title || 'Untitled'}</p>
          <p className="text-xs text-theme-secondary truncate">{currentTrack.model}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1">
        <div className="flex items-center gap-3">
          <button onClick={prev} className="text-theme-secondary hover:text-theme-primary">
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button onClick={next} className="text-theme-secondary hover:text-theme-primary">
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Seek bar */}
        <div className="w-full max-w-lg flex items-center gap-2 text-xs text-theme-secondary">
          <span>{formatTime(currentTime)}</span>
          <div
            className="flex-1 h-1 bg-surface-700 rounded-full cursor-pointer group"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-brand-500 rounded-full relative group-hover:h-1.5 transition-all"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 w-32 justify-end">
        <button onClick={toggleMute} className="text-theme-secondary hover:text-theme-primary">
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-20 h-1 accent-brand-500"
        />
      </div>
    </div>
  );
}