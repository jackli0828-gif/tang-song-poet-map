import React, { useEffect, useMemo } from 'react';
import { useApp, useAppDispatch, useAppState, useYearState, yearOf } from '../store/PoetContext';
import { citiesOfDynasty } from '../data/cities';
import { EVENT_COLOR, EVENT_LABEL, type LifeNode, type Poet, type Work } from '../types';
import { ageAt, formatEra } from '../utils/format';
import { activeNodeIndex } from '../utils/geo';

/** 单条作品卡片 */
function WorkCard({ work, poetId }: { work: Work; poetId: string }): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const expanded = state.expandedWorkIds.includes(work.id);

  return (
    <div className="work-card rounded-sm border border-ink-4/40 bg-paper p-3">
      <div className="flex items-baseline justify-between gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_WORK', workId: work.id })}
          className="text-left text-[17px] text-ink hover:text-cinnabar"
          title="展开 / 收起全文"
        >
          {work.title}
        </button>
        {/* 迭代 16：放大此篇（打开全文放大页，字号 / 页面大小可调） */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'OPEN_WORK_FULL', workId: work.id })}
          className="shrink-0 rounded-sm border border-ink-4/40 px-1 text-[11px] text-ink-3 transition hover:border-cinnabar/60 hover:text-cinnabar"
          title="放大查看全文"
        >
          ⊕ 放大
        </button>
        <span className="ml-auto shrink-0 text-[11px] text-ink-4">
          {work.genre} · {work.yearLabel ?? `${work.year}年`}
        </span>
      </div>

      <p className="mt-1.5 whitespace-pre-line font-kai text-[16px] leading-[1.95] tracking-wide text-ink-2">
        {expanded && work.fullText ? work.fullText : work.excerpt}
      </p>

      {work.tags && work.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {work.tags.map((t) => (
            <span key={t} className="rounded-sm bg-paper-3 px-1.5 py-0.5 text-[11px] text-ink-3">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-[13px] leading-relaxed text-ink-4">【创作背景】{work.background}</p>

      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_WORK', workId: work.id })}
          className="text-cinnabar hover:underline"
        >
          {expanded ? '收起' : '展开全文'}
        </button>
        {work.fullText ? null : (
          <button
            type="button"
            onClick={() => dispatch({ type: 'OPEN_WORK_FULL', workId: work.id })}
            className="text-cinnabar/80 hover:text-cinnabar hover:underline"
            title="打开全文放大页（字号 / 页面大小可调）"
          >
            查看全文 ›
          </button>
        )}
        <span className="ml-auto text-ink-4">{poetId ? '' : ''}</span>
      </div>
    </div>
  );
}

/** 单个诗人「此时此地」信息块 */
function PoetNowBlock({ poet, node, year }: { poet: Poet; node: LifeNode | undefined; year: number }): JSX.Element {
  // 播放过程中 year 为浮点，展示位取整
  const shownYear = Math.round(year);
  if (!node) {
    return (
      <div className="text-[12px] text-ink-4">
        {poet.name}：{shownYear} 年尚无年谱节点。
      </div>
    );
  }
  return (
    <div className="rounded-sm border border-ink-4/40 bg-paper-2 p-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-paper"
          style={{ background: EVENT_COLOR[node.eventType] }}
        >
          {EVENT_LABEL[node.eventType]}
        </span>
        <span className="text-[13.5px] text-ink-2">
          {poet.name}｜{formatEra(shownYear)}（{shownYear}）｜年 {ageAt(shownYear, poet.birthYear)}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
        在
        <span className="mx-1 font-kai text-[14.5px] text-ink">
          {node.place}
        </span>
        （今{node.modernPlace}）：{node.event}
      </p>
      {node.note ? <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">按：{node.note}</p> : null}
    </div>
  );
}

/** 右侧作品详情面板：人—时—地—作品 联动 */
export default function WorkPanel(): JSX.Element {
  const state = useAppState();
  const yearState = useYearState();
  const dispatch = useAppDispatch();
  const { primaryPoet, selectedPoets, compareMode } = useApp();

  const year = yearOf(yearState, primaryPoet.id);
  // 播放过程中 year 是浮点（用于轨迹平滑插值），展示位一律取整
  const shownYear = Math.round(year);
  const idx = activeNodeIndex(primaryPoet.nodes, year);
  const node: LifeNode | undefined = primaryPoet.nodes[idx];

  const prevNode = idx > 0 ? primaryPoet.nodes[idx - 1] : undefined;
  const nextNode = idx < primaryPoet.nodes.length - 1 ? primaryPoet.nodes[idx + 1] : undefined;

  // 迭代 1 · B.2：时间轴播放到某节点且该节点有作品时，右面板自动展开「最新一篇」
  // 仅在当前节点变化时触发一次（node.id 作 key），避免每帧抖动；
  // 用户手动「收起」后同节点不再重展。
  const lastNodeRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!node || node.works.length === 0) {
      lastNodeRef.current = null;
      return;
    }
    if (lastNodeRef.current === node.id) return;
    lastNodeRef.current = node.id;
    const latest = node.works[node.works.length - 1];
    dispatch({ type: 'ENSURE_WORK_EXPANDED', workId: latest.id });
  }, [node, dispatch]);

  const others = useMemo(() => selectedPoets.filter((p) => p.id !== primaryPoet.id), [selectedPoets, primaryPoet.id]);

  // 迭代 6：按主诗人所属朝代取当时的都会（古今双列）
  const eraCities = useMemo(() => citiesOfDynasty(primaryPoet.dynasty), [primaryPoet.dynasty]);

  return (
    <div className="panel-fade flex h-full min-h-0 flex-col">
      {/* 诗人小传 */}
      <div className="border-b border-ink-4/30 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[20px] tracking-[0.1em] text-ink">
              {primaryPoet.name}
              <span className="ml-2 text-[12px] text-ink-4">
                {primaryPoet.courtesy ? `字${primaryPoet.courtesy}` : ''}
                {primaryPoet.pseudonym ? `　号${primaryPoet.pseudonym}` : ''}
              </span>
            </h2>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              {primaryPoet.dynasty} · {primaryPoet.birthYear}—{primaryPoet.deathYear} · 籍出{primaryPoet.birthplace}
            </p>
          </div>
          <span className="seal text-[10px] leading-tight">
            {primaryPoet.dynasty}
            <br />
            {primaryPoet.name.slice(0, 1)}
          </span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{primaryPoet.brief}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* 当前节点 */}
        {node ? (
          <section className="rounded-sm border-l-2 border-cinnabar bg-paper-2 p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[26px] leading-none text-ink">{shownYear}</span>
              <span className="text-[12px] text-ink-3">{formatEra(shownYear)}</span>
              <span className="text-[12px] text-ink-3">
                {node.yearRange ? `${node.yearRange[0]}—${node.yearRange[1]} 年间` : ''}
              </span>
              <span className="text-[12px] text-ink-3">年 {ageAt(shownYear, primaryPoet.birthYear)} 岁</span>
              <span
                className="ml-auto rounded-sm px-2 py-0.5 text-[11px] text-paper"
                style={{ background: EVENT_COLOR[node.eventType] }}
              >
                {EVENT_LABEL[node.eventType]}
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-kai text-[21px] tracking-wide text-ink">{node.place}</span>
              <span className="text-[12px] text-ink-3">今{node.modernPlace}</span>
            </div>

            <p className="mt-2 text-[14.5px] leading-[1.9] text-ink-2">{node.event}</p>
            {node.era ? <p className="mt-1 text-[11.5px] text-ink-4">纪年：{node.era}</p> : null}
            {node.note ? <p className="mt-1 text-[11.5px] leading-relaxed text-ink-4">按：{node.note}</p> : null}

            <div className="mt-3 flex items-center gap-2 text-[11.5px]">
              <button
                type="button"
                disabled={!prevNode}
                onClick={() => prevNode && dispatch({ type: 'SET_NODE', poetId: primaryPoet.id, nodeId: prevNode.id, year: prevNode.year })}
                className="rounded-sm border border-ink-4/45 px-2 py-0.5 text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
              >
                ← 上一站 {prevNode ? `${prevNode.year} ${prevNode.place}` : ''}
              </button>
              <button
                type="button"
                disabled={!nextNode}
                onClick={() => nextNode && dispatch({ type: 'SET_NODE', poetId: primaryPoet.id, nodeId: nextNode.id, year: nextNode.year })}
                className="ml-auto rounded-sm border border-ink-4/45 px-2 py-0.5 text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
              >
                下一站 {nextNode ? `${nextNode.year} ${nextNode.place}` : ''} →
              </button>
            </div>
          </section>
        ) : null}

        {/* 迭代 6：作品已改为在地图上就地呈现（点击足迹节点即弹出），
            这里只保留一处提示，避免与地图浮层重复展示同一份内容。 */}
        <section className="mt-4">
          <h3 className="section-title mb-2 flex items-center gap-2 text-[13px] text-ink-2">
            <span className="rule-cloud" />
            此地此际所作
          </h3>
          {node && node.works.length > 0 ? (
            <div className="rounded-sm border border-ink-4/40 bg-paper-2 p-3">
              <p className="text-[12px] leading-relaxed text-ink-2">
                此节点系有 <span className="text-cinnabar">{node.works.length}</span> 篇作品，
                已在地图上就地呈现 —— 点击地图上的
                <span className="mx-1 font-kai text-[13px] text-ink">{node.place}</span>
                节点即可查看。
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {node.works.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'SET_NODE', poetId: primaryPoet.id, nodeId: node.id, year: node.year })
                    }
                    className="rounded-sm border border-ink-4/40 px-1.5 py-0.5 text-[11.5px] text-ink-2 transition hover:border-cinnabar/60 hover:text-cinnabar"
                    title="在地图上查看此作"
                  >
                    {w.title}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-sm border border-dashed border-ink-4/45 px-3 py-4 text-center text-[12px] text-ink-4">
              此节点未系确切作品（或作品系年存疑，未强系于此）。
            </p>
          )}
        </section>

        {/* 迭代 6 · 时代都会（古今双列）：按主诗人所属朝代列出当时全国主要城市 */}
        <section className="mt-4 border-t border-ink-4/25 pt-3">
          <h3 className="section-title mb-2 flex items-center gap-2 text-[13px] text-ink-2">
            <span className="rule-cloud" />
            {primaryPoet.dynasty}代都会 · 古今对照
            <span className="ml-auto text-[11px] text-ink-4">{eraCities.length} 处</span>
          </h3>
          <p className="mb-2 text-[11px] leading-relaxed text-ink-4">
            点击任一条目，地图即飞往该都会。
          </p>
          <div className="overflow-hidden rounded-sm border border-ink-4/35">
            {/* 表头：古今双列 */}
            <div className="grid grid-cols-[1fr_1.1fr] gap-2 border-b border-ink-4/30 bg-paper-3/60 px-2 py-1 text-[11px] text-ink-3">
              <span>当时名称</span>
              <span>今日地名</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {eraCities.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => dispatch({ type: 'FOCUS_POINT', lng: c.lng, lat: c.lat })}
                  title={c.note ? `${c.name}（今${c.modern}）：${c.note}` : `${c.name}（今${c.modern}）`}
                  className="grid w-full grid-cols-[1fr_1.1fr] items-baseline gap-2 border-b border-ink-4/20 px-2 py-1 text-left transition last:border-b-0 hover:bg-paper-3/70"
                >
                  <span
                    className={`truncate text-[14px] ${c.rank === 1 ? 'text-cinnabar' : 'text-ink'}`}
                  >
                    {c.rank === 1 ? '◆ ' : ''}
                    {c.name}
                  </span>
                  <span className="truncate text-[13px] text-ink-3">{c.modern}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[10.5px] text-ink-4">◆ 为都城 / 陪都</p>
        </section>

        {/* 对比模式：其他诗人的同一时刻 */}
        {compareMode && others.length > 0 ? (
          <section className="mt-4 border-t border-ink-4/25 pt-3">
            <h3 className="section-title mb-2 flex items-center gap-2 text-[13px] text-ink-2">
              <span className="rule-cloud" />
              同一时刻 · 他人何在
            </h3>
            <div className="space-y-2">
              {others.map((p) => {
                const y = yearOf(yearState, p.id);
                const i = activeNodeIndex(p.nodes, y);
                return <PoetNowBlock key={p.id} poet={p} node={p.nodes[i]} year={y} />;
              })}
            </div>
            {!state.syncYears ? (
              <p className="mt-2 text-[11px] text-ink-4">提示：勾选底部「同步对比年份」，可让所有诗人停在同一年对照。</p>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
