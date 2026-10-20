/**
 * 覆盖率探测（只读）
 * ==================================================================
 * 对比三种匹配口径的命中率，定位「真缺口」：
 *   A. 标题 + 正文前 600 字（上一版口径）
 *   B. 标题 + 完整正文
 *   C. B + 「今××」今地反查（把今地名映射回已有节点的 modernPlace）
 *
 * 并统计未命中作品中，含任职/贬谪/纪年线索的比例，
 * 用于判断「还能抢救多少」以及需要多少人工判断。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const POETS = JSON.parse(readFileSync(resolve(root, 'scripts/_cider/poets-dump.json'), 'utf8'));

/* ---- 已有地点 ---- */
const places = new Map();
for (const p of POETS) {
  for (const n of p.nodes || []) {
    if (!n.place) continue;
    const r = places.get(n.place) || { place: n.place, modern: n.modernPlace || '', lng: n.lng, lat: n.lat, nodes: 0 };
    r.nodes += 1;
    if (!r.modern && n.modernPlace) r.modern = n.modernPlace;
    places.set(n.place, r);
  }
}
// 别名：古称主体 / 括号内短名 / 今地名
const alias = new Map();
for (const r of places.values()) {
  alias.set(r.place, r.place);
  const m = /^([^（(]+)[（(]([^）)]+)[）)]$/.exec(r.place);
  if (m) { alias.set(m[1], r.place); alias.set(m[2], r.place); }
  if (r.modern) alias.set(r.modern, r.place);
  const tail = /[一-龥]{2,4}$/.exec(r.modern || '');
  if (tail) alias.set(tail[0], r.place); // 「重庆奉节」→「奉节」
}
const aliasList = [...alias.keys()].filter((a) => a.length >= 2).sort((a, b) => b.length - a.length);

function hit(text) {
  const s = new Set();
  for (const a of aliasList) if (text.includes(a)) s.add(alias.get(a));
  return [...s];
}

/* ---- 辞典 ---- */
const corpus = [];
for (const v of ['cider-tang', 'cider-song']) {
  const d = JSON.parse(readFileSync(resolve(root, 'scripts/_cider', v + '.json'), 'utf8'));
  for (const a of d.authors) for (const w of a.works || []) corpus.push({ dynasty: v === 'cider-tang' ? '唐' : '宋', author: a.name, title: w.title, body: w.body || '' });
}

let a = 0, b = 0;
const rest = [];
for (const w of corpus) {
  if (hit(w.title + ' ' + w.body.slice(0, 600)).length) a += 1;
  const full = hit(w.title + ' ' + w.body);
  if (full.length) b += 1;
  else rest.push(w);
}
console.log(`口径A（标题+前600字）命中: ${a} / ${corpus.length}`);
console.log(`口径B（标题+完整正文）命中: ${b} / ${corpus.length}`);
console.log(`仍未命中: ${rest.length}`);

/* ---- 未命中作品里，有多少含「任职/贬谪/纪年」线索 ---- */
const CLUE = [
  /(?:知|守|通判|任职于|出任|出为|贬为|贬至|谪居|谪|徙|移|提举|安抚使|任|授|除|拜)([一-龥]{2,4})(?:州|府|军|县|郡)/,
  /(?:元丰|熙宁|嘉祐|庆历|庆元|淳熙|绍兴|建炎|靖康|宣和|政和|崇宁|元祐|绍圣|大观|乾道|淳祐|宝祐|景定|咸淳|德祐|开元|天宝|贞元|元和|长庆|会昌|大中|咸通|乾符|光启|景福|天复|天祐|至德|上元|宝应|广德|永泰|大历|建中|兴元|贞明)\s*[元二三四五六七八九十]?\s*年/,
  /[（(]\s*(?:9|10|11|12|13)\d{2}\s*[）)]/,
  /作于/,
  /此(?:词|诗)作于/,
  /时(?:在|年)/,
];
let withClue = 0;
const clueSamples = [];
for (const w of rest) {
  const n = CLUE.filter((re) => re.test(w.body)).length;
  if (n >= 2) { withClue += 1; if (clueSamples.length < 20) clueSamples.push(w); }
}
console.log(`未命中作品中，含 ≥2 条系年/任职线索的: ${withClue}（可人工判定）`);
console.log(`基本无线索（辞典未系年）: ${rest.length - withClue}`);

console.log('\n—— 含线索样例 ——');
for (const w of clueSamples) {
  const m = CLUE.map((re) => re.exec(w.body)).filter(Boolean).slice(0, 2).map((x) => x[0]);
  console.log(`【${w.dynasty}】${w.author}《${w.title}》 → ${m.join(' / ')}`);
}

writeFileSync(
  resolve(root, 'scripts/_cider/unmatched.json'),
  JSON.stringify({ total: corpus.length, hitA: a, hitB: b, unmatched: rest.length, withClue, samples: clueSamples.map((w) => ({ dynasty: w.dynasty, author: w.author, title: w.title })) }),
  null,
  1,
  'utf8',
);
console.log('\n已写入 scripts/_cider/unmatched.json');
