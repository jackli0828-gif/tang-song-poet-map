/**
 * 收录完整性比对：把《唐诗三百首》《宋词三百首》的权威作者名单与项目实际收录比对，
 * 输出「缺失（有权威收录但项目没有）」与「多余（项目有但两部三百首未收）」。
 * 运行：node scripts/audit-coverage.mjs
 */
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'node_modules', '.cache', 'poets-cov.mjs');

await build({
  entryPoints: [resolve(root, 'src', 'data', 'poets.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  logLevel: 'error',
});
const { POETS } = await import(pathToFileURL(out).href);

/* 《唐诗三百首》（蘅塘退士编，通行本 77 家；已剔除「无名氏/西鄙人/佚名」3 个非实名） */
const TANG_300 = `白居易 岑参 常建 陈陶 陈子昂 崔颢 崔曙 崔涂 戴叔伦 杜甫 杜牧 杜审言 杜荀鹤 高适 顾况
韩翃 韩偓 韩愈 贺知章 皇甫冉 贾岛 金昌绪 李白 李端 李频 李颀 李商隐 李益 刘长卿 刘方平 刘昚虚
刘禹锡 柳中庸 柳宗元 卢纶 骆宾王 马戴 孟浩然 孟郊 裴迪 綦毋潜 钱起 秦韬玉 丘为 权德舆 僧皎然
沈佺期 司空曙 宋之问 李隆基 王勃 王昌龄 王翰 王建 王湾 王维 王之涣 韦应物 韦庄 温庭筠 许浑
薛逢 元结 元稹 张祜 张籍 张继 张九龄 张泌 张乔 张旭 郑畋 朱庆馀 祖咏`
  .split(/\s+/)
  .filter(Boolean);

/* 《宋词三百首》（上彊村民 1924 初刻本，88 家 300 首） */
const SONG_300 = `赵佶 钱惟演 范仲淹 张先 晏殊 韩缜 宋祁 欧阳修 聂冠卿 柳永 王安石 王安国 晏幾道 苏轼
黄庭坚 秦观 晁元礼 赵令畤 张耒 晁补之 晁冲之 舒亶 朱服 毛滂 陈克 李元膺 时彦 李之仪 周邦彦 贺铸
张元幹 叶梦得 汪藻 刘一止 韩疁 李邴 陈与义 蔡伸 周紫芝 李甲 万俟咏 徐伸 田为 曹组 李玉 廖世美
吕滨老 查荎 鲁逸仲 岳飞 张抡 程垓 张孝祥 韩元吉 袁去华 陆淞 陆游 陈亮 范成大 蔡幼学 辛弃疾 姜夔
章良能 刘过 严仁 俞国宝 张镃 史达祖 刘克庄 卢祖皋 潘牥 陆叡 萧泰来 吴文英 黄孝迈 潘希白 黄公绍
朱嗣发 刘辰翁 周密 蒋捷 张炎 王沂孙 彭元逊 姚云文 僧挥 李清照 林逋 王诜 李重元`
  .split(/\s+/)
  .filter(Boolean);

/** 异体/繁简/别称归并，避免误报为缺失 */
const ALIAS = {
  晏几道: '晏幾道',
  晏幾道: '晏幾道',
  晁端礼: '晁元礼',
  晁元礼: '晁元礼',
  仲殊: '僧挥',
  僧挥: '僧挥',
  徽宗皇帝: '赵佶',
  赵佶: '赵佶',
  张元干: '张元幹',
  张元幹: '张元幹',
  邱为: '丘为',
  丘为: '丘为',
  朱庆余: '朱庆馀',
  朱庆馀: '朱庆馀',
  唐玄宗: '李隆基',
  李隆基: '李隆基',
  皎然: '僧皎然',
  僧皎然: '僧皎然',
  潘牥: '潘牥',
  陆叡: '陆叡',
};
const norm = (n) => ALIAS[n.trim()] ?? n.trim();

const have = {
  唐: new Set(POETS.filter((p) => p.dynasty === '唐').map((p) => norm(p.name))),
  宋: new Set(POETS.filter((p) => p.dynasty === '宋').map((p) => norm(p.name))),
};

function diff(std, dynasty) {
  const stdSet = new Set(std.map(norm));
  const missing = [...stdSet].filter((n) => !have[dynasty].has(n));
  const extra = [...have[dynasty]].filter((n) => !stdSet.has(n));
  return { stdSet, missing, extra };
}

const t = diff(TANG_300, '唐');
const s = diff(SONG_300, '宋');

console.log('=== 《唐诗三百首》 ===');
console.log('权威名单', t.stdSet.size, '家 | 项目收录', have['唐'].size, '家');
console.log('缺失 :', t.missing.length ? t.missing.join('、') : '无 ✅');
console.log('多收 :', t.extra.length ? t.extra.join('、') : '无');

console.log('\n=== 《宋词三百首》（1924 初刻本）===');
console.log('权威名单', s.stdSet.size, '家 | 项目收录', have['宋'].size, '家');
console.log('缺失 :', s.missing.length ? s.missing.join('、') : '无 ✅');
console.log('多收 :', s.extra.length ? s.extra.join('、') : '无');

console.log('\n=== 汇总 ===');
console.log(`两部三百首应收录 ${t.stdSet.size + s.stdSet.size} 家，项目现有 ${POETS.length} 家`);
console.log(`待补：${t.missing.length + s.missing.length} 家`);
if (t.missing.length + s.missing.length > 0) {
  console.log('  ' + [...t.missing, ...s.missing].join('、'));
}
