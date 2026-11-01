/**
 * 地图数据解码器：把 scripts/gen-geo.mjs 打包的紧凑格式还原成标准 GeoJSON
 * ------------------------------------------------------------------
 * 打包格式（见 scripts/gen-geo.mjs）：
 *   { v:1, s:1000, source, f:[ { p:[adcode,name,level,isDash,center,centroid],
 *                               g:'P'|'M',
 *                               r:[ 多边形 ][ 环 ][ "dx,dy;dx,dy;…" ] } ] }
 *
 * 坐标按 ×s 取整后存环内增量、base36 编码；原始数据本身只有 3 位小数，
 * 因此 s=1000 的解码是**无损**的（生成脚本会逐点校验误差为 0）。
 *
 * 为什么不在运行时直接用原 JSON：坐标数字是高熵文本，gzip 几乎压不动；
 * 打包后 raw 202 KB → 78 KB，gzip 58 KB → 37 KB，且位于首屏关键路径上。
 */
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { ProvinceProps } from './chinaGeo';

/** 打包后的要素属性元组 */
export type PackedProps = [
  adcode: number | string,
  name: string,
  level: string | null,
  isDashLine: 0 | 1,
  center: [number, number] | null,
  centroid: [number, number] | null,
];

export interface PackedFeature {
  p: PackedProps;
  /** P = Polygon，M = MultiPolygon */
  g: 'P' | 'M';
  /** [多边形][环] = 该环的编码串 */
  r: string[][];
}

export interface PackedGeo {
  v: number;
  s: number;
  source: string | null;
  f: PackedFeature[];
}

/** 有符号 base36 解码 */
function dec(s: string): number {
  return s.charCodeAt(0) === 45 /* '-' */ ? -parseInt(s.slice(1), 36) : parseInt(s, 36);
}

/** 解一个环：环内增量累加还原绝对坐标 */
function decodeRing(str: string, scale: number): [number, number][] {
  const out: [number, number][] = [];
  if (!str) return out;
  let x = 0;
  let y = 0;
  for (const tok of str.split(';')) {
    const comma = tok.indexOf(',');
    x += dec(tok.slice(0, comma));
    y += dec(tok.slice(comma + 1));
    out.push([x / scale, y / scale]);
  }
  return out;
}

/** 解包成标准 GeoJSON FeatureCollection */
export function unpackGeo(packed: PackedGeo): FeatureCollection<Geometry, ProvinceProps> {
  const scale = packed.s;
  const features: Feature<Geometry, ProvinceProps>[] = packed.f.map((pf) => {
    const [adcode, name, level, isDashLine, center, centroid] = pf.p;

    const polygons = pf.r.map((rings) => rings.map((ring) => decodeRing(ring, scale)));

    const geometry: Geometry =
      pf.g === 'P'
        ? { type: 'Polygon', coordinates: polygons[0] ?? [] }
        : { type: 'MultiPolygon', coordinates: polygons };

    const properties: ProvinceProps = {
      adcode,
      name,
      ...(level !== null ? { level } : {}),
      isDashLine: isDashLine === 1,
      ...(center !== null ? { center } : {}),
      ...(centroid !== null ? { centroid } : {}),
    };

    return { type: 'Feature', properties, geometry };
  });

  return { type: 'FeatureCollection', features };
}
