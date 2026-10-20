/**
 * 地点覆盖度分析（只读，不改数据）
 * ==================================================================
 * 回答三个问题：
 *   Q1 现有地图上有多少个**不同的地点**？（LifeNode.place 去重）
 *   Q2 辞典 2001 篇作品中，有多少篇能在地图上找到对应地点？
 *   Q3 剩下的作品里，有多少篇的赏析散文含可定位线索（今××）？
 *
 * 数据源：
 *   - scripts/_cider/poets-dump.json（由 scripts/_dump-poets.mjs 产出，含 works-add）
 *   - scripts/_cider/cider-{tang,song}.json（辞典语料）
 *
 * 输出：scripts/_cider/place-gap.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

/* ============ 1. 现有地点库 ============ */
const POETS = JSON.parse(readFileSync(resolve(root, 'scripts/_cider/poets-dump.json'), 'utf8'));

/** @type {Map<string,{place:string,modern:string,lng:number,lat:number,nodes:number,works:number}>} */
const places = new Map();
let nodeTotal = 0;
let workTotal = 0;
for (const p of POETS) {
  for (const n of p.nodes || []) {
    nodeTotal += 1;
    workTotal += (n.works || []).length;
    const key = n.place;
    if (!key) continue;
    const r = places.get(key) || { place: key, modern: n.modernPlace || '', lng: n.lng, lat: n.lat, nodes: 0, works: 0 };
    r.nodes += 1;
    r.works += (n.works || []).length;
    if (!r.modern && n.modernPlace) r.modern = n.modernPlace;
    places.set(key, r);
  }
}
const known = [...places.values()].sort((a, b) => b.works - a.works);
console.log(`【Q1】现有地图地点：${known.length} 个不同地名（覆盖 ${nodeTotal} 节点 / ${workTotal} 篇作品）`);
console.log('    作品最多的地点 TOP15：');
for (const r of known.slice(0, 15)) console.log(`      ${r.place.padEnd(10)} 今${(r.modern || '—').padEnd(10)} 节点${String(r.nodes).padStart(3)}  作品${String(r.works).padStart(3)}`);

/* ============ 2. 辞典作品 ============ */
const corpus = [];
for (const v of ['cider-tang', 'cider-song']) {
  const d = JSON.parse(readFileSync(resolve(root, 'scripts/_cider', v + '.json'), 'utf8'));
  for (const a of d.authors) {
    for (const w of a.works || []) {
      corpus.push({ dynasty: v === 'cider-tang' ? '唐' : '宋', author: a.name, bio: a.bio || '', title: w.title, body: w.body || '' });
    }
  }
}
console.log(`\n辞典作品：${corpus.length} 篇（唐 ${corpus.filter((c) => c.dynasty === '唐').length} / 宋 ${corpus.filter((c) => c.dynasty === '宋').length}）`);

/* ============ 3. 地名命中判定 ============ */
// 古地名按长度降序匹配，避免「长安」被「长」抢先（这里最短 2 字，仍按长度排序更稳）
const PLACE_ALIAS = new Map(); // 别名 -> 标准地名
for (const r of known) {
  PLACE_ALIAS.set(r.place, r.place);
  // 「益州（成都）」类：拆出括号内的短名作为别名
  const m = /^([^（(]+)[（(]([^）)]+)[）)]$/.exec(r.place);
  if (m) {
    PLACE_ALIAS.set(m[1], r.place);
    PLACE_ALIAS.set(m[2], r.place);
  }
}
const aliasList = [...PLACE_ALIAS.keys()].sort((a, b) => b.length - a.length);

function hitPlace(text) {
  const found = new Set();
  for (const a of aliasList) {
    if (a.length < 2) continue;
    if (text.includes(a)) found.add(PLACE_ALIAS.get(a));
  }
  return [...found];
}

/* ============ 4. 强定位线索（今××） ============ */
// 只保留带行政区后缀 / 「今属」/「治所在今」这类强模式，避免抓到「今何在」「今老矣」等虚词
const STRONG = [
  /今属([一-龥]{2,6}?)[，。、；）)]/g,
  /治所在今([一-龥]{2,6}?)[，。、；）)]/g,
  /今([一-龥]{2,6}?)(?:省|市|县|区)/g,
  /[（(]今([一-龥]{2,6}?)(?:省|市|县|区)?[）)]/g,
];
// 虚词/非地名黑名单（抽样人工确认）
const BLACK = new Set(['何在', '安在', '犹在', '在否', '又来', '如此', '非昨', '追昔', '忆昔', '思昔', '抚今', '昔非', '已是', '已是', '词话', '词论', '词统', '看来', '天看来', '不传', '已不传', '属江苏', '属江西', '属安徽', '属陕西', '属湖南', '属湖北']);

function modernHints(text) {
  const out = new Set();
  for (const re of STRONG) {
    for (const m of text.matchAll(re)) {
      const s = m[1];
      if (!s || s.length < 2) continue;
      if (BLACK.has(s)) continue;
      if (/[何岂安又亦已非昔其在否矣耳]$/.test(s)) continue;
      out.add(s);
    }
  }
  return [...out];
}

let covered = 0;
const uncovered = [];
const modernFreq = new Map();
for (const w of corpus) {
  // 标题 + 正文前 400 字（赏析背景常在前段）
  const head = w.title + ' ' + w.body.slice(0, 600);
  const hits = hitPlace(head);
  if (hits.length) {
    covered += 1;
  } else {
    const hints = modernHints(w.body);
    for (const h of hints) modernFreq.set(h, (modernFreq.get(h) || 0) + 1);
    if (hints.length) uncovered.push({ ...w, hints });
  }
}

console.log(`\n【Q2】能在现有地图上找到地点的作品：${covered} / ${corpus.length}`);
console.log(`      找不到地点的作品：${corpus.length - covered}`);
console.log(`【Q3】其中在赏析里含「今××」强定位线索的：${uncovered.length} 篇`);

const top = [...modernFreq.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n—— 缺失作品中的今地名词频 TOP 50 ——`);
for (const [n, c] of top.slice(0, 50)) console.log(`  ${n.padEnd(10)} ${c}`);

writeFileSync(
  resolve(root, 'scripts/_cider/place-gap.json'),
  JSON.stringify(
    {
      knownPlaceCount: known.length,
      nodeTotal,
      workTotal,
      knownPlaces: known,
      corpusCount: corpus.length,
      coveredCount: covered,
      uncoveredWithHint: uncovered.length,
      modernFreqTop: top,
    },
    null,
    1,
  ),
  'utf8',
);
console.log('\n已写入 scripts/_cider/place-gap.json');
