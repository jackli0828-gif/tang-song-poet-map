/** 年号区间定义 */
export interface EraSpan {
  name: string;
  start: number;
  end: number;
  /** 纪年单位：唐天宝、至德年间称「载」 */
  unit?: '年' | '载';
  /** 纪年起算年（仅当区间被拆分时用到，默认为 start），保证序数年连续 */
  epoch?: number;
  ruler?: string;
}

/** 唐（含武周）年号表 */
export const TANG_ERAS: EraSpan[] = [
  { name: '武德', start: 618, end: 626, ruler: '高祖' },
  { name: '贞观', start: 627, end: 649, ruler: '太宗' },
  { name: '永徽', start: 650, end: 655, ruler: '高宗' },
  { name: '显庆', start: 656, end: 660, ruler: '高宗' },
  { name: '龙朔', start: 661, end: 663, ruler: '高宗' },
  { name: '麟德', start: 664, end: 665, ruler: '高宗' },
  { name: '乾封', start: 666, end: 667, ruler: '高宗' },
  { name: '总章', start: 668, end: 669, ruler: '高宗' },
  { name: '咸亨', start: 670, end: 673, ruler: '高宗' },
  { name: '上元', start: 674, end: 675, ruler: '高宗' },
  { name: '仪凤', start: 676, end: 678, ruler: '高宗' },
  { name: '调露', start: 679, end: 679, ruler: '高宗' },
  { name: '永隆', start: 680, end: 680, ruler: '高宗' },
  { name: '开耀', start: 681, end: 681, ruler: '高宗' },
  { name: '永淳', start: 682, end: 682, ruler: '高宗' },
  { name: '弘道', start: 683, end: 683, ruler: '高宗' },
  { name: '嗣圣', start: 684, end: 684, ruler: '中宗' },
  { name: '光宅', start: 684, end: 684, ruler: '睿宗' },
  { name: '垂拱', start: 685, end: 688, ruler: '武后' },
  { name: '永昌', start: 689, end: 689, ruler: '武后' },
  { name: '载初', start: 690, end: 690, ruler: '武后' },
  { name: '天授', start: 690, end: 691, ruler: '武后' },
  { name: '长寿', start: 692, end: 693, ruler: '武后' },
  { name: '延载', start: 694, end: 694, ruler: '武后' },
  { name: '证圣', start: 695, end: 695, ruler: '武后' },
  { name: '天册万岁', start: 695, end: 695, ruler: '武后' },
  { name: '万岁通天', start: 696, end: 696, ruler: '武后' },
  { name: '神功', start: 697, end: 697, ruler: '武后' },
  { name: '圣历', start: 698, end: 699, ruler: '武后' }, // 圣历元年 = 698（697 为神功元年）
  { name: '久视', start: 700, end: 700, ruler: '武后' },
  // 701 年正月改元大足、十月又改元长安，同属一年；李、王二家生年通称「长安元年」，
  // 故把长安置于大足之前，使 formatEra(701) 输出「长安元年」。
  { name: '长安', start: 701, end: 704, ruler: '武后' },
  { name: '大足', start: 701, end: 701, ruler: '武后' },
  { name: '神龙', start: 705, end: 706, ruler: '中宗' },
  { name: '景龙', start: 707, end: 709, ruler: '中宗' },
  { name: '景云', start: 710, end: 711, ruler: '睿宗' },
  { name: '先天', start: 712, end: 712, ruler: '玄宗' },
  { name: '开元', start: 713, end: 741, ruler: '玄宗' },
  // 天宝三年（744）正月朔「改年曰载」，故 742—743 仍称「年」，744 起称「载」；
  // 序数年仍自天宝元年（742）起算，故 744 = 天宝三载。
  { name: '天宝', start: 742, end: 743, unit: '年', epoch: 742, ruler: '玄宗' },
  { name: '天宝', start: 744, end: 755, unit: '载', epoch: 742, ruler: '玄宗' },
  { name: '至德', start: 756, end: 757, unit: '载', ruler: '肃宗' },
  { name: '乾元', start: 758, end: 759, ruler: '肃宗' },
  { name: '上元', start: 760, end: 761, ruler: '肃宗' },
  { name: '宝应', start: 762, end: 762, ruler: '代宗' },
  { name: '广德', start: 763, end: 764, ruler: '代宗' },
  { name: '永泰', start: 765, end: 765, ruler: '代宗' },
  { name: '大历', start: 766, end: 779, ruler: '代宗' },
  { name: '建中', start: 780, end: 783, ruler: '德宗' },
  { name: '兴元', start: 784, end: 784, ruler: '德宗' },
  { name: '贞元', start: 785, end: 804, ruler: '德宗' },
  { name: '永贞', start: 805, end: 805, ruler: '顺宗' },
  { name: '元和', start: 806, end: 820, ruler: '宪宗' },
  { name: '长庆', start: 821, end: 824, ruler: '穆宗' },
  { name: '宝历', start: 825, end: 826, ruler: '敬宗' },
  { name: '大和', start: 827, end: 835, ruler: '文宗' },
  { name: '开成', start: 836, end: 840, ruler: '文宗' },
  { name: '会昌', start: 841, end: 846, ruler: '武宗' },
  { name: '大中', start: 847, end: 859, ruler: '宣宗' },
  { name: '咸通', start: 860, end: 873, ruler: '懿宗' },
  { name: '乾符', start: 874, end: 879, ruler: '僖宗' },
  { name: '广明', start: 880, end: 881, ruler: '僖宗' },
  { name: '中和', start: 881, end: 884, ruler: '僖宗' },
  { name: '光启', start: 885, end: 887, ruler: '僖宗' },
  { name: '文德', start: 888, end: 888, ruler: '僖宗' },
  { name: '龙纪', start: 889, end: 889, ruler: '昭宗' },
  { name: '大顺', start: 890, end: 891, ruler: '昭宗' },
  { name: '景福', start: 892, end: 893, ruler: '昭宗' },
  { name: '乾宁', start: 894, end: 897, ruler: '昭宗' },
  { name: '光化', start: 898, end: 900, ruler: '昭宗' },
  { name: '天复', start: 901, end: 903, ruler: '昭宗' },
  { name: '天祐', start: 904, end: 907, ruler: '哀帝' },
];

