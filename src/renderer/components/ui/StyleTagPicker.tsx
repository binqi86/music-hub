import React, { useState, useMemo, useRef } from 'react';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';

// English tag values (sent to API) mapped to Chinese display labels
const TAG_LABELS: Record<string, string> = {
  // Genre
  'Mandarin pop': '华语流行', 'Mandopop': '华语流行', 'Cantopop': '粤语流行',
  'Pop': '流行', 'Pop ballad': '流行情歌', 'Indie pop': '独立流行',
  'Dream pop': '梦幻流行', 'City pop': '城市流行', 'Synth-pop': '合成器流行',
  'J-pop': 'J-Pop', 'K-pop': 'K-Pop', 'Anime opening': '动漫主题曲',
  'Rock': '摇滚', 'Pop rock': '流行摇滚', 'Alternative rock': '另类摇滚',
  'Metal': '金属', 'Folk': '民谣', 'Indie folk': '独立民谣',
  'Country': '乡村', 'R&B': 'R&B', 'Soul': '灵魂乐', 'Neo-soul': '新灵魂乐',
  'Hip-hop': '嘻哈', 'Rap': '说唱', 'Trap': 'Trap',
  'Lo-fi hip-hop': 'Lo-fi 嘻哈', 'EDM': '电子舞曲', 'House': 'House',
  'Techno': 'Techno', 'Future bass': 'Future Bass', 'Jazz': '爵士',
  'Blues': '蓝调', 'Cinematic': '电影配乐', 'Orchestral': '管弦乐',
  'Chinese traditional': '中国风', 'Ancient Chinese': '古风',

  // Mood
  'Happy': '欢快', 'Joyful': '喜悦', 'Bright': '明亮', 'Sweet': '甜美',
  'Romantic': '浪漫', 'Warm': '温暖', 'Tender': '温柔', 'Intimate': '亲密',
  'Sad': '悲伤', 'Melancholic': '忧郁', 'Nostalgic': '怀旧', 'Sentimental': '伤感',
  'Lonely': '孤独', 'Heartbroken': '心碎', 'Bittersweet': '苦乐参半',
  'Dreamy': '梦幻', 'Ethereal': '空灵', 'Atmospheric': '氛围',
  'Mysterious': '神秘', 'Dark': '黑暗', 'Hopeful': '希望', 'Uplifting': '振奋',
  'Epic': '史诗', 'Aggressive': '激进', 'Anxious': '焦虑',

  // Vocal
  'Male vocal': '男声', 'Female vocal': '女声', 'Male and female duet': '男女对唱',
  'Duet': '对唱', 'Soft vocal': '轻柔', 'Powerful vocal': '有力',
  'Breathy vocal': '气声', 'Raspy vocal': '沙哑', 'Falsetto': '假声',
  'Belting': '高亢', 'Whisper': '低语', 'Spoken word': '念白',
  'Rap vocal': '说唱', 'Vocal harmony': '和声', 'Choir': '合唱',
  'Call and response': '呼应', 'Chinese opera vocal': '中式戏腔',

  // Instrument
  'Piano': '钢琴', 'Soft piano': '轻柔钢琴', 'Electric piano': '电钢琴',
  'Rhodes': 'Rhodes 电钢', 'Synth': '合成器', 'Synth pad': '合成器铺垫',
  'Synth lead': '合成器主音', 'Synth bass': '合成器贝斯',
  'Acoustic guitar': '原声吉他', 'Nylon guitar': '尼龙弦吉他',
  'Electric guitar': '电吉他', 'Distorted guitar': '失真吉他',
  'Guitar solo': '吉他独奏', 'Bass guitar': '贝斯',
  'Drums': '鼓', 'Acoustic drums': '原声鼓', 'Drum machine': '鼓机',
  '808': '808 鼓机', 'Strings': '弦乐', 'Orchestral strings': '管弦弦乐',
  'Violin': '小提琴', 'Cello': '大提琴', 'Brass section': '铜管',
  'Saxophone': '萨克斯', 'Flute': '长笛',
  'Guzheng': '古筝', 'Guqin': '古琴', 'Erhu': '二胡', 'Pipa': '琵琶',
  'Dizi': '笛子', 'Xiao': '箫', 'Suona': '唢呐',
  'Kalimba': '卡林巴', 'Music box': '八音盒',

  // Tempo
  'Slow tempo': '慢速', 'Medium tempo': '中速', 'Fast tempo': '快速',
  '70 BPM': '70 BPM', '90 BPM': '90 BPM', '120 BPM': '120 BPM',
  '4/4': '4/4 拍', '3/4': '3/4 拍', 'Waltz': '华尔兹', 'Swing': '摇摆',
  'Syncopated': '切分音',

  // Scene
  'Rain ambience': '雨声', 'Ocean waves': '海浪', 'City night ambience': '城市夜景',
  'Thunder': '雷声', 'Wind chimes': '风铃', 'Fire crackle': '篝火',
  'Footsteps': '脚步声', 'Heartbeat': '心跳',
  'Phone call intro': '电话 intro', 'Radio voice': '电台人声',
  'Tape stop': '磁带停止', 'Riser': 'Riser', 'Impact hit': '冲击音效',
  'Silence': '静音',
};

const CATEGORY_LABELS: Record<string, string> = {
  Genre: '曲风', Mood: '情绪', Vocal: '人声',
  Instrument: '乐器', Tempo: '节奏', Scene: '场景',
};

