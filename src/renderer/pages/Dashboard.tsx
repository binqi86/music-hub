import React, { useEffect, useState } from 'react';
import { Sparkles, Clock, Music } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { usePlayerStore } from '../stores/player-store';
import { getLibrary } from '../lib/electron-api';
import { formatDuration, formatDate, getModelLabel, getModeLabel, getStatusColor } from '../lib/utils';
import type { MusicTrackData } from '../../shared/types';
import type { Page, PageParams } from '../App';

interface DashboardProps {
  onNavigate: (page: Page, params?: PageParams) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [recentTracks, setRecentTracks] = useState<MusicTrackData[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickPrompt, setQuickPrompt] = useState('');
  const { play } = usePlayerStore();

  useEffect(() => {
    getLibrary({ pageSize: 6, status: 'completed' })
      .then((result) => setRecentTracks(result.tracks))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleQuickGenerate = () => {
    if (quickPrompt.trim()) {
      onNavigate('generate');
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Music Hub</h1>
        <p className="text-theme-secondary">AI 音乐创作工作室</p>
      </div>

      {/* Quick generate */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-brand-500" />
          快速生成
        </h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickGenerate()}
            placeholder="描述你想生成的音乐风格、情绪、主题..."
            className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 transition"
          />
          <Button onClick={handleQuickGenerate}>
            生成
          </Button>
        </div>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card
          hover
          className="p-4 flex items-center gap-3"
          onClick={() => onNavigate('generate')}
        >
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium">音乐生成</p>
            <p className="text-xs text-theme-secondary">开始创作</p>
          </div>
        </Card>
        <Card
          hover
          className="p-4 flex items-center gap-3"
          onClick={() => onNavigate('library')}
        >
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Music className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium">我的曲库</p>
            <p className="text-xs text-theme-secondary">浏览作品</p>
          </div>
        </Card>
        <Card hover className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <Clock className="w-5 h-5 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-medium">最近生成</p>
            <p className="text-xs text-theme-secondary">查看进度</p>
          </div>
        </Card>
      </div>

      {/* Recent tracks */}
      <div>
        <h2 className="text-lg font-semibold mb-4">最近作品</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : recentTracks.length === 0 ? (
          <Card className="p-12 text-center">
            <Music className="w-12 h-12 text-surface-600 mx-auto mb-3" />
            <p className="text-theme-secondary">还没有作品，开始你的第一个创作吧</p>
            <Button className="mt-4" onClick={() => onNavigate('generate')}>
              开始创作
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {recentTracks.map((track) => (
              <Card key={track.id} hover className="overflow-hidden" onClick={() => play(track)}>
                <div className="aspect-square bg-surface-700 relative">
                  {track.imageUrl ? (
                    <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-8 h-8 text-theme-tertiary" />
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2">
                    <Badge variant="info">{getModelLabel(track.model)}</Badge>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium truncate">{track.title || 'Untitled'}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-theme-secondary">{formatDate(track.createdAt)}</span>
                    <span className="text-xs text-theme-secondary">{formatDuration(track.duration)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}