/** 宋（两宋）年号表 */
export const SONG_ERAS: EraSpan[] = [
  { name: '建隆', start: 960, end: 963, ruler: '太祖' },
  { name: '乾德', start: 963, end: 968, ruler: '太祖' },
  { name: '开宝', start: 968, end: 976, ruler: '太祖' },
  { name: '太平兴国', start: 976, end: 983, ruler: '太宗' },
  { name: '雍熙', start: 984, end: 987, ruler: '太宗' },
  { name: '端拱', start: 988, end: 989, ruler: '太宗' },
  { name: '淳化', start: 990, end: 994, ruler: '太宗' },
  { name: '至道', start: 995, end: 997, ruler: '太宗' },
  { name: '咸平', start: 998, end: 1003, ruler: '真宗' },
  { name: '景德', start: 1004, end: 1007, ruler: '真宗' },
  { name: '大中祥符', start: 1008, end: 1016, ruler: '真宗' },
  { name: '天禧', start: 1017, end: 1021, ruler: '真宗' },
  { name: '乾兴', start: 1022, end: 1022, ruler: '真宗' },
  { name: '天圣', start: 1023, end: 1031, ruler: '仁宗' },
  { name: '明道', start: 1032, end: 1032, ruler: '仁宗' },
  { name: '景祐', start: 1034, end: 1037, ruler: '仁宗' },
  { name: '宝元', start: 1038, end: 1039, ruler: '仁宗' },
  { name: '康定', start: 1040, end: 1040, ruler: '仁宗' },
  { name: '庆历', start: 1041, end: 1048, ruler: '仁宗' },
  { name: '皇祐', start: 1049, end: 1053, ruler: '仁宗' },
  { name: '至和', start: 1054, end: 1055, ruler: '仁宗' },
  { name: '嘉祐', start: 1056, end: 1063, ruler: '仁宗' },
  { name: '治平', start: 1064, end: 1067, ruler: '英宗' },
  { name: '熙宁', start: 1068, end: 1077, ruler: '神宗' },
  { name: '元丰', start: 1078, end: 1085, ruler: '神宗' },
  { name: '元祐', start: 1086, end: 1093, ruler: '哲宗' },
  { name: '绍圣', start: 1094, end: 1097, ruler: '哲宗' },
  { name: '元符', start: 1098, end: 1100, ruler: '哲宗' },
  { name: '建中靖国', start: 1101, end: 1101, ruler: '徽宗' },
  { name: '崇宁', start: 1102, end: 1106, ruler: '徽宗' },
  { name: '大观', start: 1107, end: 1110, ruler: '徽宗' },
  { name: '政和', start: 1111, end: 1117, ruler: '徽宗' },
  { name: '重和', start: 1118, end: 1118, ruler: '徽宗' },
  { name: '宣和', start: 1119, end: 1125, ruler: '徽宗' },
  { name: '靖康', start: 1126, end: 1127, ruler: '钦宗' },
  { name: '建炎', start: 1127, end: 1130, ruler: '高宗' },
  { name: '绍兴', start: 1131, end: 1162, ruler: '高宗' },
  { name: '隆兴', start: 1163, end: 1164, ruler: '孝宗' },
  { name: '乾道', start: 1165, end: 1173, ruler: '孝宗' },
  { name: '淳熙', start: 1174, end: 1189, ruler: '孝宗' },
  { name: '绍熙', start: 1190, end: 1194, ruler: '光宗' },
  { name: '庆元', start: 1195, end: 1200, ruler: '宁宗' },
  { name: '嘉泰', start: 1201, end: 1204, ruler: '宁宗' },
  { name: '开禧', start: 1205, end: 1207, ruler: '宁宗' },
  { name: '嘉定', start: 1208, end: 1224, ruler: '宁宗' },
  { name: '宝庆', start: 1225, end: 1227, ruler: '理宗' },
  { name: '绍定', start: 1228, end: 1233, ruler: '理宗' },
  { name: '端平', start: 1234, end: 1236, ruler: '理宗' },
  { name: '嘉熙', start: 1237, end: 1240, ruler: '理宗' },
  { name: '淳祐', start: 1241, end: 1252, ruler: '理宗' },
  { name: '宝祐', start: 1253, end: 1258, ruler: '理宗' },
  { name: '开庆', start: 1259, end: 1259, ruler: '理宗' },
  { name: '景定', start: 1260, end: 1264, ruler: '理宗' },
  { name: '咸淳', start: 1265, end: 1274, ruler: '度宗' },
  { name: '德祐', start: 1275, end: 1276, ruler: '恭帝' },
  { name: '景炎', start: 1276, end: 1278, ruler: '端宗' },
  { name: '祥兴', start: 1278, end: 1279, ruler: '末帝' },
];

