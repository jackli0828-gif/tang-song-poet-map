/**
 * 强化版散文/赏析残留检测
 * 判据（针对 works-add.ts 追加的 -wa 作品）：
 *   A. 单句净长 > 18 字（诗词单句几乎不可能超过；序/赏析常见）
 *   B. 序号段「一、」「二、」「三、」
 *   C. 硬特征词（评注用语）
 *   D. 句均长 > 16
 * 只报告，不修改。
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'scripts', '_poets-bundle2.tmp.mjs');

await build({
  entryPoints: [resolve(ROOT, 'src/data/poets.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: OUT,
  logLevel: 'error',
});
const { POETS } = await import(pathToFileURL(OUT).href);
rmSync(OUT, { force: true });

const HARD = new RegExp([
  '这首','此词','此诗','全诗','全词','本篇','本词','本诗','该题','该词','作者','这是','题目',
  '题下','原注','上片','下片','歇拍','过片','领字','点题','用典','化用','词人','诗人','赏析',
  '注释','写于','作于','年号','大约','约在','参见','本事','诗话','全集','脍炙','是指','无从',
  '可以看出','由此可见','值得一提','需要说明','众所周知','《全唐诗》','《全宋词》','《唐诗',
  '《宋词','首联','颔联','颈联','尾联','这一联','此联','次联','出句','对句','起首','就是',
  '相传','可以说','要之','细味','不难','故此','所谓','何焯','纪昀','治今','在今','故址','旧址',
  '今属','据考','按：','这词','一本有','关于','即指','概指','遥想','寄慨','不一','前人之述',
  '即今','指当时','一作','诗题','描写','因此','所以','不过','其实','当然','显然','何况',
  '譬如','例如','首先','其次','总之','综上','看来','再说','再看','至于','接着','下面','起句',
  '盖因','然则','此句','这句','上句','下句','这一句','二句','三句','四句','诗的后','词的上',
  '这两首','这首诗','这首词','后两句','前两句','第一首','第二首','第三首',
  '晚唐','中唐','盛唐','南宋','北宋','南渡','唐人','宋人','后人','前人','读者',
  '艺术','手法','形象','议论','讽刺','表现','语言','风格','意境',
  '值得一提','可以看出','由此可见','众所周知','需要说明',
  // 注：单字「盖/夫/矣」与「正是/感情/内容/思想/意义/价值」一律不用——
  // 古诗正文里「隔水问樵夫」含「夫」、「正是江南好风景」含「正是」，误报极高。
].join('|'));

const SEQ = /^[一二三四五六七八九十]+[、．.]/;
const MAX_SENT = 18;   // 单句净长上限
const AVG_SENT = 16;   // 句均长上限

const rows = [];
for (const p of POETS) {
  for (const n of p.nodes) {
    for (const w of n.works) {
      if (!/-wa\d+$/.test(w.id)) continue;
      const text = String(w.fullText || w.excerpt || '');
      const bare = text.replace(/[。，！？；：、\s“”"'「」『』（）()《》]/g, '');
      const sents = text.split(/[。！？]/).map((s) => s.trim()).filter(Boolean);
      const lens = sents.map((s) => s.replace(/[，！？；：、\s“”"'「」『』（）()《》]/g, '').length);
      const maxLen = lens.length ? Math.max(...lens) : 0;
      const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
      const hit = HARD.test(text);
      const seq = SEQ.test(text);
      const reasons = [];
      if (hit) reasons.push('硬词');
      if (seq) reasons.push('序号段');
      if (maxLen > MAX_SENT) reasons.push(`最长句${maxLen}`);
      if (avg > AVG_SENT) reasons.push(`均长${avg.toFixed(1)}`);
      if (reasons.length) {
        rows.push({
          id: w.id, poet: p.name, title: w.title, genre: w.genre,
          reasons: reasons.join('/'), maxLen, avg: +avg.toFixed(1),
          chars: bare.length, text,
        });
      }
    }
  }
}

rows.sort((a, b) => (b.maxLen - a.maxLen) || (b.avg - a.avg));
console.log(`追加作品总数: ${POETS.reduce((s, p) => s + p.nodes.reduce((t, n) => t + n.works.filter((w) => /-wa\d+$/.test(w.id)).length, 0), 0)}`);
console.log(`疑似含散文/赏析: ${rows.length} 条`);
const byReason = new Map();
for (const r of rows) {
  const k = r.reasons.replace(/最长句\d+/, '最长句超标').replace(/均长[\d.]+/, '均长超标').replace(/硬词\/?/, '');
  byReason.set(k, (byReason.get(k) || 0) + 1);
}
console.log('--- 触发原因分布（粗分）---');
for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

console.log('\n--- 明细（按最长句降序，前 80 条）---');
for (const r of rows.slice(0, 80)) {
  console.log(`${r.poet}|${r.title}|${r.genre}|${r.reasons}|净${r.chars}字`);
  console.log(`    ${r.text.slice(0, 120)}`);
}
writeFileSync(resolve(ROOT, 'scripts/_cider/qa-prose2.json'), JSON.stringify(rows, null, 2), 'utf8');
console.log(`\n完整清单已写入 scripts/_cider/qa-prose2.json（${rows.length} 条）`);
