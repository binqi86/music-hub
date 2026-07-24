export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
}

export function getModelLabel(model: string): string {
  switch (model) {
    case 'suno': return 'Suno';
    case 'flowmusic': return 'Flow Music';
    default: return model;
  }
}

export function getModeLabel(mode: string): string {
  switch (mode) {
    case 'custom': return '自定义';
    case 'inspiration': return '灵感模式';
    case 'cover': return '翻唱';
    case 'extend': return '续写';
    case 'stems': return '音轨分离';
    case 'mv': return 'MV';
    case 'upload': return '上传';
    default: return mode;
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'completed': return 'bg-green-500';
    case 'failed': return 'bg-red-500';
    case 'submitted':
    case 'pending': return 'bg-yellow-500';
    default: return 'bg-surface-500';
  }
}