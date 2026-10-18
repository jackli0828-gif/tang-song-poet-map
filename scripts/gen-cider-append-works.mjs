/**
 * 辞典补录 · 已有作者缺失作品追加器
 * ==================================================================
 * 背景：scripts/_cider/diff-report.json 的 tang.matched(63) / song.matched(78)
 * 共 141 位「项目已收录、但辞典里还有作品未收录」的作者，缺 1231 篇。
 *
 * 本脚本：
 *  1) 用 esbuild 打包 src/data/poets.ts，拿到全量 Poet（含 id / nodes[].id）
 *  2) 按姓名定位到项目中的 Poet
 *  3) 从 scripts/_cider/cider-tang.json / cider-song.json 取出缺失作品正文
 *  4) stripProse → extractPoem → finalClean 裁掉赏析散文，只留诗/词原文
 *  5) 轮转分配到该诗人除「出生」外的各时空节点，产出 src/data/works-add.ts
 *
 * 产出文件只导出 WORKS_ADD（poetId + nodeId + works[]），由 poets.ts 在
 * POETS 构造完成后合并进去；**不改动任何手写数据文件**，可重复生成。
 *
 * 用法：node scripts/gen-cider-append-works.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(import.meta.dirname, '..');

/* ---------------------------------------------------------------- 正文清洗 */

/**
 * 保守派散文判定：宁可少切，不可误伤韵文。
 * 早期版本用「咏 / 如何 / 送客 / 怀古」等宽泛特征词，会把
 * 李白《玉壶吟》「三杯拂剑舞秋月，忽然高咏涕泗涟」、杜甫《天末怀李白》
 * 「凉风起天末，君子意如何」、王昌龄《芙蓉楼送辛渐》「平明送客楚山孤」
 * 这类正文本身误判为赏析。这里改用「硬信号 + 结构性特征」：
 *   ① 阿拉伯数字 / 圈码脚注（韵文不会出现）
 *   ② （今…）式今地夹注
 *   ③ 明确的评注用语（这首/此词/本篇/作者/这是/题目…）
 *   ④ 非首句又以作者姓名开头（赏析段的典型写法）
 *   ⑤ 引书名号且句长 > 20（评注引书；短句用典不误伤）
 *   ⑥ 句长 > 30（韵文一句最长约 24 字）
 */
const STRONG = new RegExp(
  [
    '这首', '此词', '此诗', '全诗', '全词', '本篇', '本词', '本诗', '该题', '该词',
    '作者', '这是', '题目', '题下', '原注', '上片', '下片', '歇拍', '过片', '领字',
    '点题', '用典', '化用', '词人', '诗人', '赏析', '注释', '写于', '作于', '年号',
    '大约', '约在', '参见', '本事', '小序', '序云', '一说', '诗话', '全集',
    '格为', '脍炙', '是指', '无从', '实在叫人', '可以看出', '由此可见', '值得一提',
    '需要说明', '众所周知', '《全唐诗》', '《全宋词》', '《唐诗', '《宋词',
    // 逐联评点 / 考据用语
    '首联', '颔联', '颈联', '尾联', '这一联', '此联', '次联', '出句', '对句', '起首',
    '就是', '相传', '可以说', '要之', '细味', '不难', '故此', '所谓', '何焯', '纪昀',
    '治今', '在今', '故址', '旧址', '今属', '据考', '按：',
    '这词', '一本有', '关于', '即指', '概指', '遥想', '寄慨', '不一', '前人之述',
    '即今', '侍郎', '指当时', '一作', '诗题', '描写', '因此', '所以', '不过',
    '其实', '当然', '显然', '何况', '譬如', '例如', '首先', '其次', '总之', '综上',
    '看来', '再说', '再看', '至于', '接着', '下面', '起句', '盖因', '然则', '此句',
    '这句', '上句', '下句', '这一句', '二句', '三句', '四句', '诗的后', '词的上',
    // 小序 / 自度曲序的典型收束语（宋词正文前常有一段散文小序）
    '故作此', '作此词', '作此篇', '书以遗', '乃作', '以遗之', '歌之', '赋此',
    '自度此曲', '并序', '序曰', '兼怀', '以寄', '示之', '赠之', '因赋', '遂作',
  ].join('|'),
);
/** 需要「句长 > 10」才成立的软信号：短句里出现可能是正文用字
 *  （如温庭筠「莫抛心力作词人」） */
