/**
 * 历史政区底图（示意）
 * ------------------------------------------------------------------
 * 说明与合规声明：
 * 1. 本文件只是「渲染着色方案」，不修改、不裁剪任何省级边界几何。
 *    中国全部省级行政区（含台湾省、海南省、南海诸岛）始终完整绘制。
 * 2. 唐宋政区为**简化示意**：以「现代省级面 → 历史道/路」的归属映射近似表达，
 *    不追求精确疆界；唐代的吐蕃、渤海等邻蕃/羁縻地区单独标注，不作境外处理。
 * 3. 数据源：阿里云 DataV.GeoAtlas 全国省级边界（国家标准底图），
 *    项目内离线内置，不调用任何在线地图瓦片或地图 SDK。
 */

export interface HistoricalRegion {
  id: string;
  name: string;
  /** 覆盖的现代省级名称（与 china-geo.json 的 properties.name 一致） */
  provinces: string[];
  /** 治所 / 代表性古称 */
  capital: string;
  lng: number;
  lat: number;
  /** 淡彩填充（水墨淡设色） */
  fill: string;
  note?: string;
}

/** 唐代淡设色（赭、青、绿、紫的极淡变体） */
const T_FILL = [
  '#EFE3C8',
  '#E7DFC6',
  '#E3D9C2',
  '#DED2BE',
  '#E6DCC4',
  '#E9DEC9',
  '#E2D6C0',
  '#EADFC6',
  '#E4DAC3',
  '#DED8C2',
  '#E8E0CA',
  '#E1D5BE',
  '#EBE1C9',
  '#E5D9C2',
  '#DED3BD',
];

/** 宋代淡设色（青灰、藕荷、秋香的极淡变体） */
const S_FILL = [
  '#E8E1CC',
  '#E2DBCB',
  '#DCD8C6',
  '#E6DFC9',
  '#DFDAC6',
  '#E9E2CE',
  '#E3DED0',
  '#DEDBC8',
  '#EAE4D2',
  '#E1DAC5',
  '#DFD9C4',
  '#E5E0CE',
  '#DCD6C3',
  '#E7E1CB',
  '#E0DAC7',
  '#E4DDCC',
  '#DFE0CD',
  '#E6E5D4',
];

/** 羁縻 / 邻蕃（唐：吐蕃、渤海；宋：辽、西夏、大理等）统一淡灰赭 */
const NEIGHBOR_FILL = '#E4DDD2';

const tangRaw: Array<Omit<HistoricalRegion, 'fill'> & { fillIdx?: number; neighbor?: boolean }> = [
  { id: 'jingji', name: '京畿道', provinces: ['陕西省'], capital: '长安', lng: 108.95, lat: 34.27 },
  { id: 'duji', name: '都畿道', provinces: ['河南省'], capital: '洛阳', lng: 112.45, lat: 34.62 },
  { id: 'guannei', name: '关内道', provinces: ['内蒙古自治区', '宁夏回族自治区'], capital: '灵州', lng: 106.28, lat: 38.03 },
  { id: 'hedong', name: '河东道', provinces: ['山西省'], capital: '太原', lng: 112.55, lat: 37.87 },
  {
    id: 'hebei',
    name: '河北道',
    provinces: ['北京市', '天津市', '河北省', '辽宁省'],
    capital: '魏州',
    lng: 115.14,
    lat: 36.28,
    note: '含安东都护府（辽东）之地',
  },
  { id: 'henan', name: '河南道', provinces: ['山东省'], capital: '兖州', lng: 116.59, lat: 35.42 },
  { id: 'huainan', name: '淮南道', provinces: ['江苏省', '安徽省'], capital: '扬州', lng: 119.42, lat: 32.39 },
  {
    id: 'jiangnandong',
    name: '江南东道',
    provinces: ['浙江省', '福建省', '上海市'],
    capital: '杭州',
    lng: 120.16,
    lat: 30.29,
  },
  { id: 'jiangnanxi', name: '江南西道', provinces: ['江西省', '湖南省'], capital: '洪州', lng: 115.89, lat: 28.68 },
  { id: 'shannandong', name: '山南东道', provinces: ['湖北省'], capital: '襄州', lng: 112.13, lat: 32.04 },
  { id: 'shannanxi', name: '山南西道', provinces: ['重庆市'], capital: '渝州', lng: 106.55, lat: 29.56, note: '含汉中（梁州）之地' },
  {
    id: 'jiannan',
    name: '剑南道',
    provinces: ['四川省', '云南省'],
    capital: '成都',
    lng: 104.07,
    lat: 30.66,
    note: '南境为姚州及南诏羁縻之地',
  },
  { id: 'qianzhong', name: '黔中道', provinces: ['贵州省'], capital: '黔州', lng: 106.63, lat: 26.65 },
  {
    id: 'lingnan',
    name: '岭南道',
    provinces: ['广东省', '广西壮族自治区', '海南省', '香港特别行政区', '澳门特别行政区'],
    capital: '广州',
    lng: 113.26,
    lat: 23.13,
  },
  { id: 'longyou', name: '陇右道', provinces: ['甘肃省', '青海省', '新疆维吾尔自治区'], capital: '鄯州', lng: 101.78, lat: 36.62, note: '含安西、北庭二都护府' },
  {
    id: 'tubo',
    name: '吐蕃（邻蕃）',
    provinces: ['西藏自治区'],
    capital: '逻些',
    lng: 91.14,
    lat: 29.65,
    neighbor: true,
    note: '开元年间为吐蕃之地，非唐直辖，仅示意',
  },
  {
    id: 'bohai',
    name: '渤海·靺鞨（羁縻）',
    provinces: ['吉林省', '黑龙江省'],
    capital: '上京龙泉府',
    lng: 129.46,
    lat: 44.35,
    neighbor: true,
    note: '唐羁縻之地（渤海国、黑水靺鞨），仅示意',
  },
];

