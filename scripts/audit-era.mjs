/**
 * 年号—公元对照校验（纯本地规则校验，不依赖网络）
 * ------------------------------------------------------------------
 * 对每个 LifeNode.era 与每个 Work.yearLabel 做年号换算，
 * 与记录的 year 比对，不一致即输出，供人工复核。
 * 运行：node scripts/audit-era.mjs
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'node_modules', '.cache', 'poets-era.mjs');

await build({
  entryPoints: [resolve(root, 'src', 'data', 'poets.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});

const { POETS } = await import(pathToFileURL(out).href);

/** 年号表：[年号, 起始公元, 结束公元]；同年号复用者列多条 */
const ERAS = [
  // 唐
  ['武德', 618, 626], ['贞观', 627, 649], ['永徽', 650, 655], ['显庆', 656, 661],
  ['龙朔', 661, 663], ['麟德', 664, 665], ['乾封', 666, 668], ['总章', 668, 670],
  ['咸亨', 670, 674], ['上元', 674, 676], ['仪凤', 676, 679], ['调露', 679, 680],
  ['永隆', 680, 681], ['开耀', 681, 682], ['永淳', 682, 683], ['弘道', 683, 683],
  ['嗣圣', 684, 684], ['文明', 684, 684], ['光宅', 684, 684], ['垂拱', 685, 688],
  ['永昌', 689, 689], ['载初', 689, 690], ['天授', 690, 692], ['如意', 692, 692],
  ['长寿', 692, 694], ['延载', 694, 694], ['证圣', 695, 695], ['天册万岁', 695, 695],
  ['万岁登封', 695, 696], ['万岁通天', 696, 697], ['神功', 697, 697], ['圣历', 698, 700],
  ['久视', 700, 700], ['大足', 701, 701], ['长安', 701, 704], ['神龙', 705, 707],
  ['景龙', 707, 710], ['唐隆', 710, 710], ['景云', 710, 711], ['太极', 712, 712],
  ['延和', 712, 712], ['先天', 712, 713], ['开元', 713, 741], ['天宝', 742, 756],
  ['至德', 756, 758], ['乾元', 758, 760], ['上元', 760, 761], ['宝应', 762, 763],
  ['广德', 763, 764], ['永泰', 765, 766], ['大历', 766, 779], ['建中', 780, 783],
  ['兴元', 784, 784], ['贞元', 785, 805], ['永贞', 805, 805], ['元和', 806, 820],
  ['长庆', 821, 824], ['宝历', 825, 827], ['大和', 827, 835], ['太和', 827, 835],
  ['开成', 836, 840], ['会昌', 841, 846], ['大中', 847, 860], ['咸通', 860, 874],
  ['乾符', 874, 879], ['广明', 880, 881], ['中和', 881, 885], ['光启', 885, 888],
  ['文德', 888, 888], ['龙纪', 889, 889], ['大顺', 890, 891], ['景福', 892, 893],
  ['乾宁', 894, 898], ['光化', 898, 901], ['天复', 901, 904], ['天祐', 904, 907],
  // 北宋
  ['建隆', 960, 963], ['乾德', 963, 968], ['开宝', 968, 976], ['太平兴国', 976, 984],
  ['雍熙', 984, 987], ['端拱', 988, 989], ['淳化', 990, 994], ['至道', 995, 997],
  ['咸平', 998, 1003], ['景德', 1004, 1007], ['大中祥符', 1008, 1016], ['天禧', 1017, 1021],
  ['乾兴', 1022, 1022], ['天圣', 1023, 1032], ['明道', 1032, 1033], ['景祐', 1034, 1038],
  ['宝元', 1038, 1040], ['康定', 1040, 1041], ['庆历', 1041, 1048], ['皇祐', 1049, 1054],
  ['至和', 1054, 1056], ['嘉祐', 1056, 1063], ['治平', 1064, 1067], ['熙宁', 1068, 1077],
  ['元丰', 1078, 1085], ['元祐', 1086, 1094], ['绍圣', 1094, 1098], ['元符', 1098, 1100],
  ['建中靖国', 1101, 1101], ['崇宁', 1102, 1106], ['大观', 1107, 1110], ['政和', 1111, 1118],
  ['重和', 1118, 1119], ['宣和', 1119, 1125], ['靖康', 1126, 1127],
  // 南宋
  ['建炎', 1127, 1130], ['绍兴', 1131, 1162], ['隆兴', 1163, 1164], ['乾道', 1165, 1173],
  ['淳熙', 1174, 1189], ['绍熙', 1190, 1194], ['庆元', 1195, 1200], ['嘉泰', 1201, 1204],
  ['开禧', 1205, 1207], ['嘉定', 1208, 1224], ['宝庆', 1225, 1227], ['绍定', 1228, 1233],
  ['端平', 1234, 1236], ['嘉熙', 1237, 1240], ['淳祐', 1241, 1252], ['宝祐', 1253, 1258],
  ['开庆', 1259, 1259], ['景定', 1260, 1264], ['咸淳', 1265, 1274], ['德祐', 1275, 1276],
];

