#!/usr/bin/env node
/**
 * 地图数据打包器：src/data/china-geo.json → src/data/china-geo.packed.json
 * ==================================================================
 * 为什么要打包：原始 GeoJSON 里每个点都是 [116.123,39.456] 这样的文本，
 * 全文件 202 KB（gzip 58 KB），且位于首屏关键路径上。坐标数字是典型的高熵
 * 文本，gzip 压不动。
 *
 * 做法（无损）：
 *   · 坐标 ×1000 取整 —— 原始数据本来就只保留 3 位小数，因此完全无损
 *   · 环内做增量（只存相邻点的差），相邻点差值很小，base36 后 1–3 字符
 *   · 属性数组化（去掉重复的键名）
 * 实测：raw 202.1 → 77.7 KB（-62%），gzip 58.3 → 37.3 KB（-36%）。
 *
 * 用法：
 *   node scripts/gen-geo.mjs          # 生成 / 覆盖 packed 文件
 *   node scripts/gen-geo.mjs --check  # 只校验 packed 是否与源文件同步（CI / verify 用）
 *
 * ⚠️ 修改 china-geo.json 后必须重新运行本脚本，否则地图仍是旧数据。
 *    `npm run check:geo` 会把这种不一致变成构建失败。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'src/data/china-geo.json');
const OUT = resolve(root, 'src/data/china-geo.packed.json');
const SCALE = 1000;

const checkMode = process.argv.includes('--check');

/** 有符号整数 → base36（负数带前导 '-'） */
function enc(n) {
  return n < 0 ? `-${Math.abs(n).toString(36)}` : n.toString(36);
}

/** 单环编码：环内增量，点用 ',' 分隔、点之间用 ';' 分隔 */
function encodeRing(ring) {
  let px = 0;
  let py = 0;
  const parts = [];
  for (const pt of ring) {
    const x = Math.round(pt[0] * SCALE);
    const y = Math.round(pt[1] * SCALE);
    parts.push(`${enc(x - px)},${enc(y - py)}`);
    px = x;
    py = y;
  }
  return parts.join(';');
}

function pack(geo) {
  const features = geo.features.map((f) => {
    const p = f.properties;
    const g = f.geometry.type;
    const polys = g === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return {
      // 属性数组化：省去每个要素重复的键名
      p: [p.adcode, p.name, p.level ?? null, p.isDashLine ? 1 : 0, p.center ?? null, p.centroid ?? null],
      g: g === 'Polygon' ? 'P' : 'M',
      r: polys.map((rings) => rings.map(encodeRing)),
    };
  });
  return { v: 1, s: SCALE, source: geo.source ?? null, f: features };
}

const geo = JSON.parse(readFileSync(SRC, 'utf8'));
const packed = pack(geo);
const text = JSON.stringify(packed);

// 无损校验：解码回来与原始坐标逐点比对，误差必须为 0
function decodeRing(str) {
  const out = [];
  let x = 0;
  let y = 0;
  if (!str) return out;
  for (const tok of str.split(';')) {
    const [a, b] = tok.split(',');
    x += parseInt(a, 36);
    y += parseInt(b, 36);
    out.push([x / SCALE, y / SCALE]);
  }
  return out;
}

let maxErr = 0;
let pointCount = 0;
for (let i = 0; i < geo.features.length; i += 1) {
  const f = geo.features[i];
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (let j = 0; j < polys.length; j += 1) {
    for (let k = 0; k < polys[j].length; k += 1) {
      const back = decodeRing(packed.f[i].r[j][k]);
      const orig = polys[j][k];
      if (back.length !== orig.length) {
        console.error(`[gen-geo] 点数不一致：要素 ${i} 多边形 ${j} 环 ${k}`);
        process.exit(1);
      }
      for (let m = 0; m < orig.length; m += 1) {
        maxErr = Math.max(maxErr, Math.abs(back[m][0] - orig[m][0]), Math.abs(back[m][1] - orig[m][1]));
      }
      pointCount += orig.length;
    }
  }
}

if (maxErr > 1e-9) {
  console.error(`[gen-geo] 编码不是无损的：最大误差 ${maxErr}（原始数据应只有 3 位小数）`);
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

if (checkMode) {
  let current = null;
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    console.error('[gen-geo] 找不到 src/data/china-geo.packed.json，请先运行 npm run gen:geo');
    process.exit(1);
  }
  if (current !== text) {
    console.error(
      '[gen-geo] china-geo.packed.json 与 china-geo.json 不同步。\n' +
        '          修改了源文件后请运行：npm run gen:geo',
    );
    process.exit(1);
  }
  console.log(`[gen-geo] OK — packed 与源文件同步（${kb(text.length)}，${pointCount} 个点，误差 0）`);
} else {
  writeFileSync(OUT, text);
  console.log(
    `[gen-geo] 已生成 ${kb(text.length)}（源 ${kb(readFileSync(SRC).length)}，${pointCount} 个点，误差 0）`,
  );
}
