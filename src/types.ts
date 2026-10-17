/** 作品体裁 */
export type Genre =
  | '五言古诗'
  | '七言古诗'
  | '五言律诗'
  | '七言律诗'
  | '五言绝句'
  | '七言绝句'
  | '乐府'
  | '词'
  | '赋'
  | '散文'
  | '笔记'
  | '奏议'
  | '碑铭';

/** 人生事件类型 */
export type EventType = 'birth' | 'travel' | 'office' | 'exile' | 'seclude' | 'sociable' | 'death';

/** 作品 */
export interface Work {
  id: string;
  title: string; // 作品标题
  genre: string; // 体裁：五言古诗/七言绝句/词/赋/散文...
  year: number; // 创作年份（公元）
  yearLabel?: string; // 年号纪年，如 "开元十三年"、"元丰五年"
  placeId: string; // 关联地点节点 id
  excerpt: string; // 名句/节选
  fullText?: string; // 全文（短篇给全文，长篇给节选）
  background: string; // 创作背景一句话
  tags?: string[]; // 如 ["思乡","山水","贬谪","送别"]
}

/** 人生时空节点 */
export interface LifeNode {
  id: string;
  year: number; // 公元年份
  yearRange?: [number, number]; // 停留年份区间（可选）
  era?: string; // 年号，如 "天宝三载"
  place: string; // 地名古称，如 "长安"、"黄州"、"夔州"
  modernPlace: string; // 今地，如 "陕西西安"、"湖北黄冈"、"重庆奉节"
  lng: number;
  lat: number; // 经纬度（现代对应地）
  age?: number; // 该年年龄
  eventType: EventType;
  event: string; // 该节点的人生事件描述
  works: Work[]; // 该地该时创作的作品
  note?: string;
}

/** 诗人 / 词人 */
export interface Poet {
  id: string;
  name: string;
  courtesy?: string; // 字
  pseudonym?: string; // 号
  dynasty: '唐' | '宋';
  birthYear: number;
  deathYear: number;
  birthplace: string;
  brief: string; // 2-3 句小传
  avatarColor: string; // 主题色（水墨风配色）
  nodes: LifeNode[]; // 按年份升序
}

/** 朝代底图风格 */
export type EraKey = 'tang' | 'song';

/** 右侧面板视图 */
export type PanelView = 'map' | 'works' | 'compare';

/** 播放速度 */
export type PlaySpeed = 0.5 | 1 | 2;

/** 事件类型的展示元数据 */
export interface EventTypeMeta {
  key: EventType;
  glyph: string; // 节点内字
  label: string;
  color: string;
  desc: string;
}

export const EVENT_TYPE_META: EventTypeMeta[] = [
  { key: 'birth', glyph: '生', label: '出生', color: '#7A5C3E', desc: '出生地 / 早年' },
  { key: 'travel', glyph: '游', label: '游历', color: '#4F7C8A', desc: '漫游、行旅' },
  { key: 'office', glyph: '仕', label: '仕宦', color: '#9C6B2F', desc: '任职、应举' },
  { key: 'exile', glyph: '贬', label: '贬谪', color: '#A83232', desc: '贬官、流放' },
  { key: 'seclude', glyph: '隐', label: '隐居', color: '#4F7C5A', desc: '隐逸、闲居' },
  { key: 'sociable', glyph: '交', label: '交游', color: '#6F5FA0', desc: '交游、唱和' },
  { key: 'death', glyph: '卒', label: '逝世', color: '#2B2724', desc: '卒葬之地' },
];

export const EVENT_COLOR: Record<EventType, string> = EVENT_TYPE_META.reduce(
  (acc, m) => {
    acc[m.key] = m.color;
    return acc;
  },
  {} as Record<EventType, string>,
);

export const EVENT_GLYPH: Record<EventType, string> = EVENT_TYPE_META.reduce(
  (acc, m) => {
    acc[m.key] = m.glyph;
    return acc;
  },
  {} as Record<EventType, string>,
);

export const EVENT_LABEL: Record<EventType, string> = EVENT_TYPE_META.reduce(
  (acc, m) => {
    acc[m.key] = m.label;
    return acc;
  },
  {} as Record<EventType, string>,
);