const STRONG_LONG = new RegExp(
  ['就是', '可见', '历来', '是指', '格为', '脍炙', '无从', '参见',
   '本事', '小序', '序云', '一说', '大约', '约在', '这也是'].join('|'),
);
/** 已并入 STRONG_LONG（>10 字）。温庭筠《蔡中郎坟》「莫抛心力作词人」
 *  属个例，宁可判为残片不收录，也不放赏析进正文。 */
const DIGIT = /[0-9０-９①-⑳]/;
/** 夹注：（）内含今地/古地/治所等考据信息 */
const MODERN = /（[^）]*(今|治今|在今|故址|旧址|古称|古代又称|一说)[^）]*）/;
/** 「……说：」「……云：」式引论 */
const QUOTE = /[说云曰][：:]/;
const MAX_LINE = 40;
/** 韵文句均长上限（分级）：诗一句 12~16 字、词一句可到 24 字；
 *  超过 26 字基本可断定是散文段。逐级放宽，先严后宽。 */
const AVG_LADDER = [20, 26, Infinity];
/** 中文年月日（序跋体标志）：如「大历二年十月十九日」「元丰七年四月一日」。
 *  诗词正文中绝不会出现，一定是小序/题记，判 hard 可让 pickVerse 跳过。 */
const CN_DATE = new RegExp(
  ['[〇零一二三四五六七八九十百千]{1,6}年[〇零一二三四五六七八九十]{1,3}月',
   // 干支纪年 + 月序：周邦彦《西平乐》小序「元丰初……辛丑正月二十六日」
   '[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥][^\\s，。]{0,4}(正月|[一二三四五六七八九十]+月)',
   // 「二十六年」「四十馀年」式年数（叙事小序常见）
   '[〇零一二三四五六七八九十百千]{2,4}馀?年'].join('|'),
);

/**
 * 判定一句是否为散文，返回 ''（正文）/ 'soft'（疑散文，可用来切段）/
 * 'hard'（赏析/考据已明确开场 —— 其后一律不再取正文）。
 *
 * 之所以区分 soft / hard：宋词正文前的「小序」也带叙事色彩（故作此、兼怀…），
 * 若把它当 hard 会把词正文一起砍掉；而赏析开场语（这首、作者、上片…）一旦出现，
 * 后面就绝无正文了，据此可以把赏析整体排除。
 */
const SOFT_ONLY = new RegExp(
  ['作于', '写于', '年号', '年间', '故作此', '作此词', '作此篇', '书以遗', '乃作',
   '以遗之', '歌之', '赋此', '自度此曲', '并序', '序曰', '兼怀', '以寄', '示之',
   '赠之', '因赋', '遂作'].join('|'),
);

function isProse(s, authorName, idx) {
  if (MODERN.test(s)) return 'hard';
  if (QUOTE.test(s)) return 'hard';
  if (CN_DATE.test(s)) return 'hard';
  if (STRONG.test(s)) return SOFT_ONLY.test(s) && !/[《》]/.test(s) ? 'soft' : 'hard';
  if (s.length > 10 && STRONG_LONG.test(s)) return 'hard';
  if (idx > 0 && s.startsWith(authorName)) return 'hard';
  if (/[《》]/.test(s) && s.length > 20) return 'hard';
  // 数字/圈码：考据性夹注常带年份；但词正文偶有圈码脚注，故判 soft
  if (DIGIT.test(s)) return 'soft';
  if (s.length > MAX_LINE) return 'soft';
  return '';
}

/**
 * 取正文：在「句级散文标记」基础上，挑**最长的一段连续韵文**。
 * 不能简单「遇到散文就停」——宋词常在正文前有小序（如苏轼《满庭芳》
 * 「元丰七年四月一日，余将去黄移汝……」），一上来就是散文，直接截断会
 * 得到空串。取最长连续韵文段可同时跳过前置小序与后置赏析。
 */