const songRaw: Array<Omit<HistoricalRegion, 'fill'> & { fillIdx?: number; neighbor?: boolean }> = [
  { id: 'jingji-lu', name: '京畿路', provinces: ['河南省'], capital: '东京开封府', lng: 114.31, lat: 34.8 },
  { id: 'jingdongdong', name: '京东东路', provinces: ['山东省'], capital: '青州', lng: 118.47, lat: 36.71 },
  {
    id: 'hebeidong',
    name: '河北东路',
    provinces: ['北京市', '天津市', '河北省'],
    capital: '大名府',
    lng: 115.14,
    lat: 36.28,
    note: '燕云十六州时属辽，此处依宋制标名',
  },
  { id: 'hedong-lu', name: '河东路', provinces: ['山西省'], capital: '太原府', lng: 112.55, lat: 37.87 },
  { id: 'yongxing', name: '永兴军路', provinces: ['陕西省'], capital: '京兆府（长安）', lng: 108.95, lat: 34.27 },
  { id: 'qinfeng', name: '秦凤路', provinces: ['甘肃省', '青海省'], capital: '秦州', lng: 105.72, lat: 34.58 },
  { id: 'liangzhe', name: '两浙路', provinces: ['浙江省', '上海市'], capital: '临安府', lng: 120.16, lat: 30.29 },
  { id: 'huainandong', name: '淮南东路', provinces: ['江苏省'], capital: '扬州', lng: 119.42, lat: 32.39 },
  { id: 'huainanxi', name: '淮南西路', provinces: ['安徽省'], capital: '庐州', lng: 117.28, lat: 31.86 },
  {
    id: 'jiangnandong-lu',
    name: '江南东路',
    provinces: [],
    capital: '江宁府',
    lng: 118.8,
    lat: 32.06,
    note: '大致当今江苏南部、皖东南、赣东北，与淮南东路同域示意',
  },
  { id: 'jiangnanxi-lu', name: '江南西路', provinces: ['江西省'], capital: '洪州', lng: 115.89, lat: 28.68 },
  { id: 'jinghubei', name: '荆湖北路', provinces: ['湖北省'], capital: '江陵府', lng: 112.24, lat: 30.33 },
  { id: 'jinghunan', name: '荆湖南路', provinces: ['湖南省'], capital: '潭州', lng: 112.94, lat: 28.23 },
  { id: 'chengdu', name: '成都府路', provinces: ['四川省'], capital: '成都府', lng: 104.07, lat: 30.66 },
  {
    id: 'kuizhou',
    name: '夔州路',
    provinces: ['重庆市', '贵州省'],
    capital: '夔州',
    lng: 109.47,
    lat: 31.02,
    note: '黔中大部为羁縻州',
  },
  { id: 'fujian', name: '福建路', provinces: ['福建省'], capital: '福州', lng: 119.3, lat: 26.08 },
  {
    id: 'guangnandong',
    name: '广南东路',
    provinces: ['广东省', '香港特别行政区', '澳门特别行政区'],
    capital: '广州',
    lng: 113.26,
    lat: 23.13,
  },
  { id: 'guangnanxi', name: '广南西路', provinces: ['广西壮族自治区', '海南省'], capital: '桂州', lng: 110.29, lat: 25.27 },
  {
    id: 'liao',
    name: '辽（契丹）',
    provinces: ['内蒙古自治区', '辽宁省'],
    capital: '上京临潢府',
    lng: 119.4,
    lat: 43.98,
    neighbor: true,
    note: '与北宋并立，仅示意',
  },
  {
    id: 'jin',
    name: '女真·金',
    provinces: ['吉林省', '黑龙江省'],
    capital: '按出虎水',
    lng: 126.97,
    lat: 45.53,
    neighbor: true,
    note: '女真故地，后建金，仅示意',
  },
  {
    id: 'xixia',
    name: '西夏',
    provinces: ['宁夏回族自治区'],
    capital: '兴庆府',
    lng: 106.23,
    lat: 38.49,
    neighbor: true,
    note: '与宋并立，仅示意',
  },
  {
    id: 'xizhou',
    name: '西州回鹘·于阗',
    provinces: ['新疆维吾尔自治区'],
    capital: '高昌',
    lng: 89.19,
    lat: 42.95,
    neighbor: true,
    note: '宋时西域诸部，仅示意',
  },
  {
    id: 'dali',
    name: '大理',
    provinces: ['云南省'],
    capital: '大理',
    lng: 100.23,
    lat: 25.59,
    neighbor: true,
    note: '与宋并立，仅示意',
  },
  {
    id: 'tufan-song',
    name: '吐蕃诸部',
    provinces: ['西藏自治区'],
    capital: '逻些',
    lng: 91.14,
    lat: 29.65,
    neighbor: true,
    note: '宋时吐蕃分裂诸部，仅示意',
  },
];

