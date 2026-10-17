/**
 * 数据摸底：统计收录规模、找出数据偏薄/异常的作者，输出清单供交叉验证与查漏补缺使用。
 * 运行：node scripts/audit-data.mjs
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'node_modules', '.cache', 'poets-audit.mjs');

await build({
  entryPoints: [resolve(root, 'src', 'data', 'poets.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});

const { POETS, DATA_STATS } = await import(pathToFileURL(out).href);

console.log('=== 总览 ===');
console.log('作者', POETS.length, '| 节点', DATA_STATS.nodes, '| 作品', DATA_STATS.works);

const tang = POETS.filter((p) => p.dynasty === '唐');
const song = POETS.filter((p) => p.dynasty === '宋');
console.log(`唐 ${tang.length} 家 · 宋 ${song.length} 家`);

// 异常排查
const noWork = POETS.filter((p) => p.nodes.reduce((s, n) => s + n.works.length, 0) === 0);
const fewNode = POETS.filter((p) => p.nodes.length < 3);
const noBrief = POETS.filter((p) => !p.brief || p.brief.trim().length < 10);
const badYear = POETS.filter((p) => !p.birthYear || !p.deathYear || p.deathYear < p.birthYear);
const noBirthplace = POETS.filter((p) => !p.birthplace);

console.log('\n=== 数据质量排查 ===');
console.log('零作品       :', noWork.length, noWork.map((p) => p.name).join('、') || '—');
console.log('节点<3       :', fewNode.length, fewNode.map((p) => `${p.name}(${p.nodes.length})`).join('、') || '—');
console.log('小传缺失/过短:', noBrief.length, noBrief.map((p) => p.name).join('、') || '—');
console.log('生卒年异常   :', badYear.length, badYear.map((p) => p.name).join('、') || '—');
console.log('籍贯缺失     :', noBirthplace.length, noBirthplace.map((p) => p.name).join('、') || '—');

// 节点年份越界（早于生年或晚于卒年）
const outOfRange = [];
for (const p of POETS) {
  for (const n of p.nodes) {
    if (n.year < p.birthYear || n.year > p.deathYear) outOfRange.push(`${p.name}@${n.year}`);
  }
}
console.log('节点年份越界 :', outOfRange.length, outOfRange.slice(0, 15).join('、') || '—');

// 作品数分布（最少的 12 位，用于查漏补缺）
const worksOf = (p) => p.nodes.reduce((s, n) => s + n.works.length, 0);
const sorted = [...POETS].sort((a, b) => worksOf(a) - worksOf(b));
console.log('\n=== 作品数最少的 12 家 ===');
console.log(sorted.slice(0, 12).map((p) => `${p.name}(${worksOf(p)})`).join('、'));

console.log('\n=== 唐 · 收录名单 ===');
console.log(tang.map((p) => p.name).join('、'));
console.log('\n=== 宋 · 收录名单 ===');
console.log(song.map((p) => p.name).join('、'));
