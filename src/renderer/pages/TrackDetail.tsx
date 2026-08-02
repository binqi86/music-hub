import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, Music, Wand2, Scissors, Video, Play, Pause, FileText } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { StyleTagPicker } from '../components/ui/StyleTagPicker';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { usePlayerStore } from '../stores/player-store';
import { getTrack, generateCover, generateExtend, separateStems, generateAlignedLyrics, downloadFile, copyLocalFile } from '../lib/electron-api';
import { formatDuration, getModelLabel, getModeLabel } from '../lib/utils';
import type { MusicTrackData, StemTrackData } from '../../shared/types';
import type { Page, PageParams } from '../App';

interface TrackDetailProps {
  trackId: string;
  onNavigate: (page: Page, params?: PageParams) => void;
}

export function TrackDetail({ trackId, onNavigate }: TrackDetailProps) {
  const [track, setTrack] = useState<MusicTrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [alignedLyricsLoading, setAlignedLyricsLoading] = useState(false);
  const [coverStyle, setCoverStyle] = useState('');
  const [extendPrompt, setExtendPrompt] = useState('');
  const { play, currentTrack, isPlaying, togglePlay } = usePlayerStore();

  useEffect(() => {
    getTrack(trackId)
      .then(setTrack)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [trackId]);

  const handleDownload = async () => {
    if (!track?.audioUrl) return;
    const filename = `${track.title || 'music'}.mp3`;
    try {
      const path = track.localAudioUrl
        ? await copyLocalFile(track.localAudioUrl, filename)
        : await downloadFile(track.audioUrl, filename);
      alert(`下载完成: ${path}`);
    } catch (err) {
      alert('下载失败');
    }
  };

  const handleCover = async () => {
    if (!track) return;
    setActionLoading(true);
    try {
      const apiStyle = coverStyle.replace(/\|\|\|/g, ', ');
      await generateCover({
        taskId: track.taskId,
        tags: apiStyle,
        gptDescription: apiStyle,
      });
      setActionModal(null);
      setCoverStyle('');
    } catch (err) {
      alert('翻唱失败');
    }
    setActionLoading(false);
  };

  const handleExtend = async () => {
    if (!track) return;
    setActionLoading(true);
    try {
      await generateExtend({
        taskId: track.taskId,
        continueAt: track.duration ? Math.floor(track.duration / 2) : 30,
        gptDescription: extendPrompt,
      });
      setActionModal(null);
      setExtendPrompt('');
    } catch (err) {
      alert('续写失败');
    }
    setActionLoading(false);
  };

  const handleStems = async () => {
    if (!track) return;
    setActionLoading(true);
    try {
      await separateStems({ taskId: track.taskId, stemType: 'lead_vocal' });
      setActionModal(null);
    } catch (err) {
      alert('音轨分离失败');
    }
    setActionLoading(false);
  };

  const handleAlignedLyrics = async (mode: 'filtered' | 'full') => {
    if (!track) return;
    setAlignedLyricsLoading(true);
    setActionModal(null);
    try {
      const result = await generateAlignedLyrics({ taskId: track.taskId });
      const lrcText = result[mode];
      if (!lrcText) {
        alert('未能获取到歌词时间轴');
        return;
      }
      const suffix = mode === 'filtered' ? '（仅歌词）' : '（含标记）';
      const filename = `${track.title || 'lyrics'}${suffix}.lrc`;
      const blob = new Blob([lrcText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : '生成歌词时间轴失败');
    }
    setAlignedLyricsLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!track) {
    return (
      <div className="text-center py-20">
        <p className="text-theme-secondary">曲目未找到</p>
        <Button className="mt-4" onClick={() => onNavigate('library')}>
          返回曲库
        </Button>
      </div>
    );
  }

  const isPlayingThis = currentTrack?.id === track.id;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => onNavigate('library')}
        className="flex items-center gap-2 text-theme-secondary hover:text-theme-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        返回曲库
      </button>

      {/* Track header */}
      <div className="flex gap-6 mb-8">
        <div className="w-48 h-48 rounded-xl bg-surface-700 flex-shrink-0 overflow-hidden relative group cursor-pointer" onClick={() => play(track)}>
          {track.imageUrl ? (
            <img src={track.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-12 h-12 text-theme-tertiary" />
            </div>
          )}
          {/* Play overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-brand-500/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg shadow-black/30">
              {isPlayingThis ? (
                <Pause className="w-6 h-6 text-white" />
              ) : (
                <Play className="w-6 h-6 text-white ml-0.5" />
              )}
            </div>
          </div>
        </div>

        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-2">{track.title || 'Untitled'}</h1>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="info">{getModelLabel(track.model)}</Badge>
            <Badge>{getModeLabel(track.mode)}</Badge>
            {track.duration && <Badge>{formatDuration(track.duration)}</Badge>}
            <Badge variant={track.status === 'completed' ? 'success' : 'warning'}>
              {track.status}
            </Badge>
          </div>
          {track.style && (
            <p className="text-sm text-theme-secondary mb-1">曲风: {track.style}</p>
          )}
          {track.prompt && (
            <p className="text-sm text-theme-secondary">描述: {track.prompt}</p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className={`grid ${track.model === 'suno' ? 'grid-cols-4' : 'grid-cols-3'} gap-3 mb-8`}>
        <Button variant="secondary" className="flex-col py-4 h-auto" onClick={handleDownload} disabled={!track.audioUrl}>
          <Download className="w-5 h-5" />
          <span className="text-xs">下载</span>
        </Button>
        <Button variant="secondary" className="flex-col py-4 h-auto" onClick={() => setActionModal('cover')}>
          <Wand2 className="w-5 h-5" />
          <span className="text-xs">翻唱</span>
        </Button>
        <Button variant="secondary" className="flex-col py-4 h-auto" onClick={() => setActionModal('extend')}>
          <Scissors className="w-5 h-5" />
          <span className="text-xs">续写</span>
        </Button>
        {track.model === 'suno' && (
          <Button variant="secondary" className="flex-col py-4 h-auto" onClick={() => setActionModal('aligned-lyrics')}>
            <FileText className="w-5 h-5" />
            <span className="text-xs">歌词时间轴</span>
          </Button>
        )}
      </div>

      {/* Lyrics */}
      {track.lyrics && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">歌词</h2>
          <pre className="text-sm text-theme-secondary font-sans whitespace-pre-wrap leading-relaxed">
            {track.lyrics}
          </pre>
        </Card>
      )}

      {/* Video */}
      {track.videoUrl && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">MV</h2>
          <video
            src={track.videoUrl}
            controls
            className="w-full rounded-lg"
            style={{ maxHeight: 400 }}
          />
        </Card>
      )}

      {/* Stems */}
      {track.stems && track.stems.length > 0 && (
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">分离音轨</h2>
          <div className="space-y-2">
            {track.stems.map((stem: StemTrackData) => (
              <div key={stem.id} className="flex items-center justify-between p-3 bg-surface-900 rounded-lg">
                <span className="text-sm">{stem.stemType}</span>
                {stem.audioUrl && (
                  <Button size="sm" variant="ghost" onClick={() => downloadFile(stem.audioUrl!, `${stem.stemType}.mp3`)}>
                    <Download className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Derivation chain */}
      {track.parent && (
        <Card className="p-6 mb-6">
          <h2 className="text-sm text-theme-secondary mb-2">来源于</h2>
          <button
            onClick={() => onNavigate('track', { id: track.parent!.id })}
            className="text-brand-400 hover:text-brand-300 text-sm"
          >
            {track.parent.title || 'Untitled'}
          </button>
        </Card>
      )}

      {track.children.length > 0 && (
        <Card className="p-6">
          <h2 className="text-sm text-theme-secondary mb-2">衍生作品</h2>
          <div className="space-y-2">
            {track.children.map((child: MusicTrackData) => (
              <button
                key={child.id}
                onClick={() => onNavigate('track', { id: child.id })}
                className="block text-brand-400 hover:text-brand-300 text-sm"
              >
                {child.title || 'Untitled'} ({getModeLabel(child.mode)})
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Action modals */}
      <Modal
        open={actionModal === 'cover'}
        onClose={() => setActionModal(null)}
        title="翻唱"
      >
        <p className="text-sm text-theme-secondary mb-4">选择目标风格，将这首歌翻唱成新的版本</p>
        <StyleTagPicker value={coverStyle} onChange={setCoverStyle} />
        <div className="mt-4">
          <Button className="w-full" loading={actionLoading} onClick={handleCover}>
            开始翻唱
          </Button>
        </div>
      </Modal>

      <Modal
        open={actionModal === 'extend'}
        onClose={() => setActionModal(null)}
        title="续写"
      >
        <p className="text-sm text-theme-secondary mb-4">描述续写的方向</p>
        <textarea
          value={extendPrompt}
          onChange={(e) => setExtendPrompt(e.target.value)}
          placeholder="延续主歌旋律，加入弦乐..."
          className="w-full bg-surface-900 border border-surface-700 rounded-lg px-4 py-2.5 text-sm h-24 resize-none mb-4 focus:outline-none focus:border-brand-500"
        />
        <Button className="w-full" loading={actionLoading} onClick={handleExtend}>
          开始续写
        </Button>
      </Modal>

      <Modal
        open={actionModal === 'stems'}
        onClose={() => setActionModal(null)}
        title="音轨分离"
      >
        <p className="text-sm text-theme-secondary mb-4">将歌曲分离为人声和伴奏音轨</p>
        <Button className="w-full" loading={actionLoading} onClick={handleStems}>
          开始分离
        </Button>
      </Modal>

      <Modal
        open={actionModal === 'aligned-lyrics'}
        onClose={() => setActionModal(null)}
        title="歌词时间轴"
      >
        <p className="text-sm text-theme-secondary mb-4">选择要下载的 LRC 版本</p>
        <div className="space-y-3">
          <Button className="w-full" loading={alignedLyricsLoading} onClick={() => handleAlignedLyrics('filtered')}>
            <FileText className="w-4 h-4" />
            仅歌词（过滤非歌词标记）
          </Button>
          <Button variant="secondary" className="w-full" loading={alignedLyricsLoading} onClick={() => handleAlignedLyrics('full')}>
            <FileText className="w-4 h-4" />
            含全部标记（含 Style tag 等）
          </Button>
        </div>
      </Modal>
    </div>
  );
}