function pickVerse(text, authorName, dynasty) {
  const all = String(text || '')
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const join = (arr) => arr.map((s) => s.replace(/[。！？]$/, '')).join('。') + '。';

  // 赏析开场（hard）之后绝无正文，先把句子表截断到那里
  const hardAt = all.findIndex((s, i) => isProse(s, authorName, i) === 'hard');
  const sents = hardAt >= 0 ? all.slice(0, hardAt) : all;

  const len = (s) => s.replace(/[。，！？；、\s]/g, '');
  const build = (arr) => {
    const flags = arr.map((s, i) => isProse(s, authorName, i));
    const runs = [];
    let i = 0;
    while (i < arr.length) {
      if (flags[i]) { i++; continue; }
      let j = i;
      while (j < arr.length && !flags[j]) j++;
      const seg = arr.slice(i, j);
      const total = seg.reduce((a, s) => a + len(s).length, 0);
      runs.push({ i, j, total, avg: total / seg.length });
      i = j;
    }
    return runs;
  };

  const pick = (arr) => {
    const allRuns = build(arr);
    // 至少要有「≥2 句 或 ≥40 字」的段，否则视为没取到（多半只捞到小序）
    const runs = allRuns.filter((r) => r.j - r.i >= 2 || r.total >= 24);
    if (!runs.length) return '';
    const first = runs[0];
    // ① 首选「首段」：唐诗正文在最前，其后的赏析碎句虽可能更长也不可取
    //    （杜甫《房兵曹胡马》、王维《酬张少府》都栽在这）。
    //    宋词正文前常有小序（多为 1~2 句），故宋代要求首段 ≥3 句才采信。
    const minSent = dynasty === '宋' ? 3 : 2;
    if (first.i === 0 && first.avg <= 26 && first.j - first.i >= minSent && first.total >= 20) {
      return join(arr.slice(first.i, first.j));
    }
    // ② 否则逐级放宽句均长，在合格候选里取最长一段
    let pool = runs;
    for (const lim of AVG_LADDER) {
      const c = runs.filter((r) => r.avg <= lim);
      if (c.length) { pool = c; break; }
    }
    const best = pool.reduce((a, b) => (b.total > a.total ? b : a));
    return join(arr.slice(best.i, best.j));
  };

  // 先在「赏析开场之前」的子集里取；取不到再用全表
  return pick(sents) || pick(all);
}

/**
 * 块级散文剥离（head-trim / tail-trim）
 * ------------------------------------------------------------------
 * pickVerse 只在「句」粒度上判散文，遇到「正文 + 后附赏析」时，若赏析由
 * 若干短句组成（元稹《菊花》「菊花，不像牡丹那样富丽，也没有兰花那样名贵，
 * 但作为傲霜之花，它一直受人偏爱」——每句都不到 14 字），句级判据会整段漏网。
 * 这里再按「大句」（以 。！？ 切分）做一次块级判定：
 *   · 头部连续 prose 大句 = 小序/题记（苏轼《醉翁操》、张炎《月下笛》）
 *   · 尾部连续 prose 大句 = 赏析（王翰《凉州词》、王维《栾家濑》）
 * 两端各自剥离，只保留中间的连续韵文块；且两端都至少保留 1 句，
 * 剥离后不足 20 字则回滚原文（宁可留下问题条目，也不制造残片）。
 */
const PROSE_BLOCK = new RegExp(
  ['这两首', '这首诗', '这首词', '这首小令', '后两句', '前两句', '第一首', '第二首',
   '第三首', '前者', '后者', '此词前', '词前有序',
   '晚唐', '中唐', '盛唐', '南宋', '北宋', '南渡', '唐人', '宋人', '后人', '前人',
   '读者', '艺术', '手法', '形象', '议论', '讽刺', '表现', '语言', '风格', '意境',
   '特点', '好处', '妙在', '好在', '并非', '不只是', '不仅仅', '从而', '进而',
   '值得一提', '可以看出', '由此可见', '众所周知', '需要说明',
   '感情', '效果', '诗云', '词云', '有云', '著称', '大概是',
   '似乎', '多年来', '两解', '总结', '陶冶', '倏忽', '不堪闻问'].join('|'),
);
const CLAUSE_SEQ = /^[一二三四五六七八九十]+[、．.]/;

/** 一个「大句」是否为散文块 */
function clauseProse(c) {
  if (!c) return false;
  if (CLAUSE_SEQ.test(c)) return true;      // 「一、议论附丽于形象。」
  if (PROSE_BLOCK.test(c)) return true;
  if (STRONG.test(c)) return true;
  if (MODERN.test(c)) return true;
  if (QUOTE.test(c)) return true;
  if (CN_DATE.test(c)) return true;
  const units = c
    .split(/[，；：、]/)
    .map((s) => s.replace(/[\s。，！？；：、]/g, ''))
    .filter(Boolean);
  const lens = units.map((u) => u.length);
  const clean = c.replace(/[\s。，！？；：、]/g, '');
  if (clean.length > 26) return true;        // 韵文一联两句顶多 14~16 字
  const max = lens.length ? Math.max(...lens) : 0;
  const min = lens.length ? Math.min(...lens) : 0;
  if (max > 14) return true;                 // 单个句读 >14 字，必是散文
  // 句读长度参差（如 17/4/13/4）是散文的典型指纹。
  // 注意：不能放宽到「种类≥3 且比值≥3」—— 词的长短句（3/11/5）也会被命中，
  // 结果整首词被判散文，只剩赏析留下（实测会让收录从 1223 掉到 956）。
  if (new Set(lens).size >= 4 && min > 0 && max / min >= 3.5) return true;
  return false;
}

