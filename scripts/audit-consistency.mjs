/**
 * 内部一致性校验（纯本地规则，不依赖网络）
 * ------------------------------------------------------------------
 * 1. 节点 age 是否等于 year - birthYear
 * 2. 作品/节点系年是否落在作者生卒区间内
 * 3. id 全局唯一性
 * 4. 同一作品标题是否被多位作者重复收录
 * 5. 籍贯 / 地名 / 经纬度 / 小传 / 作品正文 的完整性
 * 运行：node scripts/audit-consistency.mjs
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'node_modules', '.cache', 'poets-cons.mjs');

await build({
  entryPoints: [resolve(root, 'src', 'data', 'poets.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});

const { POETS } = await import(pathToFileURL(out).href);

const sec = (t) => console.log(`\n=== ${t} ===`);
const list = (arr) => (arr.length ? arr.forEach((s) => console.log('  ' + s)) : console.log('  — 无'));

// 1. age 一致性
const ageBad = [];
for (const p of POETS) {
  if (!p.birthYear) continue;
  for (const n of p.nodes) {
    if (n.age == null) continue;
    const expect = n.year - p.birthYear;
    if (n.age !== expect) ageBad.push(`${p.name} ${n.id} year=${n.year} age=${n.age}，应为 ${expect}`);
  }
}
sec(`节点 age 与 year-birthYear 不符 ${ageBad.length} 条`);
list(ageBad.slice(0, 40));

// 2. 系年越界
const rangeBad = [];
for (const p of POETS) {
  if (!p.birthYear || !p.deathYear) continue;
  for (const n of p.nodes) {
    if (n.year < p.birthYear || n.year > p.deathYear) rangeBad.push(`${p.name} 节点 ${n.id} year=${n.year} 超出 ${p.birthYear}–${p.deathYear}`);
  }
  for (const n of p.nodes) {
    for (const w of n.works ?? []) {
      if (w.year && (w.year < p.birthYear || w.year > p.deathYear))
        rangeBad.push(`${p.name} 作品《${w.title}》 year=${w.year} 超出 ${p.birthYear}–${p.deathYear}`);
    }
  }
}
sec(`系年超出作者生卒区间 ${rangeBad.length} 条`);
list(rangeBad.slice(0, 40));

// 3. id 唯一性
const ids = new Map();
for (const p of POETS) {
  for (const n of p.nodes) {
    if (ids.has(n.id)) console.log(`  重复节点 id: ${n.id}（${ids.get(n.id)} / ${p.name}）`);
    ids.set(n.id, p.name);
    for (const w of n.works ?? []) {
      if (ids.has(w.id)) console.log(`  重复作品 id: ${w.id}（${ids.get(w.id)} / ${p.name}）`);
      ids.set(w.id, p.name);
    }
  }
}
sec('id 全局唯一性');
console.log(`  共 ${ids.size} 个 id，重复检查完成`);

// 4. 标题重复
const byTitle = new Map();
for (const p of POETS) {
  for (const n of p.nodes) {
    for (const w of n.works ?? []) {
      const k = w.title.replace(/\s/g, '');
      if (!byTitle.has(k)) byTitle.set(k, []);
      byTitle.get(k).push(p.name);
    }
  }
}
const dupTitle = [...byTitle.entries()].filter(([, v]) => v.length > 1);
sec(`同一标题被多位作者收录 ${dupTitle.length} 组`);
list(dupTitle.map(([k, v]) => `《${k}》 → ${v.join('、')}`));

// 5. 字段完整性
const noModern = [];
const badCoord = [];
const noFull = [];
const briefShort = [];
const birthNoModern = [];
for (const p of POETS) {
  if (!/今/.test(p.birthplace ?? '')) birthNoModern.push(`${p.name}：「${p.birthplace}」`);
  if ((p.brief ?? '').length < 40) briefShort.push(`${p.name}(${(p.brief ?? '').length}字)`);
  for (const n of p.nodes) {
    if (!n.modernPlace) noModern.push(`${p.name} ${n.id} place=${n.place}`);
    if (typeof n.lng !== 'number' || typeof n.lat !== 'number' || n.lng < 70 || n.lng > 140 || n.lat < 15 || n.lat > 55)
      badCoord.push(`${p.name} ${n.id} ${n.place} (${n.lng},${n.lat})`);
    for (const w of n.works ?? []) {
      if (!w.fullText && !w.excerpt) noFull.push(`${p.name}《${w.title}》`);
    }
  }
}
sec(`籍贯未标注今地 ${birthNoModern.length} 处`);
list(birthNoModern);
sec(`节点缺 modernPlace ${noModern.length} 处`);
list(noModern.slice(0, 20));
sec(`经纬度异常/缺失 ${badCoord.length} 处`);
list(badCoord.slice(0, 20));
sec(`作品缺正文 ${noFull.length} 处`);
list(noFull.slice(0, 30));
sec(`小传过短（<40字） ${briefShort.length} 位`);
list(briefShort);
