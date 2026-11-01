/**
 * 迭代 9 · 全局四维检索：人 / 时间 / 地点 / 作品 任一维度输入，其余三维联动命中。
 *
 * 设计要点：
 * - 全量索引只构建一次（模块级懒加载单例），避免每次输入都遍历全部诗人 × 节点 × 作品；
 * - 三组结果（诗人 / 作品 / 地点）分组返回，便于 UI 分栏展示；
 * - 排序分档：标题/姓名命中 > 正文命中，年份倒序仅作同档内次级排序。
 */
import { getPoets, isPoetsLoaded } from '../data/poetStore';
import type { EventType, LifeNode, Poet, Work } from '../types';

export interface PoetHit {
  kind: 'poet';
  poet: Poet;
  /** 命中得分，越大越靠前 */
  score: number;
}

export interface WorkHit {
  kind: 'work';
  poet: Poet;
  node: LifeNode;
  work: Work;
  score: number;
}

export interface PlaceHit {
  kind: 'place';
  /** 古称 */
  place: string;
  /** 今地 */
  modernPlace: string;
  lng: number;
  lat: number;
  /** 到过此地的诗人 */
  poets: Poet[];
  /** 此地产生的作品总数 */
  workCount: number;
  score: number;
}

export interface SearchResult {
  poets: PoetHit[];
  works: WorkHit[];
  places: PlaceHit[];
  total: number;
}

/** 地点聚合（按「古称|今地」去重） */
interface PlaceAgg {
  place: string;
  modernPlace: string;
  lng: number;
  lat: number;
  poetIds: Set<string>;
  workCount: number;
}

let placeIndexCache: PlaceAgg[] | null = null;

/** 全量地点索引：把所有诗人的足迹聚合成「某地—哪些诗人到过—留下多少作品」 */
function buildPlaceIndex(): PlaceAgg[] {
  if (placeIndexCache) return placeIndexCache;
  // 详情未载入时不要建（更不能缓存）：否则会把「空索引」记成结果，之后永远查不到
  if (!isPoetsLoaded()) return [];
  const map = new Map<string, PlaceAgg>();
  for (const poet of getPoets()) {
    for (const node of poet.nodes) {
      const key = `${node.place}|${node.modernPlace}`;
      let agg = map.get(key);
      if (!agg) {
        agg = {
          place: node.place,
          modernPlace: node.modernPlace,
          lng: node.lng,
          lat: node.lat,
          poetIds: new Set<string>(),
          workCount: 0,
        };
        map.set(key, agg);
      }
      agg.poetIds.add(poet.id);
      agg.workCount += node.works.length;
    }
  }
  placeIndexCache = [...map.values()];
  return placeIndexCache;
}

/** 命中打分：空关键词返回 0（不匹配） */
function scoreOf(haystacks: { text: string; weight: number }[], kw: string): number {
  let best = 0;
  for (const h of haystacks) {
    if (!h.text) continue;
    if (!h.text.includes(kw)) continue;
    // 开头命中额外加权，让「赤壁」优先命中《念奴娇·赤壁怀古》而非正文里顺带提到的赤壁
    const bonus = h.text.startsWith(kw) ? 2 : 0;
    const s = h.weight + bonus;
    if (s > best) best = s;
  }
  return best;
}

const W_NAME = 100; // 诗人姓名
const W_TITLE = 90; // 作品标题
const W_ALIAS = 60; // 字号 / 籍贯
const W_PLACE = 70; // 地名
const W_GENRE = 40; // 体裁
const W_YEAR_LABEL = 35; // 年号
const W_TEXT = 20; // 正文 / 背景 / 简介
const W_TAG = 30; // 题材标签

const LIMIT_PER_GROUP = 8;

/**
 * 全局检索。
 * @param keyword 关键词（已 trim，空串返回空结果）
 */