const CN = { 零: 0, 〇: 0, 一: 1, 元: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** 中文数字 → 阿拉伯数字，支持 1-99 */
function cn2num(s) {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === '元') return 1;
  if (s === '十') return 10;
  if (s.length === 2 && s[0] === '十') return 10 + (CN[s[1]] ?? 0);
  if (s.length === 2 && s[1] === '十') return CN[s[0]] * 10;
  if (s.length === 3 && s[1] === '十') return CN[s[0]] * 10 + (CN[s[2]] ?? 0);
  return CN[s] ?? NaN;
}

/** 按长度降序排好，便于最长匹配 */
const ERA_NAMES = [...new Set(ERAS.map((r) => r[0]))].sort((a, b) => b.length - a.length);

/** 解析「开元五年」「天宝三载」「淳熙十四年」→ { era, n }（最长年号优先匹配） */
function parseEra(text) {
  if (!text) return null;
  const t = String(text).trim();
  for (const era of ERA_NAMES) {
    if (!t.startsWith(era)) continue;
    const rest = t.slice(era.length);
    const m = rest.match(/^([0-9\u4e00-\u9fa5]{1,3})[年载]/);
    if (!m) continue;
    const n = cn2num(m[1]);
    if (!Number.isFinite(n) || n < 1 || n > 60) continue;
    return { era, n };
  }
  return null;
}

/** 年号+序数 → 可能的公元年份集合 */
function toYears(era, n) {
  const ys = [];
  for (const [name, s, e] of ERAS) {
    if (name !== era) continue;
    const y = s + n - 1;
    if (y >= s && y <= e) ys.push(y);
    if (n === 1 && s <= e) ys.push(s); // 元年
  }
  return [...new Set(ys)];
}

const KNOWN_ERA = new Set(ERAS.map((r) => r[0]));

const issues = [];
const unknown = [];
let checked = 0;

function check(poet, kind, id, year, label) {
  if (!label) return;
  const p = parseEra(label);
  if (!p) return;
  checked++;
  if (!KNOWN_ERA.has(p.era)) {
    unknown.push(`${poet.name} ${kind} ${id} 「${label}」年号不在对照表`);
    return;
  }
  const ys = toYears(p.era, p.n);
  if (ys.length === 0) {
    issues.push(`${poet.name} ${kind} ${id}：「${label}」换算越界（该年号无第${p.n}年），记 year=${year}`);
    return;
  }
  if (!ys.includes(year)) {
    issues.push(
      `${poet.name} ${kind} ${id}：「${label}」应=${ys.join('/')}，记 year=${year}（差 ${ys[0] - year >= 0 ? '+' : ''}${ys[0] - year}）`
    );
  }
}

for (const p of POETS) {
  for (const n of p.nodes) check(p, 'node', n.id, n.year, n.era);
  for (const n of p.nodes) {
    for (const w of n.works ?? []) check(p, 'work', w.id, w.year, w.yearLabel);
  }
}

console.log(`已校验年号记录 ${checked} 条`);
console.log(`\n=== 年号/公元不一致 ${issues.length} 条 ===`);
for (const s of issues) console.log('  ' + s);
console.log(`\n=== 对照表未收年号 ${unknown.length} 条 ===`);
for (const s of unknown) console.log('  ' + s);