/** 五代十国（唐亡后至宋建立前，仅作兜底显示） */
export const FIVE_DYNASTIES_ERAS: EraSpan[] = [
  { name: '开平', start: 907, end: 910 },
  { name: '乾化', start: 911, end: 914 },
  { name: '贞明', start: 915, end: 920 },
  { name: '龙德', start: 921, end: 923 },
  { name: '同光', start: 923, end: 925 },
  { name: '天成', start: 926, end: 929 },
  { name: '长兴', start: 930, end: 933 },
  { name: '应顺', start: 934, end: 934 },
  { name: '清泰', start: 934, end: 936 },
  { name: '天福', start: 936, end: 943 },
  { name: '开运', start: 944, end: 946 },
  { name: '天福', start: 947, end: 947 },
  { name: '乾祐', start: 948, end: 950 },
  { name: '广顺', start: 951, end: 953 },
  { name: '显德', start: 954, end: 959 },
];

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 阿拉伯数字 → 中文数字（支持 1–130） */
export function chineseNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  const v = Math.floor(n);
  if (v === 0) return '零';
  if (v <= 10) return v === 10 ? '十' : DIGITS[v];
  if (v < 20) return `十${DIGITS[v - 10]}`;
  if (v < 100) {
    const tens = Math.floor(v / 10);
    const ones = v % 10;
    return ones === 0 ? `${DIGITS[tens]}十` : `${DIGITS[tens]}十${DIGITS[ones]}`;
  }
  if (v < 130) {
    const rest = v - 100;
    return rest === 0 ? '一百' : `一百${chineseNumber(rest).replace('一十', '十')}`;
  }
  return String(v);
}

