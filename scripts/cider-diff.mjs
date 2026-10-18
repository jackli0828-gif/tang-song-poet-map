#!/usr/bin/env node
/**
 * cider-diff.mjs — 辞典语料 vs 现有数据 差集
 * 输出：scripts/_cider/diff-report.json
 *   - missing_tang / missing_song：辞典有、项目无的作者（含作品数）
 *   - matched：两边都有（用于后续校对批次切分）
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'node_modules', '.cache', 'poets-diff.mjs');

await build({
  entryPoints: [resolve(root, 'src', 'data', 'poets.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
});
const { POETS } = await import(pathToFileURL(out).href);

const ciderTang = JSON.parse(readFileSync(resolve(here, '_cider', 'cider-tang.json'), 'utf-8'));
const ciderSong = JSON.parse(readFileSync(resolve(here, '_cider', 'cider-song.json'), 'utf-8'));

// 项目名字集合（精确匹配，不再做 alias 归并——避免自映射污染反转表）
const projNames = new Set(POETS.map((p) => p.name));

// 已知「辞典写法 → 项目写法」的少量真实差异
const CIDER_ALIAS = {
  '高適': '高适',
  '晏几道': '晏幾道',
  '晁端礼': '晁元礼',
};

// 现有作品的 title 集合（按诗人），用 normTitle 归一
const haveWorks = new Map(); // poetName -> Set(normTitle)
for (const p of POETS) {
  const s = new Set();
  for (const n of p.nodes) for (const w of n.works) s.add(normTitle(w.title));
  haveWorks.set(p.name, s);
}

function normTitle(t) {
  // 去空格、去方括号/圆括号注释（含 [1]、[一]、(其一) 等）
  return t.replace(/\s/g, '').replace(/[\[（(][^\]）)]*[\]）)]/g, '').replace(/[《》]/g, '');
}

function matchCiderToProject(ciderName) {
  const proj = CIDER_ALIAS[ciderName] ?? ciderName;
  if (projNames.has(proj)) return POETS.find((p) => p.name === proj);
  return null;
}

function diff(cider) {
  const missing = [];
  const matched = [];
  const ambiguous = [];
  for (const a of cider.authors) {
    if (a.name.length < 2 || a.name === '?') {
      ambiguous.push({ ciderName: a.name, works: a.works.length });
      continue;
    }
    const proj = matchCiderToProject(a.name);
    if (proj) {
      const projWorks = haveWorks.get(proj.name) ?? new Set();
      const ciderWorkTitles = new Set(a.works.map((w) => normTitle(w.title)));
      const missingWorks = [...ciderWorkTitles].filter((t) => !projWorks.has(t));
      matched.push({
        name: a.name, projectAs: proj.name, works: a.works.length,
        missingWorks: missingWorks.length, missingWorkTitles: missingWorks.slice(0, 80),
      });
    } else {
      missing.push({ name: a.name, works: a.works.length, titles: a.works.map((w) => w.title).slice(0, 30) });
    }
  }
  return { missing, matched, ambiguous };
}

const t = diff(ciderTang);
const s = diff(ciderSong);

// 报告
const report = {
  stats: {
    ciderTangAuthors: ciderTang.authors.length,
    ciderSongAuthors: ciderSong.authors.length,
    projectPoets: POETS.length,
  },
  tang: t,
  song: s,
};
writeFileSync(resolve(here, '_cider', 'diff-report.json'), JSON.stringify(report, null, 1), 'utf-8');

console.log('=== 差集报告 ===');
console.log(`唐：辞典 ${t.missing.length + t.matched.length} 家有效 → 匹配 ${t.matched.length} / 缺失 ${t.missing.length} / 名存疑 ${t.ambiguous.length}`);
console.log(`宋：辞典 ${s.missing.length + s.matched.length} 家有效 → 匹配 ${s.matched.length} / 缺失 ${s.missing.length} / 名存疑 ${s.ambiguous.length}`);
console.log('\n唐 · 缺失作者（按作品数降序）：');
for (const m of [...t.missing].sort((a, b) => b.works - a.works).slice(0, 60)) {
  console.log(`  ${m.name}（${m.works} 篇）${m.titles.slice(0, 3).join('、')}${m.titles.length > 3 ? '…' : ''}`);
}
console.log('\n宋 · 缺失作者（按作品数降序）：');
for (const m of [...s.missing].sort((a, b) => b.works - a.works).slice(0, 60)) {
  console.log(`  ${m.name}（${m.works} 篇）${m.titles.slice(0, 3).join('、')}${m.titles.length > 3 ? '…' : ''}`);
}
console.log('\n名存疑（辞典端切分异常，需人工看）：', [
  ...t.ambiguous.map((x) => x.ciderName),
  ...s.ambiguous.map((x) => x.ciderName),
]);
const mw = t.matched.filter((m) => m.missingWorks > 0).length + s.matched.filter((m) => m.missingWorks > 0).length;
console.log(`\n匹配者中「辞典有、项目缺作品」的：${mw} 家（标题比对，粗粒度）`);
