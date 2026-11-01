/**
 * 数据完整性体检
 * ==================================================================
 * 这个项目 93% 的产物体积是手写数据（474 位诗人 / 1827 个年谱节点 / 2066 篇作品），
 * 但此前没有任何自动化校验 —— 数据错误只能靠肉眼在界面上发现。
 *
 * 本脚本在构建前跑一遍，把「静默错数据」变成「构建失败」。检查项：
 *   1. id 唯一性（诗人 / 节点 / 作品）
 *   2. 生卒年自洽（birthYear ≤ deathYear），节点年份落在生卒区间内
 *   3. 坐标合法且在合理的中国范围（防经纬度写反、少一位）
 *   4. 作品 placeId 必须指向存在的节点，且属于同一位诗人
 *   5. 作品年份与诗人卒年 / 生年不冲突（冲突只报警告：多属史料异说）
 *   6. 名句（excerpt）的**每一句**都必须能在全文（fullText）中找到 ——
 *      excerpt 是「首联 + 名句」拼接而成，不是连续片段，所以逐句比对；
 *      历史上出现过「首联被当标题剥掉，名篇只剩半首」的 bug，这条专防它复发
 *   7. 每位诗人至少一个节点；每个节点 eventType 合法
 *
 * 分级原则：
 *   · 错误（阻断构建）—— 结构性错误，界面一定会显示错或直接崩
 *   · 警告（只打印）  —— 史料异说 / 缺全文，需人工判断，不该挡住构建
 *
 * 运行：npm run check:data
 */
import { POETS, loadSupplements, DATA_STATS, getAllWorks } from '../src/data/poets';
import { EVENT_TYPE_META } from '../src/types';
import type { Poet } from '../src/types';

const errors: string[] = [];
const warnings: string[] = [];

/** 以 EVENT_TYPE_META 为唯一事实来源，避免两处定义漂移 */
const VALID_EVENT_TYPES = new Set(EVENT_TYPE_META.map((m) => m.key));

/** 中国及周边（含碎叶等境外出生地）的合理经纬度包络 */
const LNG_MIN = 40;
const LNG_MAX = 145;
const LAT_MIN = -5;
const LAT_MAX = 60;

function err(msg: string): void {
  errors.push(msg);
}
function warn(msg: string): void {
  warnings.push(msg);
}

/**
 * 常见异体 / 通假字折叠。
 * 同一首诗的「名句」与「全文」可能取自不同整理本（如「花著露」与「花着露」），
 * 这属于版本差异而非数据错误，比对前统一折叠，避免误报。
 */
const VARIANT_FOLD: Record<string, string> = {
  著: '着',
  沈: '沉',
  裏: '里',
  於: '于',
  儘: '尽',
  衹: '只',
  祇: '只',
  牠: '他',
  妳: '你',
  閒: '闲',
  濶: '阔',
};

/** 只保留中日韩文字与数字，并折叠异体字，用于跨标点比对 */
function normalizeText(s: string): string {
  return s
    .replace(/[^\u4e00-\u9fff\u3400-\u4dbf0-9A-Za-z]/g, '')
    .replace(/[著沈裏於儘衹祇牠妳閒濶]/g, (ch) => VARIANT_FOLD[ch] ?? ch);
}