function trimProse(text) {
  const sents = String(text || '')
    .split(/(?<=[。！？])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const flags = sents.map(clauseProse);
  const net = (a, b) =>
    sents.slice(a, b).join('').replace(/[\s。，！？；：、]/g, '').length;

  // 只有一个「大句」：真诗词至少切出 2 个以上（绝句 2 联、词通常 ≥4 句），
  // 单句只可能是残片或整段散文 —— 李商隐《日日》「山城斜路之旁，杏花开得正盛…」
  // 与姜夔《长亭怨慢》小序「予颇喜自制曲…」都属于这种。
  if (sents.length < 2) {
    const n = net(0, 1);
    if (clauseProse(sents[0] || text) || n < 40) return null;
    return text;
  }

  // 切出所有「连续非散文块」
  const runs = [];
  let i = 0;
  while (i < sents.length) {
    if (flags[i]) { i++; continue; }
    let j = i;
    while (j < sents.length && !flags[j]) j++;
    runs.push({ i, j });
    i = j;
  }
  if (!runs.length) return null;

  // 注意：不能「从后往前删到第一个散文块为止」—— 赏析的收尾句往往是一句
  // 长度正常的散文（李商隐《北齐二首》末句「这两句意思一气蝉联，谓荒淫即
  // 亡国取败的先兆。」仅 20 字），从后往前扫会在第一步就停下，整段赏析漏网。
  // 改为「取最靠前的合格韵文块」，正文通常就在最前（其前若有小序已先被剔除）。
  const first = runs[0];
  let best = first;
  const firstOk = first.i === 0 && (first.j - first.i >= 2 || net(first.i, first.j) >= 20);
  if (!firstOk) {
    best = runs.reduce((a, b) => {
      const na = net(a.i, a.j);
      const nb = net(b.i, b.j);
      // 长度相差不足 10% 时取靠前的一块（正文多半在前）
      if (Math.abs(nb - na) < Math.max(4, na * 0.1)) return b.i < a.i ? b : a;
      return nb > na ? b : a;
    });
  }
  // 剥完不足 20 字 ⇒ 说明主体本身就是散文（温庭筠《蔡中郎坟》整条都是赏析），
  // 返回 null 交给调用方丢弃，而不是回滚成一段赏析。
  if (net(best.i, best.j) < 20) return null;
  // 剥离后同样可能只剩一个大句（李商隐《日日》、李益《行舟》、贺铸《青玉案》
  // 的赏析残句都是这样漏网的），再判一次
  if (best.j - best.i < 2 && net(best.i, best.j) < 40) return null;
  return sents
    .slice(best.i, best.j)
    .map((s) => s.replace(/[。！？]$/, ''))
    .join('。') + '。';
}

/** 归一化：去〔注〕、去脚注角标、压缩空白 */
function normalizeBody(body) {
  let t = String(body || '').trim();
  t = t.replace(/〔注〕[\s\S]*$/, '');
  t = t.replace(/\[\d+\]/g, '');
  t = t.replace(/〔[^〕]*〕/g, '');
  // 圈码脚注（①②③…）必须在切句**之前**清除，否则带脚注的词句会被
  // DIGIT 判成考据夹注，把一整首词切得七零八落（如苏轼《满庭芳》）。
  t = t.replace(/[①-⑳]/g, '');
  // 标点后多余的空格（孟郊《洛桥晚望》「人行绝； 榆柳萧疏」）：
  // 不去掉会让「空格分段」逻辑把它误判成小序分隔符
  t = t.replace(/([；，、：])\s+/g, '$1');
  // 开头孤引号：小序被截断后残留的半个引号（姜夔《琵琶仙》「”唯吴兴为然。」）
  t = t.replace(/^["“”'‘’]+/, '');
  return t.replace(/[ \t]+/g, ' ').trim();
}

/**
 * 前缀剥离：辞典正文常写成「作者 词牌 词题／小序 正文…」，
 * 其中小序与正文之间**只用空格分隔，没有句号**（刘克庄《一剪梅》
 * 「余赴广东，实之夜饯于风亭 束缊宵行十里强…」、辛弃疾《念奴娇》
 * 「登建康赏心亭，呈史留守致道 我来吊古…」），单靠句号切句切不开。
 *
 * 按「空格」逐段剥离，每段按如下顺序判定：
 *   ① 与作品标题吻合      → 词牌/标题，丢弃
 *   ② 纯中文 2~16 字      → 词题，丢弃并记为 sub（拼回展示标题）
 *   ③ 含逗号的 6~40 字    → 小序，丢弃（要求剩下的正文 ≥25 字，防止削残短诗）
 * 其余情况一律停止，避免吃掉正文首句。
 */
function stripTitlePrefix(text, title) {
  const nt = normTitle(title);
  let t = String(text || '').trim();
  let sub = '';
  const net = (s) => s.replace(/[\s。，！？；：、]/g, '').length;
  for (let i = 0; i < 3; i++) {
    const m = t.match(/^([^\s]{1,40})[ \t]/);
    if (!m) break;
    const tok = m[1];
    const ntk = normTitle(tok);
    const rest = t.slice(m[0].length);
    // ① 词牌/标题
    if (nt && (nt === ntk || nt.includes(ntk) || ntk.includes(nt))) {
      t = rest;
      continue;
    }
    // ② 词题：纯中文 2~16 字
    if (/^[一-龥]{2,16}$/.test(tok)) {
      sub = sub || tok;
      t = rest;
      continue;
    }
    // ③ 小序：含逗号、但**不含句末标点**的散文短语（长度 6~40），
    //    且剥掉后正文仍有 ≥25 字。
    //    必须排除句末标点：唐诗语料是「联1 联2 联3 联4 赏析」用空格分联，
    //    「滕王高阁临江渚，佩玉鸣鸾罢歌舞。」也含逗号，若无此限制会被当成
    //    小序逐联剥掉，全诗只剩末两句（实测收录从 1223 掉到 985）。
    if (/[，]/.test(tok) && !/[。！？]/.test(tok) && tok.length >= 6 && net(rest) >= 25) {
      t = rest;
      continue;
    }
    break;
  }
  return { text: t, sub };
}

/** 清洗失败明细（供复核，写出到 scripts/_cider/append-skipped.json） */
const skipLog = [];

/** 清洗后的纯净正文；空/太短返回 null（并把原因写进 skipLog） */
function cleanBody(body, names, title, dynasty) {
  const nameList = (Array.isArray(names) ? names : [names]).filter(Boolean);
  let t = String(body || '').trim();
  // 只在作者名后紧跟空白时才剥离：否则「李白乘舟将欲行」会被削成「乘舟将欲行」
  for (const nm of nameList) t = t.replace(new RegExp(`^${nm}[ \t]+`), '');
  t = normalizeBody(t);
  const { text: noTitle, sub } = stripTitlePrefix(t, title);
  const verse = pickVerse(noTitle, nameList[0], dynasty);
  // 整段都是散文（赏析取代了正文）⇒ 直接丢弃，不入库
  const clauses = verse.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
  if (clauses.length && clauses.every(clauseProse)) {
    skipLog.push({
      author: nameList[0], title, reason: '全篇散文（赏析/序取代正文）',
      raw: noTitle.slice(0, 80), poem: verse.slice(0, 80),
    });
    return null;
  }
  const trimmed = trimProse(verse);
  if (trimmed === null) {
    skipLog.push({
      author: nameList[0], title, reason: '剥离散文后不足 20 字',
      raw: noTitle.slice(0, 80), poem: verse.slice(0, 80),
    });
    return null;
  }
  const poem = trimmed
    .replace(/[①-⑳]/g, '')
    .replace(/\s{2,}/g, '')
    .trim();
  const bare = poem.replace(/[。，！？；、\s]/g, '');
  // 最短五言绝句正文也有 20 字（4×5），短于此视为残片，宁缺勿滥
  if (bare.length < 20) {
    skipLog.push({ author: nameList[0], title, raw: noTitle.slice(0, 80), poem: poem.slice(0, 80) });
    return null;
  }
  return { text: poem, sub };
}

/* ---------------------------------------------------------------- 体裁判定 */

/**
 * 体裁判定：韵文句式齐整（同一长度占比 ≥0.9）才判为诗，否则宋归「词」、
 * 唐按题名归「乐府 / 七言古诗」。早期按 0.75 阈值会把苏轼《定风波·红梅》
 * （含「闲雅」「何事」等二字短句）误判为七言律诗，故收紧为 0.9。
 */
/**
 * 常见词牌名（用于宋代体裁判定）。像《玉楼春》《木兰花》《生查子》这类
 * 齐言词牌，句式与七律/五绝完全一致，单靠句长无法区分，只能按词牌名判定。
 */
const CIPAI = new Set(
  ('浣溪沙 菩萨蛮 蝶恋花 临江仙 水调歌头 念奴娇 满江红 沁园春 西江月 鹧鸪天 清平乐 浪淘沙 ' +
    '虞美人 卜算子 生查子 忆秦娥 踏莎行 青玉案 江城子 定风波 破阵子 渔家傲 苏幕遮 声声慢 ' +
    '醉花阴 一剪梅 如梦令 渔歌子 忆江南 长相思 相见欢 南乡子 望江南 点绛唇 诉衷情 风入松 ' +
    '祝英台近 八声甘州 水龙吟 永遇乐 摸鱼儿 木兰花 玉楼春 减字木兰花 采桑子 丑奴儿 好事近 ' +
    '谒金门 阮郎归 画堂春 乌夜啼 朝中措 眼儿媚 人月圆 太常引 少年游 霜天晓角 柳梢青 忆王孙 ' +
    '醉太平 喜迁莺 武陵春 雨霖铃 望海潮 满庭芳 桂枝香 千秋岁 兰陵王 琐窗寒 应天长 瑞鹤仙 ' +
    '齐天乐 高阳台 三姝媚 夜合花 玉蝴蝶 双双燕 东风第一枝 绮罗香 八归 秋霁 宴山亭 燕山亭 ' +
    '石州慢 贺新郎 多丽 凤箫吟 汉宫春 帝台春 苏武慢 剔银灯 鹤冲天 破阵乐 昼夜乐 二郎神 ' +
    '锦堂春 迷仙引 曲玉管 采莲令 夜半乐 竹马子 长寿乐 倾杯 安公子 尾犯 早梅芳 斗百花 ' +
    '甘草子 送征衣 柳腰轻 西施 尉迟杯 征部乐 佳人醉 御街行 归朝欢 河传 更漏子 女冠子 ' +
    '酒泉子 荷叶杯 思帝乡 天仙子 醉公子 昭君怨 南歌子 潇湘神 捣练子 风流子 定西番 ' +
    '巫山一段云 河渎神 甘州曲 醉花间 纱窗恨 柳含烟 月宫春 恋情深 河满子 小重山 小重山令 ' +
    '惜红衣 琵琶仙 侧犯 庆宫春 杏花天影 一萼红 霓裳中序第一 湘月 龙吟曲 渡江云 凌歊 ' +
    '六州歌头 水调歌 琴调相思引 惜双双 剔银灯 山花子 好事近 卜算子 诉衷情 菩萨蛮 清平乐')
    .split(/\s+/)
    .filter(Boolean),
);

/** 取标题的首个词（去掉空格后的词牌部分） */
function paiOf(title) {
  const t = String(title || '').trim().split(/[\s·•]/)[0];
  return CIPAI.has(t) ? t : '';
}

function inferGenre(text, dynasty, title) {
  // 词牌优先：宋代齐言词牌（玉楼春/木兰花/生查子…）句式与律绝无异，按牌名判词
  if (dynasty === '宋' && paiOf(title)) return '词';
  const segs = text
    .split(/[，。？！；：、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length >= 4) {
    const cnt = new Map();
    for (const s of segs) cnt.set(s.length, (cnt.get(s.length) || 0) + 1);
    const [topLen, topN] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    const ratio = topN / segs.length;
    const base = { 4: '四言', 5: '五言', 6: '六言', 7: '七言' }[topLen];
    if (base && ratio >= 0.9) {
      const n = segs.length;
      if (base === '四言') return '四言古诗';
      return n <= 4 ? `${base}绝句` : n === 8 ? `${base}律诗` : `${base}古诗`;
    }
  }
  if (dynasty === '宋') return '词';
  return /行|歌|吟|引|曲|辞/.test(title) ? '乐府' : '七言古诗';
}

/* ---------------------------------------------------------------- 序列化 */

function tsStr(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

/** 标题归一化：与 scripts/cider-diff.mjs 的 normTitle 保持完全一致，
 *  去空格 / 去方括号圆括号注释（[1]、(其一)）/ 去书名号。 */
function normTitle(t) {
  return String(t || '')
    .replace(/\s/g, '')
    .replace(/[\[（(][^\]）)]*[\]）)]/g, '')
    .replace(/[《》]/g, '');
}

/** 展示用标题：去掉脚注角标与书名号，保留可读原名 */
function displayTitle(t) {
  return String(t || '')
    .replace(/\[\d+\]/g, '')
    .replace(/\[[一二三四五六七八九十]+\]/g, '')
    .replace(/[《》]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------- 主流程 */

// 1) 打包现有 POETS
const b = await build({
  entryPoints: [resolve(ROOT, 'src/data/poets.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  absWorkingDir: ROOT,
});
const tmp = resolve(ROOT, 'scripts/_poets-append.tmp.mjs');
writeFileSync(tmp, b.outputFiles[0].text);
const mod = await import(pathToFileURL(tmp).href);
const POETS = mod.POETS;

const byName = new Map();
for (const p of POETS) if (!byName.has(p.name)) byName.set(p.name, p);

// 2) 载入辞典 + diff 报告
const diff = JSON.parse(readFileSync(resolve(ROOT, 'scripts/_cider/diff-report.json'), 'utf8'));
const tang = JSON.parse(readFileSync(resolve(ROOT, 'scripts/_cider/cider-tang.json'), 'utf8'));
const song = JSON.parse(readFileSync(resolve(ROOT, 'scripts/_cider/cider-song.json'), 'utf8'));
const ciderIndex = new Map();
for (const a of tang.authors || []) ciderIndex.set('唐:' + a.name, a);
for (const a of song.authors || []) ciderIndex.set('宋:' + a.name, a);

const adds = [];
let statAdded = 0;
let statSkippedShort = 0;
const unmatched = [];

for (const dyn of ['唐', '宋']) {
  const list = dyn === '唐' ? diff.tang.matched : diff.song.matched;
  for (const entry of list) {
    const poet = byName.get(entry.projectAs) || byName.get(entry.name);
    if (!poet) {
      unmatched.push(`${dyn}:${entry.projectAs}`);
      continue;
    }
    const author = ciderIndex.get(dyn + ':' + entry.name);
    if (!author || !author.works) continue;

    // 已有标题集合（防止重复追加）。
    // 注意：忽略上一轮本脚本自己追加的 -wa* 作品，保证脚本可反复重跑。
    const have = new Set();
    for (const n of poet.nodes)
      for (const w of n.works) if (!/-wa\d+$/.test(w.id)) have.add(normTitle(w.title));

    // 缺失标题计数表（diff 报告给出）
    const need = new Map();
    for (const t of entry.missingWorkTitles || []) {
      const k = normTitle(t);
      need.set(k, (need.get(k) || 0) + 1);
    }

    // 目标节点：除「出生」外的全部节点；若只有出生节点则用全部
    let targets = poet.nodes.filter((n) => n.eventType !== 'birth');
    if (!targets.length) targets = poet.nodes.slice();
    if (!targets.length) continue;

    const perNode = new Map(targets.map((n) => [n.id, []]));
    let seq = 0;

    for (const w of author.works) {
      const k = normTitle(w.title);
      const left = need.get(k) || 0;
      if (left <= 0) continue;          // 已收录 / 非缺失
      if (have.has(k)) { need.set(k, 0); continue; }
      const cleaned = cleanBody(w.body, [author.name, poet.name], w.title, dyn);
      if (!cleaned) { statSkippedShort++; need.set(k, left - 1); continue; }
      need.set(k, left - 1);
      have.add(k);
      const text = cleaned.text;
      const dTitle = displayTitle(w.title);
      const title = cleaned.sub ? `${dTitle} ${cleaned.sub}` : dTitle;

      const node = targets[seq % targets.length];
      seq++;
      const wid = `${poet.id}-wa${seq}`;
      perNode.get(node.id).push({
        id: wid,
        title,
        genre: inferGenre(text, dyn, w.title),
        year: node.year,
        yearLabel: node.era || `${node.year}年`,
        placeId: node.id,
        excerpt: text.split(/(?<=[。！？])/).filter(Boolean).slice(0, 2).join(''),
        fullText: text,
        background: '辞典补录；原辞典未系年，暂附此节点，系年与地点待考。',
      });
      statAdded++;
    }

    for (const n of targets) {
      const ws = perNode.get(n.id) || [];
      if (ws.length) adds.push({ poetId: poet.id, poetName: poet.name, nodeId: n.id, works: ws });
    }
  }
}

/* ---------------------------------------------------------------- 输出 TS */

const lines = [];
lines.push('/**');
lines.push(' * 辞典补录 · 已有作者缺失作品追加表');
lines.push(' * ==================================================================');
lines.push(' * 由 scripts/gen-cider-append-works.mjs 自动生成，请勿手工编辑。');
lines.push(' * 来源：权威辞典 EPUB 解析语料（scripts/_cider/cider-tang/song.json）；');
lines.push(' * 经 stripProse → extractPoem → finalClean 三道工序裁除赏析散文，');
lines.push(' * 仅保留诗/词原文。原辞典未给系年，故按作者已有节点轮转挂载，');
lines.push(' * background 中已注明「系年与地点待考」。');
lines.push(' *');
lines.push(' * 合并位置：src/data/poets.ts 在 POETS 构造完成后调用 applyWorksAdd()。');
lines.push(' */');
lines.push("import type { Poet, Work } from '../types';");
lines.push('');
lines.push('export interface WorkAddition {');
lines.push('  poetId: string;');
lines.push('  nodeId: string;');
lines.push('  works: Work[];');
lines.push('}');
lines.push('');
lines.push('export const WORKS_ADD: WorkAddition[] = [');

for (const a of adds) {
  lines.push(`  /* ${a.poetName} · ${a.nodeId} （+${a.works.length}） */`);
  lines.push('  {');
  lines.push(`    poetId: ${tsStr(a.poetId)},`);
  lines.push(`    nodeId: ${tsStr(a.nodeId)},`);
  lines.push('    works: [');
  for (const w of a.works) {
    lines.push('      {');
    lines.push(`        id: ${tsStr(w.id)},`);
    lines.push(`        title: ${tsStr(w.title)},`);
    lines.push(`        genre: ${tsStr(w.genre)},`);
    lines.push(`        year: ${w.year},`);
    lines.push(`        yearLabel: ${tsStr(w.yearLabel)},`);
    lines.push(`        placeId: ${tsStr(w.placeId)},`);
    lines.push(`        excerpt: ${tsStr(w.excerpt)},`);
    lines.push(`        fullText: ${tsStr(w.fullText)},`);
    lines.push(`        background: ${tsStr(w.background)},`);
    lines.push('      },');
  }
  lines.push('    ],');
  lines.push('  },');
}
lines.push('];');
lines.push('');
lines.push('/** 把 WORKS_ADD 合并进 POETS（幂等：重复调用不会重复追加） */');
lines.push('export function applyWorksAdd(poets: Poet[]): number {');
lines.push('  const idx = new Map<string, Poet>();');
lines.push('  for (const p of poets) idx.set(p.id, p);');
lines.push('  let n = 0;');
lines.push('  for (const a of WORKS_ADD) {');
lines.push('    const p = idx.get(a.poetId);');
lines.push('    if (!p) continue;');
lines.push('    const node = p.nodes.find((x) => x.id === a.nodeId);');
lines.push('    if (!node) continue;');
lines.push('    const seen = new Set(node.works.map((w) => w.id));');
lines.push('    for (const w of a.works) {');
lines.push('      if (seen.has(w.id)) continue;');
lines.push('      node.works.push(w);');
lines.push('      n++;');
lines.push('    }');
lines.push('  }');
lines.push('  return n;');
lines.push('}');
lines.push('');

const out = resolve(ROOT, 'src/data/works-add.ts');
writeFileSync(out, lines.join('\n'), 'utf8');

console.log('追加节点组数:', adds.length);
console.log('追加作品数:', statAdded);
console.log('清洗失败跳过:', statSkippedShort);
console.log('未匹配作者:', unmatched.length, unmatched.slice(0, 20).join(','));
writeFileSync(
  resolve(ROOT, 'scripts/_cider/append-skipped.json'),
  JSON.stringify(skipLog, null, 1),
  'utf8',
);
console.log('清洗失败明细已写出: scripts/_cider/append-skipped.json');
console.log('已写出:', out);
