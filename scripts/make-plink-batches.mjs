/**
 * 生成「作品—地点」关联作业批次（只读 poets/works-add，不改数据）
 * ==================================================================
 * 范围：works-add 中能精确对应到辞典条目的作品（约 1075 篇）。
 * 这些作品目前是「按作者已有节点轮转挂载」，background 标注「系年与地点待考」，
 * 本次目标就是从辞典赏析里把它们真正的创作地/系年/事迹挖出来。
 *
 * 产物：
 *   scripts/_cider/plink/known-places.md   —— 现有地图地点表（供作业者复用经纬度，避免重复造点）
 *   scripts/_cider/plink/batch-NN.json     —— 每批作业输入
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const outDir = resolve(root, 'scripts/_cider/plink');
mkdirSync(outDir, { recursive: true });

/* ---------- 1. 现有地点表 ---------- */
const POETS = JSON.parse(readFileSync(resolve(root, 'scripts/_cider/poets-dump.json'), 'utf8'));
const id2poet = new Map(POETS.map((p) => [p.id, p]));
const places = new Map();
for (const p of POETS) {
  for (const n of p.nodes || []) {
    if (!n.place) continue;
    const r = places.get(n.place) || { place: n.place, modern: n.modernPlace || '', lng: n.lng, lat: n.lat, n: 0 };
    r.n += 1;
    if (!r.modern && n.modernPlace) r.modern = n.modernPlace;
    places.set(n.place, r);
  }
}
const known = [...places.values()].sort((a, b) => b.n - a.n);
const md = [
  '# 现有地图地点表（复用优先）',
  '',
  `共 ${known.length} 个地名。作业判定创作地时，**若命中本表，必须原样使用其 modern/lng/lat**，不要另造近似地点。`,
  '',
  '| 古称 | 今地 | 经度 | 纬度 | 节点数 |',
  '|---|---|---|---|---|',
  ...known.map((r) => `| ${r.place} | ${r.modern} | ${r.lng} | ${r.lat} | ${r.n} |`),
].join('\n');
writeFileSync(resolve(outDir, 'known-places.md'), md, 'utf8');
console.log(`已写出 known-places.md（${known.length} 个地点）`);

/* ---------- 2. works-add 条目 ---------- */
const src = readFileSync(resolve(root, 'src/data/works-add.ts'), 'utf8');
const items = [];
for (const b of src.split(/\/\* /).slice(1)) {
  const pid = /poetId: '([^']+)'/.exec(b);
  const nid = /nodeId: '([^']+)'/.exec(b);
  const titles = [...b.matchAll(/title: '([^']+)'/g)].map((m) => m[1]);
  if (pid && nid) for (const t of titles) items.push({ poetId: pid[1], nodeId: nid[1], title: t });
}
console.log(`works-add 作品：${items.length}`);

/* ---------- 3. 辞典索引 ---------- */
/** @type {Map<string,{author:string,title:string,body:string,dynasty:string}>} */
const dict = new Map();
for (const v of ['cider-tang', 'cider-song']) {
  const d = JSON.parse(readFileSync(resolve(root, 'scripts/_cider', v + '.json'), 'utf8'));
  const dyn = v === 'cider-tang' ? '唐' : '宋';
  for (const a of d.authors) {
    for (const w of a.works || []) {
      const rec = { author: a.name, title: w.title, body: w.body || '', dynasty: dyn };
      dict.set(`${a.name}|${w.title}`, rec);
      const k2 = `${a.name}|${w.title.replace(/\s+/g, '')}`;
      if (!dict.has(k2)) dict.set(k2, rec);
    }
  }
}

/* ---------- 4. 配对 + 分片 ---------- */
const BODY_MAX = 6000; // 赏析截断上限（中位 1464 字，够用；异常长条目截断）
const paired = [];
let unmatched = 0;
for (const it of items) {
  const p = id2poet.get(it.poetId);
  const name = p ? p.name : '';
  const rec = dict.get(`${name}|${it.title}`) || dict.get(`${name}|${it.title.replace(/\s+/g, '')}`);
  if (!rec) { unmatched += 1; continue; }
  const node = (p?.nodes || []).find((n) => n.id === it.nodeId);
  paired.push({
    poetId: it.poetId,
    poetName: name,
    dynasty: p?.dynasty || rec.dynasty,
    title: it.title,
    dictTitle: rec.title,
    body: rec.body.slice(0, BODY_MAX),
    currentNode: node ? { year: node.year, place: node.place, modern: node.modernPlace } : null,
  });
}
console.log(`配对成功：${paired.length}  未配对：${unmatched}`);

// 按作者聚合后分片，保证同一行迹的作品在同一批
const byAuthor = new Map();
for (const it of paired) {
  if (!byAuthor.has(it.poetId)) byAuthor.set(it.poetId, []);
  byAuthor.get(it.poetId).push(it);
}
const authors = [...byAuthor.values()].sort((a, b) => b.length - a.length);

const TARGET = 60; // 每批目标篇数
const batches = [];
let cur = [];
for (const list of authors) {
  cur.push(...list);
  if (cur.length >= TARGET) { batches.push(cur); cur = []; }
}
if (cur.length) batches.push(cur);

batches.forEach((list, i) => {
  const nn = String(i + 1).padStart(2, '0');
  writeFileSync(resolve(outDir, `batch-${nn}.json`), JSON.stringify({ batch: nn, count: list.length, items: list }, null, 1), 'utf8');
});
console.log(`已生成 ${batches.length} 个批次：${batches.map((b) => b.length).join(', ')}`);