const withFill = (
  list: Array<Omit<HistoricalRegion, 'fill'> & { neighbor?: boolean }>,
  palette: string[],
): HistoricalRegion[] =>
  list.map((r, i) => ({
    id: r.id,
    name: r.name,
    provinces: r.provinces,
    capital: r.capital,
    lng: r.lng,
    lat: r.lat,
    note: r.note,
    fill: r.neighbor ? NEIGHBOR_FILL : palette[i % palette.length],
  }));

/** 唐 · 开元十五道（简化示意） */
export const TANG_REGIONS: HistoricalRegion[] = withFill(tangRaw, T_FILL);

/** 宋 · 路制（简化示意，参崇宁二十三路） */
export const SONG_REGIONS: HistoricalRegion[] = withFill(songRaw, S_FILL);

/** 省名 → 政区（唐） */
export const TANG_PROVINCE_TO_REGION: Record<string, HistoricalRegion> = (() => {
  const map: Record<string, HistoricalRegion> = {};
  for (const r of TANG_REGIONS) for (const p of r.provinces) map[p] = r;
  return map;
})();

/** 省名 → 政区（宋） */
export const SONG_PROVINCE_TO_REGION: Record<string, HistoricalRegion> = (() => {
  const map: Record<string, HistoricalRegion> = {};
  for (const r of SONG_REGIONS) for (const p of r.provinces) map[p] = r;
  return map;
})();

/** 古今都会（始终在地图上标注） */
export interface AncientCity {
  name: string;
  modern: string;
  lng: number;
  lat: number;
  /** 重要度：1 都城，2 重镇 */
  rank: 1 | 2;
}

export const ANCIENT_CITIES: AncientCity[] = [
  { name: '长安', modern: '西安', lng: 108.95, lat: 34.27, rank: 1 },
  { name: '洛阳', modern: '洛阳', lng: 112.45, lat: 34.62, rank: 1 },
  { name: '开封', modern: '开封', lng: 114.31, lat: 34.8, rank: 1 },
  { name: '临安', modern: '杭州', lng: 120.16, lat: 30.29, rank: 1 },
  { name: '建康', modern: '南京', lng: 118.8, lat: 32.06, rank: 1 },
  { name: '扬州', modern: '扬州', lng: 119.42, lat: 32.39, rank: 2 },
  { name: '成都', modern: '成都', lng: 104.07, lat: 30.66, rank: 2 },
  { name: '荆州', modern: '荆州', lng: 112.24, lat: 30.33, rank: 2 },
  { name: '太原', modern: '太原', lng: 112.55, lat: 37.87, rank: 2 },
  { name: '广州', modern: '广州', lng: 113.26, lat: 23.13, rank: 2 },
  { name: '福州', modern: '福州', lng: 119.3, lat: 26.08, rank: 2 },
  { name: '凉州', modern: '武威', lng: 102.63, lat: 37.93, rank: 2 },
];
