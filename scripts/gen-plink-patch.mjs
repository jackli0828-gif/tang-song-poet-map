/**
 * 生成「作品—地点」回填补丁 work-plink.ts
 * ==================================================================
 * 读取 scripts/_cider/plink/out-*.json（16 批史料抽取结果），
 * 生成 src/data/work-plink.ts（PLINK 数据 + applyWorkPlink 运行时函数）。
 *
 * 回填策略（保守，宁缺毋滥）：
 *   - confidence === 'none' → 跳过
 *   - 有坐标(place+lng+lat) → 改挂到正确地点（复用已有节点或按坐标去重新建）
 *   - 仅年份 → 只更新作品 year/yearLabel
 *   - 仅地点 → 改挂地点，年份维持原值
 *
 * 安全铁律：
 *   - 只改挂/追加「-wa」辞典补录作品，不碰手写作品，不删不改原有节点
 *   - 新建节点 id 用 <poetId>-pl<n>，按坐标去重，幂等可重跑
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const plinkDir = resolve(root, 'scripts/_cider/plink');
const outFiles = readdirSync(plinkDir).filter((f) => /^out-\d{2}\.json$/.test(f)).sort();

const items = [];
for (const f of outFiles) for (const it of JSON.parse(readFileSync(resolve(plinkDir, f), 'utf8')).items || []) items.push(it);
console.log(`读取 ${outFiles.length} 批，共 ${items.length} 条`);

const CONF = ['high', 'mid', 'low'];
const valid = items.filter((it) => CONF.includes(it.confidence) && ((it.place && it.lng != null && it.lat != null) || it.year != null));
console.log(`有效条目 ${valid.length}（跳过 none ${items.filter((i) => i.confidence === 'none').length}）`);

const q = (s) => `'${String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const lines = [];
lines.push('/**');
lines.push(' * 辞典补录作品 · 地点/系年回填补丁');
lines.push(' * ==================================================================');
lines.push(' * 由 scripts/gen-plink-patch.mjs 自动生成，请勿手工编辑。');
lines.push(' * 来源：scripts/_cider/plink/out-*.json（16 批史料抽取，confidence high/mid/low）。');
lines.push(' * 作用：把辞典补录作品（id 以 -wa 结尾）从「轮转挂载的待考节点」');
lines.push(' *       回填到辞典赏析明指的真正创作地 / 创作年。');
lines.push(" * 安全：只改挂/追加 id 含 -wa 的辞典补录作品，不删除不修改原有节点与手写作品，幂等。");
lines.push(' * 合并位置：src/data/poets.ts 在 applyWorksAdd(POETS) 之后调用 applyWorkPlink(POETS)。');
lines.push(' */');
lines.push("import type { Poet, LifeNode, Work, EventType } from '../types';");
lines.push('');
lines.push('export interface WorkPlink {');
lines.push('  poetId: string;');
lines.push('  /** 定位键：作者名 + 作品标题（运行时匹配 -wa 作品） */');
lines.push('  title: string;');
lines.push('  place?: string | null;');
lines.push('  modern?: string | null;');
lines.push('  lng?: number | null;');
lines.push('  lat?: number | null;');
lines.push('  year?: number | null;');
lines.push('  yearLabel?: string | null;');
lines.push('  eventType?: EventType | null;');
lines.push('  event?: string;');
lines.push("  confidence: 'high' | 'mid' | 'low';");
lines.push('}');
lines.push('');
lines.push('export const PLINK: WorkPlink[] = [');
for (const it of valid) {
  lines.push(
    `  { poetId: ${q(it.poetId)}, title: ${q(it.title)}, place: ${it.place ? q(it.place) : 'null'}, modern: ${it.modern ? q(it.modern) : 'null'}, lng: ${it.lng != null ? it.lng : 'null'}, lat: ${it.lat != null ? it.lat : 'null'}, year: ${it.year != null ? it.year : 'null'}, yearLabel: ${it.era ? q(it.era) : 'null'}, eventType: ${it.eventType ? q(it.eventType) : 'null'}, event: ${q(it.event || '')}, confidence: ${q(it.confidence)} },`,
  );
}
lines.push('];');
lines.push('');
lines.push('export function applyWorkPlink(poets: Poet[]): number {');
lines.push('  const idx = new Map<string, Poet>();');
lines.push('  for (const p of poets) idx.set(p.id, p);');
lines.push('  let n = 0;');
lines.push('  for (const pl of PLINK) {');
lines.push('    const p = idx.get(pl.poetId);');
lines.push('    if (!p) continue;');
lines.push("    // 定位 -wa 作品（按 poetId + title）");
lines.push('    let found: { node: LifeNode; work: Work } | null = null;');
lines.push('    outer: for (const node of p.nodes) {');
lines.push('      for (const w of node.works) {');
lines.push("        if (/\\-wa\\d+$/.test(w.id) && w.title === pl.title) { found = { node, work: w }; break outer; }");
lines.push('      }');
lines.push('    }');
lines.push('    if (!found) continue;');
lines.push('    const { node, work } = found;');
lines.push('    // 仅年份回填');
lines.push('    if (pl.year != null && !pl.place) {');
lines.push('      work.year = pl.year;');
lines.push('      work.yearLabel = pl.yearLabel ?? undefined; // null → 清空原 errors label');
lines.push('      n++; continue;');
lines.push('    }');
lines.push('    if (!pl.place || pl.lng == null || pl.lat == null) continue; // 只有地点没坐标：无法造点，跳过');
lines.push('    // 复用已有节点：按 place 或 modernPlace 匹配');
lines.push('    let dest = p.nodes.find((nd) => nd.place === pl.place || (pl.modern != null && nd.modernPlace === pl.modern));');
lines.push('    if (!dest) {');
lines.push('      const lng = pl.lng!; const lat = pl.lat!;');
lines.push('      dest = p.nodes.find((nd) => Math.abs(nd.lng - lng) < 0.06 && Math.abs(nd.lat - lat) < 0.06);');
lines.push('      if (!dest) {');
lines.push('        let seq = p.nodes.length + 1;');
lines.push('        let id = `${p.id}-pl${seq}`;');
lines.push('        while (p.nodes.some((nd) => nd.id === id)) { seq += 1; id = `${p.id}-pl${seq}`; }');
lines.push('        dest = {');
lines.push('          id,');
lines.push('          year: pl.year ?? node.year,');
lines.push('          place: pl.place,');
lines.push('          modernPlace: pl.modern ?? pl.place,');
lines.push('          lng: pl.lng,');
lines.push('          lat: pl.lat,');
lines.push("          eventType: (pl.eventType as EventType) ?? 'office',");
lines.push('          event: pl.event ? pl.event : `辞典补录《${work.title}》创作地。`,');
lines.push('          works: [],');
lines.push('          note: `地点/系年由辞典赏析回填（confidence ' + '${pl.confidence}）`,');
lines.push('        };');
lines.push('        p.nodes.push(dest);');
lines.push('      }');
lines.push('    }');
lines.push('    // 改挂：从原节点移除，挂到目标节点（若已是目标则只补年份/背景）');
lines.push('    if (dest !== node) {');
lines.push("      const ri = node.works.findIndex((w) => w.id === work.id);");
lines.push('      if (ri >= 0) node.works.splice(ri, 1);');
lines.push('      dest.works.push(work);');
lines.push('      work.placeId = dest.id;');
lines.push('    }');
lines.push('    if (pl.year != null) { work.year = pl.year; work.yearLabel = pl.yearLabel ?? undefined; }');
lines.push("    if (work.background && work.background.includes('待考')) {");
lines.push("      work.background = work.background.replace(/系年与地点待考[。.]?/, '系年与地点据辞典赏析回填');");
lines.push('    }');
lines.push('    n++;');
lines.push('  }');
lines.push('  return n;');
lines.push('}');

writeFileSync(resolve(root, 'src/data/work-plink.ts'), lines.join('\n') + '\n', 'utf8');
console.log(`已生成 src/data/work-plink.ts（${valid.length} 条）`);
const cc = { high: 0, mid: 0, low: 0 };
for (const it of valid) cc[it.confidence] += 1;
console.log(`  high=${cc.high} mid=${cc.mid} low=${cc.low} | 有坐标=${valid.filter((v) => v.place && v.lng != null).length} 仅年份=${valid.filter((v) => v.year != null && !v.place).length}`);
