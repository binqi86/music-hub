import React, { useEffect, useState, useCallback } from 'react';
import { Search, Music, Trash2, Play } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { usePlayerStore } from '../stores/player-store';
import { getLibrary, deleteTrack } from '../lib/electron-api';
import { formatDuration, formatDate, getModelLabel, getModeLabel, getStatusColor } from '../lib/utils';
import type { MusicTrackData } from '../../shared/types';
import type { Page, PageParams } from '../App';

interface LibraryProps {
  onNavigate: (page: Page, params?: PageParams) => void;
}

export function Library({ onNavigate }: LibraryProps) {
  const [tracks, setTracks] = useState<MusicTrackData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { play } = usePlayerStore();
  const pageSize = 20;

  const fetchLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getLibrary({
        search: search || undefined,
        model: modelFilter || undefined,
        page,
        pageSize,
      });
      setTracks(result.tracks);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch library:', err);
    } finally {
      setLoading(false);
    }
  }, [search, modelFilter, page]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteTrack(deleteId);
      setTracks((prev) => prev.filter((t) => t.id !== deleteId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      console.error('Failed to delete:', err);
    }
    setDeleteId(null);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">我的曲库</h1>
        <span className="text-sm text-theme-secondary">共 {total} 首</span>
      </div>

      {/* Search and filter */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-secondary" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索歌曲标题、描述..."
            className="w-full bg-surface-800 border border-surface-700 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={modelFilter}
          onChange={(e) => { setModelFilter(e.target.value); setPage(1); }}
          className="bg-surface-800 border border-surface-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500"
        >
          <option value="">全部模型</option>
          <option value="suno">Suno</option>
          <option value="flowmusic">Flow Music</option>
        </select>
      </div>

      {/* Track list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : tracks.length === 0 ? (
        <Card className="p-12 text-center">
          <Music className="w-12 h-12 text-surface-600 mx-auto mb-3" />
          <p className="text-theme-secondary">曲库为空</p>
          <Button className="mt-4" onClick={() => onNavigate('generate')}>
            去生成
          </Button>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {tracks.map((track) => (
              <Card
                key={track.id}
                className="p-3 flex items-center gap-4 hover:bg-surface-750 transition-colors"
              >
                {/* Cover */}
                <div
                  className="w-12 h-12 rounded-lg bg-surface-700 flex-shrink-0 overflow-hidden cursor-pointer"
                  onClick={() => play(track)}
                >
                  {track.imageUrl ? (
                    <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play className="w-4 h-4 text-theme-secondary" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate('track', { id: track.id })}>
                  <p className="text-sm font-medium truncate">{track.title || 'Untitled'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="info">{getModelLabel(track.model)}</Badge>
                    <Badge>{getModeLabel(track.mode)}</Badge>
                    <span className="text-xs text-theme-tertiary">{formatDuration(track.duration)}</span>
                    <span className="text-xs text-theme-tertiary">{formatDate(track.createdAt)}</span>
                  </div>
                </div>

                {/* Status */}
                <div className={`w-2 h-2 rounded-full ${getStatusColor(track.status)}`} />

                {/* Actions */}
                <button
                  onClick={() => setDeleteId(track.id)}
                  className="text-theme-tertiary hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </Button>
              <span className="text-sm text-theme-secondary">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      )}

      {/* Delete confirmation */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="确认删除"
      >
        <p className="text-theme-secondary mb-6">确定要删除这首歌曲吗？此操作不可恢复。</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            取消
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            删除
          </Button>
        </div>
      </Modal>
    </div>
  );
}