export const TAG_CATEGORIES: Record<string, string[]> = {
  Genre: [
    'Mandarin pop', 'Mandopop', 'Cantopop', 'Pop', 'Pop ballad', 'Indie pop',
    'Dream pop', 'City pop', 'Synth-pop', 'J-pop', 'K-pop', 'Anime opening',
    'Rock', 'Pop rock', 'Alternative rock', 'Metal', 'Folk', 'Indie folk',
    'Country', 'R&B', 'Soul', 'Neo-soul', 'Hip-hop', 'Rap', 'Trap',
    'Lo-fi hip-hop', 'EDM', 'House', 'Techno', 'Future bass', 'Jazz', 'Blues',
    'Cinematic', 'Orchestral', 'Chinese traditional', 'Ancient Chinese',
  ],
  Mood: [
    'Happy', 'Joyful', 'Bright', 'Sweet', 'Romantic', 'Warm', 'Tender',
    'Intimate', 'Sad', 'Melancholic', 'Nostalgic', 'Sentimental', 'Lonely',
    'Heartbroken', 'Bittersweet', 'Dreamy', 'Ethereal', 'Atmospheric',
    'Mysterious', 'Dark', 'Hopeful', 'Uplifting', 'Epic', 'Aggressive', 'Anxious',
  ],
  Vocal: [
    'Male vocal', 'Female vocal', 'Male and female duet', 'Duet',
    'Soft vocal', 'Powerful vocal', 'Breathy vocal', 'Raspy vocal',
    'Falsetto', 'Belting', 'Whisper', 'Spoken word', 'Rap vocal',
    'Vocal harmony', 'Choir', 'Call and response', 'Chinese opera vocal',
  ],
  Instrument: [
    'Piano', 'Soft piano', 'Electric piano', 'Rhodes', 'Synth', 'Synth pad',
    'Synth lead', 'Synth bass', 'Acoustic guitar', 'Nylon guitar',
    'Electric guitar', 'Distorted guitar', 'Guitar solo', 'Bass guitar',
    'Drums', 'Acoustic drums', 'Drum machine', '808', 'Strings',
    'Orchestral strings', 'Violin', 'Cello', 'Brass section', 'Saxophone',
    'Flute', 'Guzheng', 'Guqin', 'Erhu', 'Pipa', 'Dizi', 'Xiao', 'Suona',
    'Kalimba', 'Music box',
  ],
  Tempo: [
    'Slow tempo', 'Medium tempo', 'Fast tempo', '70 BPM', '90 BPM', '120 BPM',
    '4/4', '3/4', 'Waltz', 'Swing', 'Syncopated',
  ],
  Scene: [
    'Rain ambience', 'Ocean waves', 'City night ambience', 'Thunder',
    'Wind chimes', 'Fire crackle', 'Footsteps', 'Heartbeat',
    'Phone call intro', 'Radio voice', 'Tape stop', 'Riser', 'Impact hit',
    'Silence',
  ],
};

function getLabel(tag: string): string {
  return TAG_LABELS[tag] || tag;
}

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

interface StyleTagPickerProps {
  value: string;
  onChange: (value: string) => void;
  maxTags?: number;
  compact?: boolean;
}

export function StyleTagPicker({ value, onChange, maxTags = 8, compact = false }: StyleTagPickerProps) {
  const categories = Object.keys(TAG_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  const [customInput, setCustomInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => {
    return new Set(value.split('|||').map((s) => s.trim()).filter(Boolean));
  }, [value]);

  const toggleTag = (tag: string) => {
    const next = new Set(selectedSet);
    if (next.has(tag)) {
      next.delete(tag);
    } else {
      if (next.size >= maxTags) return;
      next.add(tag);
    }
    onChange(Array.from(next).join('|||'));
  };

  const addCustomTag = () => {
    const tag = customInput.trim();
    if (!tag) return;
    const next = new Set(selectedSet);
    if (next.has(tag)) return;
    if (next.size >= maxTags) return;
    next.add(tag);
    onChange(Array.from(next).join('|||'));
    setCustomInput('');
    inputRef.current?.focus();
  };

  const currentTags = TAG_CATEGORIES[activeCategory] || [];

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={clsx(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              activeCategory === cat
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-surface-800 text-theme-secondary hover:bg-surface-700 hover:text-theme-primary border border-surface-700'
            )}
          >
            {getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Tag grid */}
      {!compact && (
        <div className="flex flex-wrap gap-1.5">
          {currentTags.map((tag) => {
            const selected = selectedSet.has(tag);
            const atMax = selectedSet.size >= maxTags && !selected;
            return (
              <button
                key={tag}
                type="button"
                disabled={atMax}
                onClick={() => toggleTag(tag)}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs border transition-all',
                  selected
                    ? 'bg-brand-500/20 border-brand-500 text-brand-300 font-medium'
                    : atMax
                      ? 'border-surface-700 text-theme-tertiary cursor-not-allowed opacity-40'
                      : 'border-surface-700 text-theme-secondary hover:border-surface-500 hover:text-theme-primary'
                )}
              >
                {getLabel(tag)}
              </button>
            );
          })}
        </div>
      )}

      {/* Custom tag input */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustomTag();
            }
          }}
          placeholder="自定义曲风（建议用英文），按 Enter 添加..."
          disabled={selectedSet.size >= maxTags}
          className="flex-1 bg-surface-900 border border-surface-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-brand-500 disabled:opacity-40"
        />
        <button
          type="button"
          onClick={addCustomTag}
          disabled={!customInput.trim() || selectedSet.size >= maxTags}
          className="p-1.5 rounded-md bg-brand-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selected tags preview */}
      {selectedSet.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selectedSet).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-500/15 text-brand-300 rounded-md text-xs font-medium"
            >
              {getLabel(tag)}
              <button
                type="button"
                onClick={() => toggleTag(tag)}
                className="hover:text-white ml-0.5"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Count */}
      <p className="text-xs text-theme-tertiary">
        已选 {selectedSet.size}/{maxTags} 个标签
      </p>
    </div>
  );
}