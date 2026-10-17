/**
 * 为「多源交叉验证」生成分块数据。
 * 把 161 家按朝代顺序切成若干批，每批输出精简 JSON（只含可校验字段），
 * 供校对子代理逐批核对，避免把整份数据塞进上下文。
 * 运行：node scripts/make-xchunks.mjs [批次数=8]
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const BATCHES = Number(process.argv[2] ?? 8);
const outDir = resolve(root, 'scripts', '_xchunks');
const cache = resolve(root, 'node_modules', '.cache', 'poets-xchunk.mjs');

await build({
  entryPoints: [resolve(root, 'src', 'data', 'poets.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: cache,
  logLevel: 'error',
});
const { POETS } = await import(pathToFileURL(cache).href);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 按「唐在前、宋在后，各自按生年升序」排列后再切批，
// 保证同一批作者时代相近，校对时可共用年号/大事记背景。
const ordered = [...POETS].sort((a, b) => {
  if (a.dynasty !== b.dynasty) return a.dynasty === '唐' ? -1 : 1;
  return a.birthYear - b.birthYear;
});

const per = Math.ceil(ordered.length / BATCHES);
const batches = [];
for (let i = 0; i < BATCHES; i++) {
  const slice = ordered.slice(i * per, (i + 1) * per);
  if (slice.length === 0) continue;
  batches.push(slice);
}

batches.forEach((slice, i) => {
  const chunk = slice.map((p) => ({
    id: p.id,
    name: p.name,
    courtesy: p.courtesy ?? null,
    pseudonym: p.pseudonym ?? null,
    dynasty: p.dynasty,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    birthplace: p.birthplace,
    brief: p.brief,
    nodes: p.nodes.map((n) => ({
      id: n.id,
      year: n.year,
      yearRange: n.yearRange ?? null,
      era: n.era ?? null,
      place: n.place,
      modernPlace: n.modernPlace,
      eventType: n.eventType,
      event: n.event,
    })),
    works: p.nodes.flatMap((n) =>
      n.works.map((w) => ({
        id: w.id,
        title: w.title,
        genre: w.genre,
        year: w.year,
        yearLabel: w.yearLabel ?? null,
        place: n.place,
      })),
    ),
  }));
  const file = resolve(outDir, `chunk_${i + 1}.json`);
  writeFileSync(file, JSON.stringify(chunk, null, 2), 'utf8');
  console.log(
    `chunk_${i + 1}.json  作者 ${chunk.length} 位 | 节点 ${chunk.reduce((s, p) => s + p.nodes.length, 0)} | 作品 ${chunk.reduce((s, p) => s + p.works.length, 0)}`,
  );
});

console.log(`\n共 ${batches.length} 批，输出目录：${outDir}`);
