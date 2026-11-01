/**
 * 诗人数据的「两级加载」门面（迭代 19 · 首屏拆分）
 * ==================================================================
 * 问题：
 *   poets.ts 连同 9 个数据分片（poets-t1..t4 / s1..s4 / x1）合计
 *   约 3.4 MB 源码、**298 KB gzip**，占主 chunk 的八成以上。它们被静态
 *   import，于是「下载 1.3 MB JS → 解析 → 才能挂载 React」成为首屏必经之路；
 *   而且任何一处 UI 改动都会改变主 chunk 的 hash，用户得把 300 KB 数据重下一次。
 *
 * 解法（两级）：
 *   一级 · 名录索引 `poets-meta.ts`（12.6 KB gzip，同步）
 *         —— 姓名 / 字号 / 籍贯 / 生卒 / 节点数 / 作品数。名录、朝代筛选、
 *            按名检索、顶栏统计、年份初值全部够用，**首屏即可渲染**。
 *   二级 · 详情 `poets.ts`（≈298 KB gzip，动态 import）
 *         —— 年谱节点、作品全文、小传。点开地图 / 时间轴 / 对照视图才需要。
 *            独立成 chunk 后与业务代码解耦，长期命中缓存。
 *
 * 约束（踩过的坑）：
 *   1. 本模块**绝不能静态 import './poets'**，否则整个拆分前功尽弃。
 *      需要详情时一律走 `await import('./poets')`。
 *   2. `POETS` 是**可原地改写**的数组（works-add 会把辞典补录作品挂到节点上），
 *      所以对外只暴露 `getPoets()` 返回同一引用，**不要重建数组/对象身份**
 *      —— 早期试过重建身份 + 通知，React 重挂载时读到失效引用，整站白屏。
 *   3. 详情未载入时 `getPoets()` 返回空数组、`getPoetMap()` 返回空对象，
 *      而不是抛错：这样模块可以安全地在任何时刻被读取，由 UI 决定怎么呈现。
 *      唯一要求是**依赖 nodes 的组件必须挂在 BootGate 之后**（见 App.tsx）。
 */

import type { Poet } from '../types';
import { META_STATS, POETS_META, POET_META_MAP, type PoetMeta } from './poets-meta';

export { POETS_META, POET_META_MAP, META_STATS };
export type { PoetMeta };

/* ------------------------------------------------------------------
 * 详情（二级）加载状态
 * ------------------------------------------------------------------ */

let poets: Poet[] = [];
let poetMap: Record<string, Poet> = {};
let loaded = false;
let loadingPromise: Promise<void> | null = null;

/** 每次状态推进 +1，供 useSyncExternalStore 取快照 */
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((cb) => cb());
}

/** 已载入的诗人详情；未载入时为空数组 */
export function getPoets(): Poet[] {
  return poets;
}

/** 已载入的 id → 诗人索引；未载入时为空对象 */
export function getPoetMap(): Record<string, Poet> {
  return poetMap;
}

export function isPoetsLoaded(): boolean {
  return loaded;
}

export function getPoetsVersion(): number {
  return version;
}

export function subscribePoets(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * 载入诗人详情（幂等，可重复调用）。
 * 失败时清掉缓存的 promise，否则后续重试拿到的永远是同一个已拒绝的 promise。
 */
export function ensurePoetsLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const mod = await import('./poets');
      // 保持模块给出的数组引用：works-add 之后会原地改写它，引用不能换
      poets = mod.POETS;
      poetMap = mod.POET_MAP;
      loaded = true;
      emit();
    } catch (e) {
      loadingPromise = null;
      throw e;
    }
  })();
  return loadingPromise;
}

/* ------------------------------------------------------------------
 * 顶栏统计：首屏用 meta 数字，补录语料并入后再刷新
 * ------------------------------------------------------------------ */

export interface DataStats {
  poets: number;
  tang: number;
  song: number;
  nodes: number;
  works: number;
}

/**
 * 初始值直接取 meta 统计 —— 与「详情 + 补录都已载入前」的真实数字一致
 * （474 家 / 182 唐 · 292 宋 / 1636 节点 / 847 基础作品），
 * 因此顶栏在首屏显示的数字不会先错后对。
 */
let stats: DataStats = {
  poets: META_STATS.poets,
  tang: META_STATS.tang,
  song: META_STATS.song,
  nodes: META_STATS.nodes,
  works: META_STATS.works,
};
let statsVersion = 0;
const statsListeners = new Set<() => void>();

export function getStats(): DataStats {
  return stats;
}

export function getStatsVersion(): number {
  return statsVersion;
}

export function subscribeStats(cb: () => void): () => void {
  statsListeners.add(cb);
  return () => {
    statsListeners.delete(cb);
  };
}

function setStats(next: DataStats): void {
  if (
    next.poets === stats.poets &&
    next.tang === stats.tang &&
    next.song === stats.song &&
    next.nodes === stats.nodes &&
    next.works === stats.works
  ) {
    return;
  }
  stats = next;
  statsVersion += 1;
  statsListeners.forEach((cb) => cb());
}

/* ------------------------------------------------------------------
 * 「辞典补录」语料（works-add + work-plink）
 * ------------------------------------------------------------------ */

let supplementPromise: Promise<void> | null = null;
let supplementLoaded = false;

/**
 * 载入并并入辞典补录语料。
 * 内部先确保详情已载入（补录要挂到 POETS 的节点上），再动态取回并入函数。
 * 并入完成后刷新顶栏统计（作品数会从 847 涨到 2066）。
 */
export function loadSupplements(): Promise<void> {
  if (supplementPromise) return supplementPromise;
  supplementPromise = (async () => {
    try {
      await ensurePoetsLoaded();
      const mod = await import('./poets');
      await mod.loadSupplements();
      supplementLoaded = true;
      const s = mod.DATA_STATS;
      setStats({
        poets: s.poets,
        tang: s.tang,
        song: s.song,
        nodes: s.nodes,
        works: s.works,
      });
      // 补录作品已挂上节点：通知详情消费方重取
      emit();
    } catch (e) {
      supplementPromise = null;
      throw e;
    }
  })();
  return supplementPromise;
}

export function isSupplementLoaded(): boolean {
  return supplementLoaded;
}
