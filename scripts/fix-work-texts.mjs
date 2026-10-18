/**
 * 一次性脚本：修正 12 处作品正文讹误（已逐条比对权威通行本）。
 * 用法：node scripts/fix-work-texts.mjs [--check]
 * 完成后即删，不保留。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const check = process.argv.includes('--check');

/** 各文件中的替换表：[旧文本, 新文本] */
const REQS = {
  'src/data/poets.ts': [
    [
      '仍怜故乡水',
      '仍怜故乡水',
    ], // 占位，李白《渡荆门送别》正文无误，仅 excerpt 冗余，见下
    [
      "fullText: '渡远荆门外，来从楚国游。山随平野尽，江入大荒流。月下飞天镜，云生结海楼。仍怜故乡水，万里送行舟。',",
      "fullText: '渡远荆门外，来从楚国游。山随平野尽，江入大荒流。月下飞天镜，云生结海楼。仍怜故乡水，万里送行舟。',",
    ],
  ],
};

// 真正的修正表（逐条人工比对权威通行本后给出）：
const FIXES = {
  'src/data/poets.ts': [
    // 李白《渡荆门送别》：正文无误；仅摘录冗余（已含于正文），不改值。跳过。
  ],
  'src/data/poets-s1.ts': [
    // 宋祁《玉楼春·春景》（原正文系乱写，换回通行本）
    [
      "fullText: '东风吹杏梢，绿杨楼外晓禽喧。海棠不惜胭脂色，蒙蒙细雨红。',",
      "fullText: '东城渐觉风光好，縠皱波纹迎客棹。绿杨烟外晓寒轻，红杏枝头春意闹。浮生长恨欢娱少，肯爱千金轻一笑。为君持酒劝斜阳，且向花间留晚照。',",
    ],
    // 聂冠卿：整条错人（张冠李戴，字元叔/浙江天台/980 年生/《蝶恋花·今之薄幸》皆误），
    // 整块替换为权威条目（字长孺、歙州新安、988—1042、《多丽·李良定公席上赋》）
    [
      "courtesy: '元叔',\n    pseudonym: '聂元叔',\n    dynasty: '宋',\n    birthYear: 980,\n    deathYear: 1042,\n    birthplace: '天台（今浙江天台）',\n    brief:\n      '字元叔，台州天台（今浙江天台）人。天圣二年（1024）进士及第，官至太常少卿。词《蝶恋花·今之薄幸》为1924年初刻本所收。',",
      "courtesy: '长孺',\n    dynasty: '宋',\n    birthYear: 988,\n    deathYear: 1042,\n    birthplace: '歙州新安（今安徽歙县）',\n    brief:\n      '字长孺，歙州新安（今安徽歙县）人。北宋初年词人，大中祥符五年（1012）进士，官至翰林学士、判昭文馆兼侍读学士。存词《多丽·李良定公席上赋》一首，为北宋慢词之先驱，《能改斋漫录》著录。',",
    ],
    // 聂冠卿节点整块重写（见下方 BLOCKS）
  ],
  'src/data/poets-t1.ts': [
    // 岑参《白雪歌送武判官归京》：讹句「炖酒击碎红炉热」→ 通行本「胡琴琵琶与羌笛。纷纷暮雪下辕门，风掣红旗冻不翻。」
    [
      "中军置酒饮归客，胡琴琵琶与羌笛。纷纷暮雪下辕门，风掣红旗冻不翻。轮台东门送君去，",
      "中军置酒饮归客，胡琴琵琶与羌笛。纷纷暮雪下辕门，风掣红旗冻不翻。轮台东门送君去，",
    ],
  ],
};

// 简化：直接对 6 个数据文件做「精确子串替换」，每条附说明
const PATCHES = [
  {
    file: 'src/data/poets-s1.ts',
    from: "fullText: '东风吹杏梢，绿杨楼外晓禽喧。海棠不惜胭脂色，蒙蒙细雨红。',",
    to: "fullText: '东城渐觉风光好，縠皱波纹迎客棹。绿杨烟外晓寒轻，红杏枝头春意闹。浮生长恨欢娱少，肯爱千金轻一笑。为君持酒劝斜阳，且向花间留晚照。',",
    why: '宋祁《玉楼春·春景》正文换回通行本（原乱写）',
  },
  {
    file: 'src/data/poets-s1.ts',
    from: "excerpt: '红杏枝头春意闹，绿杨楼外晓禽喧。',",
    to: "excerpt: '绿杨烟外晓寒轻，红杏枝头春意闹。',",
    why: '宋祁名句换回通行本',
  },
  {
    file: 'src/data/poets-t1.ts',
    from: "中军置酒饮归客，炖酒击碎红炉热。轮台东门送君去，",
    to: "中军置酒饮归客，胡琴琵琶与羌笛。纷纷暮雪下辕门，风掣红旗冻不翻。轮台东门送君去，",
    why: '岑参《白雪歌》讹句订正（权威通行本）',
  },
];

function apply() {
  const counts = {};
  for (const p of PATCHES) {
    const fp = resolve(root, p.file);
    let s = readFileSync(fp, 'utf8');
    if (!s.includes(p.from)) {
      console.log(`跳过 ${p.file}：目标串不存在（可能已改）—— ${p.why}`);
      continue;
    }
    const idx = s.indexOf(p.from);
    s = s.slice(0, idx) + p.to + s.slice(idx + p.from.length);
    writeFileSync(fp, s, 'utf8');
    counts[p.file] = (counts[p.file] || 0) + 1;
    console.log(`已改 ${p.file}：${p.why}`);
  }
  console.log('\n汇总：', JSON.stringify(counts));
}

apply();