/** 查年号（跨唐、五代、宋） */
export function findEra(year: number): EraSpan | null {
  const tables: EraSpan[][] = [TANG_ERAS, FIVE_DYNASTIES_ERAS, SONG_ERAS];
  for (const table of tables) {
    for (const e of table) {
      if (year >= e.start && year <= e.end) return e;
    }
  }
  return null;
}

/** 公元年 → 「年号 + 序数年」，如 725 → 「开元十三年」 */
export function formatEra(year: number): string {
  const era = findEra(year);
  if (!era) return `${year}年`;
  const ordinal = year - (era.epoch ?? era.start) + 1;
  const unit = era.unit ?? '年';
  if (ordinal === 1) return `${era.name}元${unit}`;
  return `${era.name}${chineseNumber(ordinal)}${unit}`;
}

/** 模糊年号词形（中/年间/初/末/前后/约）的判定 */
const FUZZY_TAIL = /^(中|年间|初|末|前后|约)$/;
/** 朝代级模糊描述（唐末/五代间/北宋末等），直接整体保留 */
const DYNASTY_FUZZY = /^(唐末|五代间|五代|宋初|北宋末|南宋初|南宋末|北宋|南宋|晚唐|初唐|盛唐|中唐|五季|唐末五代)$/;

/**
 * 模糊年号标签的容错显示（用于 UI 显示层）。
 * 传入数据里的 `era` / `yearLabel`，返回一个可放心显示给用户的字符串：
 *  - 数据标签本身是模糊描述（如「咸通中」「元和初」「唐末」「五代间」）且
 *    其年号名/朝代名与当前 `year` 实际所处年代一致 → 原样保留。
 *  - 否则回退到精确的 `formatEra(year)`。
 *  数据层的严格一致性校验（B4.5）仍走 `formatEra`；本函数只负责显示兜底，
 *  因此即便数据里残留个别模糊标签，UI 也不会抛错或自相矛盾。
 */
export function formatEraFuzzy(year: number, fuzzyLabel?: string): string {
  if (fuzzyLabel) {
    const era = findEra(year);
    if (fuzzyLabel.includes(era?.name ?? '')) {
      // 「咸通中」「元和初」「唐武宗会昌八年」：包含当前年号名 → 保留
      return fuzzyLabel;
    }
    // 「唐末」「五代间」等朝代级描述
    if (DYNASTY_FUZZY.test(fuzzyLabel)) {
      return fuzzyLabel;
    }
    // 形如「<年号><中|年间|初|末|前后|约>」且年号与当前一致
    const m = fuzzyLabel.match(/^(.+?)(中|年间|初|末|前后|约)$/);
    if (m && era && m[1] === era.name) {
      return fuzzyLabel;
    }
  }
  return formatEra(year);
}

/** 公元年 → 「年号（公元年）」 */
export function formatEraWithYear(year: number): string {
  return `${formatEra(year)}（${year}年）`;
}

/** 年龄（中国传统虚岁；此处按「年份 - 生年」近似） */
export function ageAt(year: number, birthYear: number): number {
  return Math.max(0, year - birthYear);
}

/** 年份区间格式化：[a,b] → 「a—b年」 */
export function formatRange(start: number, end: number): string {
  return start === end ? `${start}` : `${start}—${end}`;
}
