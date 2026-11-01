#!/usr/bin/env node
/**
 * 名录索引生成器：从 src/data/poets*.ts 抽出轻量 meta → src/data/poets-meta.ts
 * ==================================================================
 * 为什么要拆：
 *   详情数据（nodes / works / fullText）占产物 93%，但界面一次只显示 1–3 位诗人；
 *   而左侧名录、朝代筛选、按名检索只需要「姓名 / 字号 / 籍贯 / 小传 / 生卒」。
 *   把 meta 抽出来，首屏就能立刻渲染名录，详情改为异步加载。
 *
 * 做法：esbuild 把 poets.ts 打成 CJS → require → 取字段 → 生成 TS 文件。
 * 生成物 `src/data/poets-meta.ts` **不要手改**，改数据后重新运行：
 *   npm run gen:meta
 *
 * `npm run check:meta` 会校验生成物与源数据是否同步（CI / verify 用）。
 */
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'src/data/poets-meta.ts');
const checkMode = process.argv.includes('--check');

/** 用 esbuild 把 TS 数据模块打成临时 CJS，再 import 出来 */
async function loadPoets() {
  // 注意：不要 spawn node_modules/.bin/esbuild —— Windows 上那是 shell 脚本，
  // execFileSync 会 ENOENT。直接用 esbuild 的 Node API。
  const { build } = await import('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'poetmeta-'));
  const entry = join(dir, 'entry.ts');
  const outfile = join(dir, 'entry.cjs');
  writeFileSync(
    entry,
    `import { POETS } from ${JSON.stringify(resolve(root, 'src/data/poets.ts'))};\nexport { POETS };\n`,
  );
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile,
      logLevel: 'error',
    });
    const mod = await import(pathToFileURL(outfile).href);
    return mod.POETS;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const poets = await loadPoets();

const meta = poets.map((p) => ({
  id: p.id,
  name: p.name,
  courtesy: p.courtesy ?? null,
  pseudonym: p.pseudonym ?? null,
  dynasty: p.dynasty,
  birthYear: p.birthYear,
  deathYear: p.deathYear,
  birthplace: p.birthplace,
  avatarColor: p.avatarColor,
  nodeCount: p.nodes.length,
  workCount: p.nodes.reduce((s, n) => s + n.works.length, 0),
}));

// 自检：meta 的合计必须与详情一致，否则统计数字会飘
const totalNodes = meta.reduce((s, m) => s + m.nodeCount, 0);
const totalWorks = meta.reduce((s, m) => s + m.workCount, 0);
const tang = meta.filter((m) => m.dynasty === '唐').length;
const song = meta.filter((m) => m.dynasty === '宋').length;
if (tang + song !== meta.length) {
  console.error(`[gen-meta] 存在非唐非宋的诗人：${meta.length - tang - song} 位`);
  process.exit(1);
}

const lines = [];
lines.push('/**');
lines.push(' * 诗人名录索引（**自动生成，请勿手改**）');
lines.push(' * ------------------------------------------------------------------');
lines.push(' * 由 scripts/gen-poets-meta.mjs 从 src/data/poets*.ts 抽取。');
lines.push(' * 改动诗人数据后运行：npm run gen:meta');
lines.push(' * 校验是否同步：npm run check:meta');
lines.push(' *');
lines.push(' * 作用：名录 / 朝代筛选 / 按名检索 / 顶栏统计只需要这些字段，');
lines.push(' *      不必等 3.4 MB 的详情数据（nodes + works + 全文）下载解析完。');
lines.push(' *');
lines.push(' * 刻意不含 `brief`（小传）：474 条小传约 130 KB，会把这份索引撑到 220 KB。');
lines.push(' * 按小传关键词检索在详情加载后走 POETS（见 useFilteredPoets），功能不丢。');
lines.push(' */');
lines.push('');
lines.push('export interface PoetMeta {');
lines.push('  id: string;');
lines.push('  name: string;');
lines.push('  courtesy: string | null;');
lines.push('  pseudonym: string | null;');
lines.push("  dynasty: '唐' | '宋';");
lines.push('  birthYear: number;');
lines.push('  deathYear: number;');
lines.push('  birthplace: string;');
lines.push('  avatarColor: string;');
lines.push('  /** 年谱节点数（详情加载前即可用于统计） */');
lines.push('  nodeCount: number;');
lines.push('  /** 基础语料的作品数（不含「辞典补录」，后者由 works-add 异步并入） */');
lines.push('  workCount: number;');
lines.push('}');
lines.push('');
lines.push(`export const POETS_META: PoetMeta[] = [`);
for (const m of meta) {
  lines.push(
    `  { id: ${JSON.stringify(m.id)}, name: ${JSON.stringify(m.name)}, courtesy: ${JSON.stringify(m.courtesy)}, ` +
      `pseudonym: ${JSON.stringify(m.pseudonym)}, dynasty: ${JSON.stringify(m.dynasty)}, ` +
      `birthYear: ${m.birthYear}, deathYear: ${m.deathYear}, birthplace: ${JSON.stringify(m.birthplace)}, ` +
      `avatarColor: ${JSON.stringify(m.avatarColor)}, nodeCount: ${m.nodeCount}, workCount: ${m.workCount} },`,
  );
}
lines.push('];');
lines.push('');
lines.push('/** id → meta（名录 / 筛选 / 统计用） */');
lines.push('export const POET_META_MAP: Record<string, PoetMeta> = POETS_META.reduce(');
lines.push('  (acc, m) => {');
lines.push('    acc[m.id] = m;');
lines.push('    return acc;');
lines.push('  },');
lines.push('  {} as Record<string, PoetMeta>,');
lines.push(');');
lines.push('');
lines.push('/** meta 合计统计（首屏即可显示，无需等详情加载） */');
lines.push('export const META_STATS = {');
lines.push('  poets: POETS_META.length,');
lines.push(`  tang: ${tang},`);
lines.push(`  song: ${song},`);
lines.push(`  nodes: ${totalNodes},`);
lines.push(`  works: ${totalWorks},`);
lines.push('};');
lines.push('');

const text = lines.join('\n');

if (checkMode) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    console.error('[gen-meta] 找不到 src/data/poets-meta.ts，请先运行 npm run gen:meta');
    process.exit(1);
  }
  if (current.replace(/\r\n/g, '\n') !== text) {
    console.error(
      '[gen-meta] poets-meta.ts 与诗人数据不同步。\n' +
        '           改过 poets*.ts 之后请运行：npm run gen:meta',
    );
    process.exit(1);
  }
  console.log(
    `[gen-meta] OK — 已同步（${meta.length} 位 / 唐 ${tang} · 宋 ${song} / 节点 ${totalNodes} / 基础作品 ${totalWorks}）`,
  );
} else {
  writeFileSync(OUT, text);
  const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
  console.log(
    `[gen-meta] 已生成 ${kb} KB：${meta.length} 位（唐 ${tang} · 宋 ${song}）/ 节点 ${totalNodes} / 基础作品 ${totalWorks}`,
  );
}
