/**
 * 把 src/data/poets.ts（含 applyWorksAdd）用 esbuild 编译成 .mjs 再 dump 成 JSON。
 * 目的：拿到**运行时真实**的 POETS（含 works-add 追加作品），供地点分析脚本使用。
 *
 * 用法: node scripts/_dump-poets.mjs
 * 输出: scripts/_cider/poets-dump.json
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const tmp = resolve(root, '.tmp');
mkdirSync(tmp, { recursive: true });
const outfile = resolve(tmp, 'poets.bundle.mjs');

await build({
  entryPoints: [resolve(root, 'src/data/poets.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'error',
});

const mod = await import(pathToFileURL(outfile).href + '?t=' + Date.now());
const POETS = mod.POETS;
if (!Array.isArray(POETS)) throw new Error('POETS 导出缺失');

let poets = 0, nodes = 0, works = 0;
for (const p of POETS) {
  poets += 1;
  for (const n of p.nodes || []) {
    nodes += 1;
    works += (n.works || []).length;
  }
}
console.log(`POETS: ${poets} 位诗人 | ${nodes} 个节点 | ${works} 篇作品`);

writeFileSync(resolve(root, 'scripts/_cider/poets-dump.json'), JSON.stringify(POETS), 'utf8');
console.log('已写入 scripts/_cider/poets-dump.json');

rmSync(tmp, { recursive: true, force: true });