/** 按中文标点切句 */
function splitClauses(s: string): string[] {
  return s
    .split(/[，。！？；：、,.!?;:"'“”‘’（）()《》\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

async function main(): Promise<void> {
  // 先并入「辞典补录」语料，否则只校验到基础 847 篇
  try {
    await loadSupplements();
  } catch (e) {
    warn(`补充语料加载失败，仅校验基础语料：${(e as Error).message}`);
  }

  const poetIds = new Set<string>();
  const nodeIds = new Set<string>();
  const workIds = new Set<string>();

  for (const poet of POETS) {
    checkPoet(poet);
  }

  function checkPoet(poet: Poet): void {
    const where = `诗人 ${poet.name}(${poet.id})`;

    if (poetIds.has(poet.id)) err(`${where}: 诗人 id 重复`);
    poetIds.add(poet.id);

    if (!(poet.birthYear <= poet.deathYear)) {
      err(`${where}: 生年 ${poet.birthYear} 晚于卒年 ${poet.deathYear}`);
    }
    if (!poet.nodes || poet.nodes.length === 0) {
      err(`${where}: 没有任何年谱节点`);
      return;
    }

    const localNodeIds = new Set(poet.nodes.map((n) => n.id));

    for (const node of poet.nodes) {
      const nw = `${where} 节点 ${node.id}`;

      if (nodeIds.has(node.id)) err(`${nw}: 节点 id 全局重复`);
      nodeIds.add(node.id);

      if (node.year < poet.birthYear || node.year > poet.deathYear) {
        warn(
          `${nw}: 年份 ${node.year} 不在生卒区间 [${poet.birthYear}, ${poet.deathYear}] 内` +
            '（生卒或系年至少有一处需人工核定）',
        );
      }
      if (!VALID_EVENT_TYPES.has(node.eventType)) {
        err(`${nw}: 非法 eventType「${node.eventType}」`);
      }
      if (!Number.isFinite(node.lng) || !Number.isFinite(node.lat)) {
        err(`${nw}: 经纬度不是有限数 (${node.lng}, ${node.lat})`);
      } else {
        if (node.lng < LNG_MIN || node.lng > LNG_MAX) {
          err(`${nw}: 经度 ${node.lng} 越界（合理范围 ${LNG_MIN}–${LNG_MAX}），检查是否与纬度写反`);
        }
        if (node.lat < LAT_MIN || node.lat > LAT_MAX) {
          err(`${nw}: 纬度 ${node.lat} 越界（合理范围 ${LAT_MIN}–${LAT_MAX}）`);
        }
      }
      if (!node.place || !node.modernPlace) {
        err(`${nw}: place / modernPlace 缺失`);
      }

      for (const work of node.works) {
        const ww = `${nw} 作品《${work.title}》`;

        if (workIds.has(work.id)) err(`${ww}: 作品 id 全局重复`);
        workIds.add(work.id);

        // placeId 必须指向存在且属于同一诗人的节点
        if (work.placeId && !localNodeIds.has(work.placeId)) {
          const owner = POETS.find((p) => p.nodes.some((n) => n.id === work.placeId));
          err(
            `${ww}: placeId「${work.placeId}」不属于本诗人` +
              (owner ? `（指向了 ${owner.name}）` : '（节点不存在）'),
          );
        }

        // 作品年份不应早于生年 / 晚于卒年
        if (typeof work.year === 'number') {
          if (work.year < poet.birthYear || work.year > poet.deathYear) {
            warn(
              `${ww}: 系年 ${work.year} 不在生卒区间 ` +
                `[${poet.birthYear}, ${poet.deathYear}] 内（生卒或系年至少有一处需人工核定）`,
            );
          }
        } else {
          err(`${ww}: 缺少 year`);
        }

        // 名句逐句比对：excerpt 是「首联 + 名句」拼接，不要求连续
        if (work.excerpt && work.fullText) {
          const flatFull = normalizeText(work.fullText);
          const missing = splitClauses(work.excerpt).filter(
            (clause) => !flatFull.includes(normalizeText(clause)),
          );
          if (missing.length > 0) {
            err(
              `${ww}: 名句有 ${missing.length} 句不在全文中 → 「${missing.slice(0, 2).join('」「')}」` +
                '（疑全文被截断，或名句与全文版本不一致）',
            );
          }
        }
        if (!work.fullText) {
          warn(`${ww}: 没有全文 fullText`);
        }
      }
    }
  }

  // 统计
  const allWorks = getAllWorks();
  const worksWithoutPlace = allWorks.filter((w) => !w.placeId).length;
  if (worksWithoutPlace > 0) {
    warn(`有 ${worksWithoutPlace} 篇作品的 placeId 为空（不影响渲染，但无法按地点聚合）`);
  }

  console.log('=== 数据规模 ===');
  console.log(`  诗人   ${DATA_STATS.poets}（唐 ${DATA_STATS.tang} / 宋 ${DATA_STATS.song}）`);
  console.log(`  节点   ${DATA_STATS.nodes}`);
  console.log(`  作品   ${DATA_STATS.works}（基础 ${DATA_STATS.works - DATA_STATS.worksAdd - DATA_STATS.workPlink} + 补录 ${DATA_STATS.worksAdd} + 回填 ${DATA_STATS.workPlink}）`);

  if (warnings.length > 0) {
    console.log(`\n=== 警告 ${warnings.length} 条 ===`);
    for (const w of warnings.slice(0, 20)) console.log(`  ! ${w}`);
    if (warnings.length > 20) console.log(`  … 其余 ${warnings.length - 20} 条略`);
  }

  if (errors.length > 0) {
    console.error(`\n=== 错误 ${errors.length} 条 ===`);
    for (const e of errors.slice(0, 40)) console.error(`  ✗ ${e}`);
    if (errors.length > 40) console.error(`  … 其余 ${errors.length - 40} 条略`);
    console.error('\n数据体检未通过。');
    process.exit(1);
  }

  console.log('\n数据体检通过：id 唯一、生卒自洽、坐标合法、引用完整、名句与全文一致。');
}

main().catch((e) => {
  console.error('数据体检脚本自身出错：', e);
  process.exit(1);
});
