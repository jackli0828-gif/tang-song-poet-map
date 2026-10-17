/**
 * 内置中国省级行政区划 GeoJSON（离线，不请求任何在线瓦片/地图服务）
 * ------------------------------------------------------------------
 * 数据来源：阿里云 DataV.GeoAtlas（https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json）
 *          该数据依据国家测绘主管部门发布的标准地图绘制。
 * 处理方式：Douglas-Peucker 抽稀（容差 0.02°）+ 坐标保留 3 位小数；
 *          并在导出前做「绕向归一化」（见下）。
 * 合规声明：数据完整包含中国台湾省、海南省、香港特别行政区、澳门特别行政区
 *          及南海诸岛（断续线），任何情况下不得裁剪、割裂或改绘上述领土要素。
 *          本项目不使用任何境外地图瓦片或在线地图 SDK。
 *
 * ⚠ 绕向归一化（关键）
 * 阿里云 DataV 的 GeoJSON 遵循 RFC 7946 的右手定则：外环为**逆时针（CCW）**。
 * 而 d3-geo 采用球面多边形约定：小于半球的多边形**外环必须顺时针（CW）**，
 * 洞环取相反绕向。若直接使用原始绕向，d3 的 clipAntimeridian 会把每个省
 * 解释成「整个球面减去该省」，从而在 path 中额外生成一段铺满投影面的巨弧，
 * 导致 34 个省的 getBBox 全部等于整张画布、中国轮廓完全不可见。
 * 因此这里统一把外环 reverse 成 CW、洞环 reverse 成 CCW。
 *
 * 性能说明（迭代 1）：
 * 全部导出均为模块级常量 —— 归一化只在模块首次加载时执行一次，
 * 任何组件/多组件引用共享同一份结果，避免重复归一化。
 */
import raw from './china-geo.json';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

/** 省级要素属性 */
export interface ProvinceProps {
  adcode: number | string;
  name: string;
  level?: string;
  /** 南海断续线（十段线）标记为 true */
  isDashLine?: boolean;
  center?: [number, number];
  centroid?: [number, number];
}

export type ChinaFeatureCollection = FeatureCollection<Geometry, ProvinceProps>;
export type ChinaFeature = Feature<Geometry, ProvinceProps>;

type Ring = [number, number][];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

/**
 * 平面 shoelace 有符号面积。
 * @returns >0 表示逆时针（CCW），<0 表示顺时针（CW），0 表示退化环
 */
export function signedArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** 按目标绕向归一化单个环 */
function normalizeRing(ring: Ring, wantClockwise: boolean): Ring {
  const area = signedArea(ring);
  if (area === 0) return ring;
  const isClockwise = area < 0;
  return isClockwise === wantClockwise ? ring : ring.slice().reverse();
}

/** 归一化单个多边形：第 0 环为外环（CW），其余为洞环（CCW） */
function normalizePolygon(rings: PolygonCoords): PolygonCoords {
  return rings.map((ring, index) => normalizeRing(ring, index === 0));
}

function normalizeGeometry(geometry: Geometry): Geometry {
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: normalizePolygon(geometry.coordinates as PolygonCoords) };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: (geometry.coordinates as MultiPolygonCoords).map(normalizePolygon),
    };
  }
  return geometry;
}

/**
 * 绕向归一化：外环统一顺时针，洞环统一逆时针（d3-geo 球面约定）。
 * 说明：该函数每次调用都会重新遍历原始几何（约 1.5 万环）做绕向判定，
 * 仅供调试使用；应用运行期请使用已归一化的 chinaGeo / provinceFeatures 等模块级缓存。
 */
export function normalizeWinding(collection: ChinaFeatureCollection): ChinaFeatureCollection {
  return {
    ...collection,
    features: collection.features.map((f) => ({ ...f, geometry: normalizeGeometry(f.geometry) })),
  };
}

/** 内置全国省级边界（含南海诸岛断续线）——模块级缓存，仅在模块加载时归一化一次 */
export const chinaGeo: ChinaFeatureCollection = normalizeWinding(raw as unknown as ChinaFeatureCollection);

/** 省级面（不含断续线），用于填充与着色（模块级缓存，多组件共享） */
export const provinceFeatures: ChinaFeature[] = chinaGeo.features.filter((f) => !f.properties.isDashLine);

/** 南海诸岛断续线（模块级缓存） */
export const dashLineFeatures: ChinaFeature[] = chinaGeo.features.filter((f) => f.properties.isDashLine);
