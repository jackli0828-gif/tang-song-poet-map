/** 追加作品质检：散文残留 / 过短 / 体裁分布 / 抽样 */
import { writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const r = await build({
  entryPoints: [resolve(ROOT, 'src/data/poets.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  absWorkingDir: ROOT,
});
writeFileSync(resolve(ROOT, 'scripts/_tmp2.mjs'), r.outputFiles[0].text);
const m = await import(pathToFileURL(resolve(ROOT, 'scripts/_tmp2.mjs')).href);
const P = m.POETS;

/** 评注用语（正文里几乎不可能出现） */
const MARK =
  /诗人|词人|这首|此词|此诗|本篇|本词|本诗|该词|该诗|作者|这是|题目|上片|下片|写于|作于|年号|年间|大约|可见|历来|就是|可以说|接着|下面|起句|盖因|然则|首联|颔联|颈联|尾联|一联|全诗|全词|看来|再说|再看|至于|首先|其次|最后|总之|综上|所以|因此|不过|其实|当然|显然|何况|譬如|例如|不难|相传|故址|在今|治今|今属|《全唐诗》/;

const isAdd = (w) => /-wa\d+$/.test(w.id);
const bare = (s) => s.replace(/[。，！？；、\s]/g, '');
let all = 0;
const bad = [];
const long = [];
const short = [];
const genre = new Map();
for (const p of P)
  for (const nd of p.nodes)
    for (const w of nd.works) {
      if (!isAdd(w)) continue;
      all++;
      genre.set(w.genre, (genre.get(w.genre) || 0) + 1);
      const ft = w.fullText || '';
      const sents = ft.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
      const avg = sents.reduce((a, s) => a + bare(s).length, 0) / Math.max(sents.length, 1);
      if (MARK.test(ft)) bad.push(`${p.name}|${w.title}|${ft.slice(0, 60)}`);
      else if (avg > 22) long.push(`${p.name}|${w.title}|avg=${avg.toFixed(1)}|${ft.slice(0, 60)}`);
      if (bare(ft).length < 20) short.push(`${p.name}|${w.title}|${ft}`);
    }

console.log('追加作品总数:', all);
console.log('评注用语残留:', bad.length);
bad.slice(0, 25).forEach((b) => console.log('  ', b));
console.log('句均长 >22（疑似散文）:', long.length);
long.slice(0, 25).forEach((b) => console.log('  ', b));
console.log('过短(<20字):', short.length);
short.slice(0, 10).forEach((x) => console.log('  ', x));
console.log('体裁分布:');
[...genre.entries()].sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log(`   ${g}: ${n}`));