export function searchAll(keyword: string): SearchResult {
  const kw = keyword.trim();
  if (!kw) return { poets: [], works: [], places: [], total: 0 };

  const poets: PoetHit[] = [];
  const works: WorkHit[] = [];
  const places: PlaceHit[] = [];

  for (const poet of getPoets()) {
    const pScore = scoreOf(
      [
        { text: poet.name, weight: W_NAME },
        { text: poet.courtesy ?? '', weight: W_ALIAS },
        { text: poet.pseudonym ?? '', weight: W_ALIAS },
        { text: poet.birthplace, weight: W_ALIAS },
        { text: poet.brief, weight: W_TEXT },
      ],
      kw,
    );
    if (pScore > 0) poets.push({ kind: 'poet', poet, score: pScore });

    for (const node of poet.nodes) {
      for (const work of node.works) {
        const wScore = scoreOf(
          [
            { text: work.title, weight: W_TITLE },
            { text: work.genre, weight: W_GENRE },
            { text: work.yearLabel ?? '', weight: W_YEAR_LABEL },
            { text: String(work.year), weight: W_YEAR_LABEL },
            { text: work.excerpt, weight: W_TEXT },
            { text: work.fullText ?? '', weight: W_TEXT },
            { text: work.background, weight: W_TEXT },
            { text: work.tags?.join('') ?? '', weight: W_TAG },
            { text: node.place, weight: W_PLACE },
            { text: node.modernPlace, weight: W_PLACE },
          ],
          kw,
        );
        if (wScore > 0) works.push({ kind: 'work', poet, node, work, score: wScore });
      }
    }
  }

  for (const agg of buildPlaceIndex()) {
    const s = scoreOf(
      [
        { text: agg.place, weight: W_PLACE },
        { text: agg.modernPlace, weight: W_PLACE },
      ],
      kw,
    );
    if (s <= 0) continue;
    places.push({
      kind: 'place',
      place: agg.place,
      modernPlace: agg.modernPlace,
      lng: agg.lng,
      lat: agg.lat,
      poets: getPoets().filter((p) => agg.poetIds.has(p.id)),
      workCount: agg.workCount,
      // 到过的诗人越多、作品越多，越可能是用户想找的地点
      score: s + Math.min(agg.poetIds.size, 6) * 3 + Math.min(agg.workCount, 10),
    });
  }

  const byScore = (a: { score: number }, b: { score: number }): number => b.score - a.score;
  poets.sort(byScore);
  works.sort((a, b) => b.score - a.score || b.work.year - a.work.year);
  places.sort(byScore);

  return {
    poets: poets.slice(0, LIMIT_PER_GROUP),
    works: works.slice(0, LIMIT_PER_GROUP),
    places: places.slice(0, LIMIT_PER_GROUP),
    total: poets.length + works.length + places.length,
  };
}

/* ============================================================
 * 迭代 11 · 地点访客（坐标聚类）
 * ------------------------------------------------------------------
 * 数据里的 place 古称写法并不统一（长安 / 京兆 / 长安（今陕西西安）），
 * 同一地点也常被多位诗人、多次到访，字符串互不相同。若按「古称」精确匹配，
 * 会出现「长安有人、京兆却查不到人」的割裂。
 *
 * 这里改以「经纬度」为唯一归并键：把落在同一坐标（四舍五入到 0.01°）的节点
 * 聚成一个「地点」，从而稳健地把「到过此地的人」聚到一起，与古称写法无关。
 * 城市标注、节点浮层、地点访客面板都走同一套坐标归并，口径一致。
 * ============================================================ */

/** 单次到访（同一位诗人对某地的某一节点） */
export interface PlaceVisit {
  year: number;
  era?: string;
  eventType: EventType;
  nodeId: string;
  works: Work[];
}

/** 某位诗人对某一地点的到访汇总（可能多次到访，按年份升序） */
export interface PlaceVisitorGroup {
  poet: Poet;
  visits: PlaceVisit[];
}

/** 一个地点的访客详情 */
export interface PlaceDetail {
  /** 归并后的显示名（取该地点出现频次最高、最短的古称 token） */
  name: string;
  /** 今地（取出现频次最高的 modernPlace） */
  modern: string;
  lng: number;
  lat: number;
  totalVisitors: number;
  totalWorks: number;
  /** 按「首次到访年份」升序的访客分组 */
  groups: PlaceVisitorGroup[];
}

interface Cluster {
  lng: number;
  lat: number;
  name: string;
  modern: string;
  byPoet: Map<string, { poet: Poet; visits: PlaceVisit[] }>;
  tokenCount: Map<string, number>;
  modernCount: Map<string, number>;
}

let clusterCache: Map<string, Cluster> | null = null;

/** 坐标归并键：经纬度各取 2 位小数（≈1km 精度，足以区分不同州府） */
function clusterKeyOf(lng: number, lat: number): string {
  return `${lng.toFixed(2)}|${lat.toFixed(2)}`;
}

