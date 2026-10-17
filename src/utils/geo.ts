import type { LifeNode } from '../types';

/** 屏幕坐标点 */
export interface Point {
  x: number;
  y: number;
}

/** 视口变换（缩放 + 平移） */
export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

export const DEFAULT_TRANSFORM: ViewTransform = { k: 1, x: 0, y: 0 };

export const MIN_SCALE = 1;
export const MAX_SCALE = 14;

/** 以某屏幕点为锚点缩放：该点在缩放前后屏幕位置不变 */
export function zoomAt(t: ViewTransform, px: number, py: number, factor: number): ViewTransform {
  const k = clamp(t.k * factor, MIN_SCALE, MAX_SCALE);
  const real = k / t.k;
  return {
    k,
    x: px - (px - t.x) * real,
    y: py - (py - t.y) * real,
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 对平移量加边界约束，保证地图任意时刻都在视口内可见。
 * - 内容比视口小：整幅内容完整留在视口内（k=1 时几乎锁死平移）；
 * - 内容比视口大：视口始终被内容铺满（不会露出空白画布）。
 *
 * @param t 待校正的变换
 * @param bounds 内容在未缩放时的包围盒 [[x0,y0],[x1,y1]]
 * @param width 视口宽
 * @param height 视口高
 */
export function clampTranslate(
  t: ViewTransform,
  bounds: [[number, number], [number, number]],
  width: number,
  height: number,
): ViewTransform {
  const [[x0, y0], [x1, y1]] = bounds;
  const left = x0 * t.k; // 内容左边界（未加平移）
  const top = y0 * t.k; // 内容上边界（未加平移）
  const right = x1 * t.k; // 内容右边界（未加平移）
  const bottom = y1 * t.k; // 内容下边界（未加平移）
  /**
   * 单轴夹紧：
   * - 内容 ≤ 视口：整幅内容完整留在视口内 → t ∈ [-near, viewport - far]
   * - 内容 > 视口：视口始终被内容铺满 → t ∈ [viewport - far, -near]
   */
  const solve = (offset: number, near: number, far: number, viewport: number): number => {
    const content = far - near;
    return content <= viewport
      ? clamp(offset, -near, viewport - far)
      : clamp(offset, viewport - far, -near);
  };

  return {
    k: t.k,
    x: solve(t.x, left, right, width),
    y: solve(t.y, top, bottom, height),
  };
}

/**
 * Catmull-Rom 插值生成平滑曲线路径（用于轨迹、河流）。
 * @param pts 有序屏幕点
 * @param tension 张力，0 为直线，越大越弯曲
 */
export function smoothPath(pts: Point[], tension = 0.5): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}L${pts[1].x.toFixed(2)},${pts[1].y.toFixed(2)}`;
  }
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1];
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * 按参数 t（0–1，以「段」为单位）截取部分点列（用于轨迹「生长」动画）。
 * 例如 t=0.5、共 4 段时，取前 2 段完整点 + 第 3 段的插值点。
 */
export function partialPoints(pts: Point[], t: number): Point[] {
  if (pts.length === 0) return [];
  const total = pts.length - 1;
  const pos = clamp(t, 0, 1) * total;
  const full = Math.floor(pos);
  const frac = pos - full;
  const out: Point[] = [];
  for (let i = 0; i <= Math.min(full, total); i++) out.push(pts[i]);
  if (frac > 0.001 && full < total) {
    const a = pts[full];
    const b = pts[full + 1];
    out.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac });
  }
  return out;
}

/** 生成「已生长」部分的平滑路径字符串 */
export function growthPath(pts: Point[], t: number, tension = 0.5): string {
  return smoothPath(partialPoints(pts, t), tension);
}

/** 节点按时间排序（防御性：数据已升序） */
export function sortNodes(nodes: LifeNode[]): LifeNode[] {
  return [...nodes].sort((a, b) => a.year - b.year);
}

/**
 * 依据当前年份，计算轨迹进度（0–1，按节点序号均匀分布）与当前节点索引。
 * 采用「节点等距 + 段内线性」的方式，使播放时逐节点推进更均匀。
 */
export function progressAt(nodes: LifeNode[], year: number): { progress: number; index: number; segT: number } {
  const n = nodes.length;
  if (n === 0) return { progress: 0, index: -1, segT: 0 };
  if (n === 1) return { progress: 1, index: 0, segT: 1 };
  const first = nodes[0].year;
  const last = nodes[n - 1].year;
  if (year <= first) return { progress: 0, index: 0, segT: 0 };
  if (year >= last) return { progress: 1, index: n - 1, segT: 1 };
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (year >= nodes[i].year && year <= nodes[i + 1].year) {
      idx = i;
      break;
    }
  }
  const span = nodes[idx + 1].year - nodes[idx].year || 1;
  const segT = clamp((year - nodes[idx].year) / span, 0, 1);
  const progress = (idx + segT) / (n - 1);
  return { progress, index: idx, segT };
}

/** 当前「已到达」的节点索引：最后一个 year <= 当前年的节点 */
export function activeNodeIndex(nodes: LifeNode[], year: number): number {
  if (nodes.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].year <= year) idx = i;
  }
  return idx;
}

/**
 * 迭代 5 · 节点防重叠：对屏幕点做轻微互斥松弛，避免多个节点叠成一团。
 *
 * 说明与取舍：
 * - 同一诗人多次到访同一地（如三入长安）、或多位诗人同处一城时，
 *   原始经纬度投影后完全重合，圆点与文字互相压盖、无法分辨；
 * - 这里做「最小位移」松弛：只对距离小于 minDist 的点对彼此推开，
 *   位移量控制在亚像素级迭代内，保证视觉上仍贴合真实地理位置；
 * - 该偏移仅用于绘制，不写回数据，地理精度不受影响。
 *
 * @param pts 原始屏幕点（未缩放坐标）
 * @param minDist 期望的最小间距（未缩放坐标；通常传 像素值 / k）
 * @param iterations 松弛轮数，默认 12 轮足够收敛
 */
export function spreadPoints(pts: Point[], minDist: number, iterations = 12): Point[] {
  const n = pts.length;
  if (n < 2 || minDist <= 0) return pts.map((p) => ({ ...p }));
  const out = pts.map((p) => ({ ...p }));
  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        let d = Math.hypot(dx, dy);
        // 完全重合时给一个确定性的微小方向，避免除零（角度由下标派生，保证稳定）
        if (d < 1e-6) {
          const a = (i * 2.399963 + j * 0.7) % (Math.PI * 2);
          dx = Math.cos(a) * 0.01;
          dy = Math.sin(a) * 0.01;
          d = 0.01;
        }
        if (d >= minDist) continue;
        // 各推开一半的缺口
        const push = (minDist - d) / 2;
        const ux = (dx / d) * push;
        const uy = (dy / d) * push;
        out[i].x -= ux;
        out[i].y -= uy;
        out[j].x += ux;
        out[j].y += uy;
        moved = true;
      }
    }
    if (!moved) break; // 已无冲突，提前收敛
  }
  return out;
}

/**
 * 迭代 8 · 标注避让（贪心去重）：
 * 按数组顺序依次放置标注，凡与「已放置」标注距离小于 minDist 的，本轮不显示。
 * 调用方应把重要度高的排在前面（如都城优先），保证重要的标注先占位。
 *
 * @param items 带 x/y 的项（已按重要度排序）
 * @param minDist 最小间距（与 x/y 同坐标系；屏幕像素需除以缩放 k）
 */
export function declutter<T extends { x: number; y: number }>(items: T[], minDist: number): T[] {
  const kept: T[] = [];
  for (const it of items) {
    let ok = true;
    for (const k of kept) {
      const dx = k.x - it.x;
      const dy = k.y - it.y;
      if (dx * dx + dy * dy < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(it);
  }
  return kept;
}

/** 两点间方向角（弧度），用于绘制箭头 */
export function angleOf(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** 生成箭头三角形顶点（屏幕坐标） */
export function arrowPoints(p: Point, angle: number, size: number): string {
  const w = size * 0.62;
  const p1 = { x: p.x + Math.cos(angle) * size, y: p.y + Math.sin(angle) * size };
  const p2 = { x: p.x + Math.cos(angle + Math.PI / 2) * w, y: p.y + Math.sin(angle + Math.PI / 2) * w };
  const p3 = { x: p.x + Math.cos(angle - Math.PI / 2) * w, y: p.y + Math.sin(angle - Math.PI / 2) * w };
  return `${p1.x.toFixed(2)},${p1.y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ${p3.x.toFixed(2)},${p3.y.toFixed(2)}`;
}

/**
 * 迭代 9 · 轮次 2：节点半径（屏幕基准值，绘制时再除以 k）。
 * 以「此地留下多少作品」加权——作品越多，圆越大，让创作重镇一眼可辨。
 * @param workCount 该节点的作品数
 * @param isActive 是否为当前播放到的节点（当前节点略大，但不叠加作品权重，避免跳动过大）
 */
export function nodeRadius(workCount: number, isActive: boolean): number {
  const base = isActive ? 9 : 6.5;
  const wc = Math.min(Math.max(workCount, 0), 5); // 每篇 +0.9，封顶 5 篇
  // 再整体封顶 12：否则「当前节点 + 5 篇」会到 13.5，直径 27px 足以盖住周边地名
  return Math.min(base + wc * 0.9, 12);
}

/** 迭代 9：节点半径上限（屏幕基准值），超出即截断 */
export const MAX_NODE_RADIUS = 12;

/** 迭代 9：判定是否为「创作重镇」（加朱砂双环标记）的阈值 */
export const HUB_WORK_THRESHOLD = 3;

/** 迭代 9：是否为创作重镇 */
export function isHubNode(workCount: number): boolean {
  return workCount >= HUB_WORK_THRESHOLD;
}
