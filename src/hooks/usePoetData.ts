/**
 * 诗人数据的两级加载 · React 绑定
 * ------------------------------------------------------------------
 * 把 poetStore 的外部状态接进 React：
 *   · usePoetsReady() —— 详情（年谱 / 作品 / 全文）是否已载入
 *   · usePoetsVersion() —— 详情版本号（载入完成、补录并入时 +1）
 *   · useStats() —— 顶栏统计（首屏即取 meta 数字，补录并入后自动刷新）
 *
 * 单独成文件，是为了让 `data/poetStore.ts` 保持无框架依赖（脚本也能直接引）。
 */
import { useSyncExternalStore } from 'react';
import {
  getPoetsVersion,
  getStats,
  isPoetsLoaded,
  subscribePoets,
  subscribeStats,
  type DataStats,
} from '../data/poetStore';

/**
 * 详情是否已载入。
 * 快照取「版本号」而非布尔值：补录语料并入是原地改写，不会产生新的数组引用，
 * 只有版本号能如实反映「内容变了」。
 */
export function usePoetsReady(): boolean {
  useSyncExternalStore(subscribePoets, getPoetsVersion, getPoetsVersion);
  return isPoetsLoaded();
}

/** 详情版本号：载入完成 / 补录并入时递增，用于让依赖详情的 memo 重算 */
export function usePoetsVersion(): number {
  return useSyncExternalStore(subscribePoets, getPoetsVersion, getPoetsVersion);
}

/** 顶栏统计（首屏来自 meta，补录并入后自动更新） */
export function useStats(): DataStats {
  return useSyncExternalStore(subscribeStats, getStats, getStats);
}