/** 把所有诗人的节点按坐标聚合成「地点—访客」索引（模块级缓存，只建一次） */
function buildClusterIndex(): Map<string, Cluster> {
  if (clusterCache) return clusterCache;
  // 同 buildPlaceIndex：未载入时返回空表且不缓存
  if (!isPoetsLoaded()) return new Map<string, Cluster>();
  const map = new Map<string, Cluster>();
  for (const poet of getPoets()) {
    for (const node of poet.nodes) {
      const key = clusterKeyOf(node.lng, node.lat);
      let c = map.get(key);
      if (!c) {
        c = {
          lng: node.lng,
          lat: node.lat,
          name: node.place,
          modern: node.modernPlace,
          byPoet: new Map(),
          tokenCount: new Map(),
          modernCount: new Map(),
        };
        map.set(key, c);
      }
      // 古称归一：把 place 按「、」拆开计频，挑最常用且最短者作为地点显示名
      for (const tok of node.place.split('、')) {
        const t = tok.trim();
        if (!t) continue;
        c.tokenCount.set(t, (c.tokenCount.get(t) ?? 0) + 1);
      }
      c.modernCount.set(node.modernPlace, (c.modernCount.get(node.modernPlace) ?? 0) + 1);
      let g = c.byPoet.get(poet.id);
      if (!g) {
        g = { poet, visits: [] };
        c.byPoet.set(poet.id, g);
      }
      g.visits.push({
        year: node.year,
        era: node.era,
        eventType: node.eventType,
        nodeId: node.id,
        works: node.works,
      });
    }
  }
  // 用计频结果回填显示名 / 今地（频次优先，其次取短，避免「长安、洛阳」这类拼接串当选）
  for (const c of map.values()) {
    let bestName = c.name;
    let bestScore = -Infinity;
    for (const [tok, n] of c.tokenCount) {
      const score = n * 100 - tok.length;
      if (score > bestScore) {
        bestScore = score;
        bestName = tok;
      }
    }
    c.name = bestName;
    let bestMod = c.modern;
    let bestModN = -1;
    for (const [mod, n] of c.modernCount) {
      if (n > bestModN) {
        bestModN = n;
        bestMod = mod;
      }
    }
    c.modern = bestMod;
  }
  clusterCache = map;
  return map;
}

/** 取某坐标 radius（度）内最近的地点聚簇 */
function nearestCluster(lng: number, lat: number, radius = 0.5): Cluster | null {
  const idx = buildClusterIndex();
  let best: Cluster | null = null;
  let bestD = radius;
  for (const c of idx.values()) {
    const d = Math.hypot(c.lng - lng, c.lat - lat);
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * 地点访客详情：谁在何时到过此地、留下了哪些作品。
 * 以「经纬度」归并（见 buildClusterIndex），不受古称写法差异影响。
 * 供「点击地图地点 → 访客面板」使用（迭代 11）。
 *
 * @param radius 坐标容差（度）。城市标注的经纬度与节点略有出入，0.5° 足以覆盖，
 *               又不至于误并相邻州府（如大名与汤阴相距约 0.65°，会被正确排除）。
 */
export function placeDetailAt(lng: number, lat: number, radius = 0.5): PlaceDetail | null {
  const c = nearestCluster(lng, lat, radius);
  if (!c) return null;
  const groups: PlaceVisitorGroup[] = [...c.byPoet.values()].map((g) => ({
    poet: g.poet,
    visits: [...g.visits].sort((a, b) => a.year - b.year),
  }));
  groups.sort((a, b) => {
    const ay = a.visits[0]?.year ?? 0;
    const by = b.visits[0]?.year ?? 0;
    return ay - by;
  });
  let totalWorks = 0;
  for (const g of groups) for (const v of g.visits) totalWorks += v.works.length;
  return {
    name: c.name,
    modern: c.modern,
    lng: c.lng,
    lat: c.lat,
    totalVisitors: groups.length,
    totalWorks,
    groups,
  };
}

/** 仅取诗人姓名（供地图城市标注 hover 提示；迭代 11 改为坐标归并，修正古称不一致） */
export function visitorNamesAt(lng: number, lat: number, radius = 0.5): string[] {
  const d = placeDetailAt(lng, lat, radius);
  if (!d) return [];
  return d.groups.map((g) => g.poet.name);
}

/** 全量地点（无关键词时使用，供「地点浏览」用，按热度降序） */
export function allPlaces(): PlaceHit[] {
  return buildPlaceIndex()
    .map((agg) => ({
      kind: 'place' as const,
      place: agg.place,
      modernPlace: agg.modernPlace,
      lng: agg.lng,
      lat: agg.lat,
      poets: getPoets().filter((p) => agg.poetIds.has(p.id)),
      workCount: agg.workCount,
      score: agg.poetIds.size * 10 + agg.workCount,
    }))
    .sort((a, b) => b.score - a.score);
}
