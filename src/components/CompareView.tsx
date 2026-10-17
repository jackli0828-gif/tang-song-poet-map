import React, { useMemo } from 'react';
import { useApp, useAppDispatch, useAppState, yearOf } from '../store/PoetContext';
import { POETS } from '../data/poets';
import { EVENT_COLOR, EVENT_LABEL, type LifeNode, type Poet } from '../types';
import { ageAt, formatEra } from '../utils/format';
import { activeNodeIndex } from '../utils/geo';

/**
 * 多诗人对比视图（迭代 1 · C）
 * - C.1 并排泳道（lanes）：勾选 2-3 位后，同一公历年份下各诗人「身在哪里、写了什么」
 *       （左 = 诗人泳道，横向 = 年份，单元格 = 该年地点 + 作品数），播放年份高亮当前列。
 * - C.2 叠加模式：对比诗人轨迹线用其 avatarColor 区分颜色、可独立开关显示。
 * - C.3 顶部「同年速览」：当前播放年份下所有选中诗人的（地点, 作品标题）并排卡片，
 *       点卡片跳该诗人该节点（SELECT_POET + SET_NODE + 地图平滑飞行由 MapCanvas 完成）。
 */
export default function CompareView(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { selectedPoets, primaryPoet } = useApp();

  // 叠加轨迹线的独立开关（C.2）：每位诗人可单独显隐。
  // 必须走全局 store（hiddenPoetIds），否则 CompareView 内的本地 state 无法影响地图轨迹层。
  const isTrackOn = (id: string): boolean => !state.hiddenPoetIds.includes(id);

  const range = useMemo(() => {
    const starts = selectedPoets.map((p) => p.birthYear);
    const ends = selectedPoets.map((p) => p.deathYear);
    return { min: Math.min(...starts), max: Math.max(...ends) };
  }, [selectedPoets]);

  const year = yearOf(state, primaryPoet.id);
  // 播放过程中 year 是浮点（用于轨迹平滑插值），展示位一律取整
  const shownYear = Math.round(year);
  const span = range.max - range.min || 1;
  const pct = (y: number): number => ((y - range.min) / span) * 100;

  /** 某诗人在某年所处的节点（用于泳道单元格与同年速览） */
  const nodeAt = (p: Poet, y: number): LifeNode | undefined => {
    const i = activeNodeIndex(p.nodes, y);
    return p.nodes[i];
  };

  /** 泳道列：取所有选中诗人共同覆盖的年份步长，控制列数不超 80 列 */
  const laneYears = useMemo(() => {
    if (selectedPoets.length === 0) return [] as number[];
    const rawSpan = range.max - range.min || 1;
    // 列数目标 40 左右：步长 = ceil(span/40)，至少 1 年
    const step = Math.max(1, Math.ceil(rawSpan / 40));
    const out: number[] = [];
    for (let y = range.min; y <= range.max; y += step) out.push(y);
    return out;
  }, [range, selectedPoets]);

  /** C.3 同年速览卡片：当前年份下各诗人的（地点, 作品标题） */
  const sameYearCards = useMemo(
    () =>
      selectedPoets.map((p) => {
        const y = state.syncYears ? shownYear : Math.round(yearOf(state, p.id));
        const node = nodeAt(p, y);
        const works = node?.works ?? [];
        return {
          poet: p,
          y,
          node,
          workTitles: works.slice(0, 2).map((w) => w.title),
          workCount: works.length,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPoets, state, shownYear],
  );

  /** C.3 点卡片跳该诗人该节点：SELECT_POET（切换主诗人+停播）+ SET_NODE（定位该节点） */
  const jumpToCard = (poetId: string, nodeId: string, nodeYear: number): void => {
    dispatch({ type: 'SELECT_POET', id: poetId });
    // SELECT_POET 会把年份归到出生年，这里再补一次 SET_NODE 定位到目标节点
    dispatch({ type: 'SET_NODE', poetId, nodeId, year: nodeYear });
    dispatch({ type: 'SET_VIEW', view: 'map' });
  };

  return (
    <div className="panel-fade flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-4/30 px-4 py-3">
        <h2 className="text-[17px] tracking-[0.1em] text-ink">对照时间线</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
          勾选 2—3 位诗人，沿共同的时间轴查看「同一年，谁在哪里，写了什么」。
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {POETS.map((p) => {
            const on = state.selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => dispatch({ type: 'TOGGLE_COMPARE', id: p.id })}
                className={`rounded-sm border px-2 py-0.5 text-[12px] transition ${
                  on ? 'border-transparent text-paper' : 'border-ink-4/45 text-ink-2 hover:bg-paper-3'
                }`}
                style={on ? { background: p.avatarColor } : undefined}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        <label className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
          <input
            type="checkbox"
            checked={state.syncYears}
            onChange={(e) => dispatch({ type: 'SET_SYNC', sync: e.target.checked })}
            className="accent-cinnabar"
          />
          同步所有诗人到同一年份
        </label>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-[18px] text-ink">{shownYear}</span>
          <span className="text-[11.5px] text-ink-3">{formatEra(shownYear)}</span>
          <input
            className="ink-range flex-1"
            type="range"
            min={range.min}
            max={range.max}
            step={1}
            value={shownYear}
            onChange={(e) => dispatch({ type: 'SET_YEAR_ALL', year: Number(e.target.value) })}
          />
          <span className="text-[11px] text-ink-4">
            {range.min}—{range.max}
          </span>
        </div>

        {/* C.2 叠加轨迹线独立开关（水墨配色，按 avatarColor 区分） */}
        {selectedPoets.length > 1 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
            <span>叠加轨迹线：</span>
            {selectedPoets.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-1 rounded-sm border border-ink-4/40 px-1.5 py-0.5"
                style={{ opacity: isTrackOn(p.id) ? 1 : 0.5 }}
              >
                <input
                  type="checkbox"
                  checked={isTrackOn(p.id)}
                  onChange={() => dispatch({ type: 'TOGGLE_TRACK', id: p.id })}
                  className="accent-cinnabar"
                />
                <span className="inline-block h-2 w-4 rounded-full" style={{ background: p.avatarColor }} />
                <span style={{ color: p.avatarColor }}>{p.name}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* C.3 顶部同年速览卡片（当前年份下各诗人的地点 + 作品标题，点卡片跳转） */}
        {selectedPoets.length >= 2 ? (
          <div className="mb-4 rounded-sm border border-ink-4/40 bg-paper-2 p-3">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-[13px] tracking-[0.12em] text-ink-2">同年速览</span>
              <span className="text-[11px] text-ink-4">{shownYear} · {formatEra(shownYear)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {sameYearCards.map(({ poet, y, node, workTitles, workCount }) => (
                <button
                  key={poet.id}
                  type="button"
                  onClick={() => node && jumpToCard(poet.id, node.id, node.year)}
                  disabled={!node}
                  className="rounded-sm border border-ink-4/35 bg-paper p-2 text-left transition hover:border-cinnabar/60 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderLeft: `3px solid ${poet.avatarColor}` }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px]" style={{ color: poet.avatarColor }}>
                      {poet.name}
                    </span>
                    <span className="text-[11px] text-ink-4">{y} 年</span>
                  </div>
                  {node ? (
                    <>
                      <div className="mt-0.5 text-[12px] text-ink-2">
                        {node.place}（{node.modernPlace}）
                      </div>
                      {workCount > 0 ? (
                        <div className="mt-0.5 truncate text-[11.5px] text-cinnabar" title={workTitles.join('、')}>
                          {workTitles.join('、')}
                          {workCount > 2 ? ` 等 ${workCount} 篇` : ''}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[11px] text-ink-4">此年未系确切作品</div>
                      )}
                    </>
                  ) : (
                    <div className="mt-0.5 text-[11px] text-ink-4">是年尚无节点</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* C.1 并排泳道：横向年份，纵向诗人；播放年份高亮当前列 */}
        {selectedPoets.length >= 2 ? (
          <div className="mb-4 overflow-x-auto rounded-sm border border-ink-4/40 bg-paper-2 p-3">
            <div className="mb-2 text-[13px] tracking-[0.12em] text-ink-2">并排泳道 · 同一年谁在哪</div>
            <div className="min-w-[560px]">
              {/* 表头：年份列 */}
              <div className="flex border-b border-ink-4/30 pb-1 text-[10.5px] text-ink-4">
                <span className="w-12 shrink-0">诗人</span>
                {laneYears.map((y) => (
                  <span
                    key={y}
                    className={`flex-1 text-center ${y === shownYear ? 'text-cinnabar' : ''}`}
                  >
                    {y}
                  </span>
                ))}
              </div>
              {/* 各诗人泳道 */}
              {selectedPoets.map((p) => {
                const y = state.syncYears ? shownYear : Math.round(yearOf(state, p.id));
                const from = pct(p.birthYear);
                const to = pct(p.deathYear);
                return (
                  <div key={p.id} className="flex items-stretch border-b border-ink-4/20 py-1">
                    <span
                      className="flex w-12 shrink-0 items-center truncate text-[11px]"
                      style={{ color: p.avatarColor }}
                    >
                      {p.name}
                    </span>
                    <div className="relative flex flex-1">
                      {/* 生卒区间背景条（C.2 叠加颜色，按 avatarColor 区分；可被上方开关显隐） */}
                      <div
                        className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
                        style={{
                          left: `${from}%`,
                          width: `${Math.max(1, to - from)}%`,
                          background: p.avatarColor,
                          opacity: isTrackOn(p.id) ? 0.35 : 0.08,
                          transition: 'opacity 0.2s',
                        }}
                      />
                      {/* 各列单元格：该年地点 + 作品数 */}
                      {laneYears.map((ly) => {
                        // 仅当该年落在诗人 [生,卒] 区间内才填内容
                        const inRange = ly >= p.birthYear && ly <= p.deathYear;
                        const node = inRange ? nodeAt(p, ly) : undefined;
                        const isCur = state.syncYears ? ly === shownYear : false;
                        return (
                          <div
                            key={ly}
                            className={`relative flex-1 px-0.5 text-center ${
                              isCur ? 'bg-cinnabar/8' : ''
                            }`}
                            style={{ minWidth: 44 }}
                          >
                            {node ? (
                              <button
                                type="button"
                                onClick={() => dispatch({ type: 'SET_NODE', poetId: p.id, nodeId: node.id, year: node.year })}
                                className="mx-auto block max-w-full truncate rounded-sm px-0.5 py-0.5 text-[10.5px] text-ink-2 transition hover:bg-paper-3"
                                title={`${ly}｜${node.place}（${node.modernPlace}）· ${node.works.length} 篇作品`}
                              >
                                {node.place}
                                {node.works.length > 0 ? (
                                  <span className="ml-0.5 text-cinnabar">{node.works.length}</span>
                                ) : null}
                              </button>
                            ) : (
                              <span className="text-[10px] text-ink-4/60">·</span>
                            )}
                          </div>
                        );
                      })}
                      {/* 播放年份高亮列竖线（C.1：播放时一眼看出当前列） */}
                      {state.syncYears ? (
                        <div
                          className="pointer-events-none absolute top-0 h-full w-[2px]"
                          style={{ left: `${pct(shownYear)}%`, background: '#A83232', opacity: 0.75 }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 对照卡片（原有，保留） */}
        {selectedPoets.length < 2 ? (
          <p className="rounded-sm border border-dashed border-ink-4/45 px-3 py-6 text-center text-[12px] text-ink-4">
            请再勾选至少一位诗人，以查看对照结果。
          </p>
        ) : (
          <div className="space-y-3">
            {sameYearCards.map(({ poet, y, node }) => (
              <div
                key={poet.id}
                className="rounded-sm border border-ink-4/40 bg-paper p-3"
                style={{ borderLeft: `3px solid ${poet.avatarColor}` }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] text-ink">
                    {poet.name}
                    <span className="ml-2 text-[11.5px] text-ink-3">
                      {y} 年 · {formatEra(y)} · 年 {ageAt(y, poet.birthYear)}
                    </span>
                  </span>
                  {node ? (
                    <span
                      className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-paper"
                      style={{ background: EVENT_COLOR[node.eventType] }}
                    >
                      {EVENT_LABEL[node.eventType]} · {node.place}
                    </span>
                  ) : null}
                </div>

                {node ? (
                  <>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
                      在{node.place}（今{node.modernPlace}）：{node.event}
                    </p>
                    {node.works.length > 0 ? (
                      <ul className="mt-2 space-y-1.5">
                        {node.works.map((w) => (
                          <li key={w.id} className="rounded-sm bg-paper-3 px-2 py-1.5">
                            <span className="text-[14.5px] text-ink">{w.title}</span>
                            <span className="ml-2 text-[11px] text-ink-4">{w.genre}</span>
                            <p className="mt-0.5 font-kai text-[14px] leading-[1.9] text-ink-2">{w.excerpt}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11.5px] text-ink-4">此节点未系确切作品。</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1.5 text-[12px] text-ink-4">是年尚无年谱节点。</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
