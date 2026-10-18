#!/usr/bin/env node
/**
 * cider-batches.mjs — 切分补录批次包
 * 输入：_cider/cider-tang.json / cider-song.json / diff-report.json
 * 输出：_cider/batches/add-<dyn>-<n>.json（每批 ≤14 家缺失作者，含 bio + 作品原文 + 建议节点数）
 *
 * 批次规则：
 * - 缺失作者按「作品数降序 → 辞典原序」切批，优先让热门诗人集中在早期批次（方便用户尽早看到）
 * - 每批附 _spec.md 指针与数据文件指引（poets-t4.ts / poets-s4.ts）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const B = resolve(here, '_cider', 'batches');
mkdirSync(B, { recursive: true });

const tang = JSON.parse(readFileSync(resolve(here, '_cider', 'cider-tang.json'), 'utf-8'));
const song = JSON.parse(readFileSync(resolve(here, '_cider', 'cider-song.json'), 'utf-8'));
const diff = JSON.parse(readFileSync(resolve(here, '_cider', 'diff-report.json'), 'utf-8'));

// 按名字建索引，把 bio/works 从 cider 语料里找回来
// （diff-report 的 missing 项在 JSON 序列化后丢了对象原型，works 可能变成 number，需重新取）
function enrich(missing, ciderAuthors) {
  const byName = new Map(ciderAuthors.map((a) => [a.name, a]));
  for (const m of missing) {
    const src = byName.get(m.name);
    if (src) {
      m.bio = src.bio;
      m.works = src.works; // 完整的 works 对象数组
    }
  }
}
enrich(diff.tang.missing, tang.authors);
enrich(diff.song.missing, song.authors);

const BATCH_SIZE = 14;

function makeBatches(missing, prefix, dataFile) {
  // 按作品数降序（热门优先），稳定排序；works 可能是数组（enrich 后）或数字（原始）
  const wCount = (a) => (Array.isArray(a.works) ? a.works.length : (a.works ?? 0));
  const sorted = [...missing].sort((a, b) => wCount(b) - wCount(a));
  const files = [];
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const batch = sorted.slice(i, i + BATCH_SIZE);
    const n = Math.floor(i / BATCH_SIZE) + 1;
    const fname = `${prefix}-add-${String(n).padStart(2, '0')}.json`;
    const payload = {
      batch: fname,
      dataFile,
      spec: 'docs/batch-spec.md',
      ciderSource: `scripts/_cider/${prefix === 't' ? 'cider-tang.json' : 'cider-song.json'}`,
      note: '补录辞典缺失作者。小传取自该作者的 bio 字段；作品全文取 works[].body（含赏析尾文，需裁掉赏析只留诗/词正文：正文为连续 5/7 言句或词牌名后接作者名行之前的部分；赏析一般以「这是一/这首/《标题》写/《标题》是/全诗/全词」起笔，或落在「（署名）」处止）。同一地点多篇作品合并进同一 node.works。零作品作者按生平事件建 3-5 个节点，works 留空数组。',
      authors: batch,
    };
    writeFileSync(resolve(B, fname), JSON.stringify(payload, null, 1), 'utf-8');
    files.push({ file: fname, authors: batch.length, works: batch.reduce((s, a) => s + wCount(a), 0) });
  }
  return files;
}

const tBatches = makeBatches(diff.tang.missing, 't', 'poets-t4.ts');
const sBatches = makeBatches(diff.song.missing, 's', 'poets-s4.ts');

console.log('=== 补录批次 ===');
console.log(`唐册缺失 ${diff.tang.missing.length} 家 → ${tBatches.length} 批：`);
for (const b of tBatches) console.log(`  ${b.file}: ${b.authors} 家 / ${b.works} 篇  首家: ${(JSON.parse(readFileSync(resolve(B, b.file), 'utf-8'))).authors[0].name}`);
console.log(`\n宋册缺失 ${diff.song.missing.length} 家 → ${sBatches.length} 批：`);
for (const b of sBatches) console.log(`  ${b.file}: ${b.authors} 家 / ${b.works} 篇  首家: ${(JSON.parse(readFileSync(resolve(B, b.file), 'utf-8'))).authors[0].name}`);
