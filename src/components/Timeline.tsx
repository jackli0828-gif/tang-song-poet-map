import React, { useCallback, useEffect, useMemo } from 'react';
import { useApp, useAppDispatch, useAppState, yearOf } from '../store/PoetContext';
import { useTimelinePlayer } from '../hooks/useTimelinePlayer';
import { useSpeechState } from '../hooks/useSpeech';
import { EVENT_COLOR, type LifeNode, type PlaySpeed, type Poet } from '../types';
import { ageAt, formatEra } from '../utils/format';
import { activeNodeIndex } from '../utils/geo';

const SPEEDS: PlaySpeed[] = [0.5, 1, 2];

/**
 * 单诗人「有作品年份」集合（迭代 1 · B.3）：
 * 用于在时间轴上把「有作品的年份」标成小朱砂点/短竖线，
 * 播放时一眼看出「这一段有创作产出」。按诗人 memo 一次。
 */
function useWorkYears(poet: Poet): Set<number> {
  return useMemo(() => {
    const s = new Set<number>();
    for (const n of poet.nodes) {
      for (const w of n.works) s.add(w.year);
    }
    return s;
  }, [poet]);
}

/** 单个诗人的时间轴轨道（对比模式下的其他诗人使用） */
function PoetTrackRow({
  poet,
  year,
  active,
  onPickNode,
}: {
  poet: Poet;
  year: number;
  active: boolean;
  onPickNode?: (poetId: string, node: LifeNode) => void;
}): JSX.Element {
  const span = poet.deathYear - poet.birthYear || 1;
  const pct = (y: number): number => ((y - poet.birthYear) / span) * 100;
  const idx = activeNodeIndex(poet.nodes, year);
  const node = poet.nodes[idx];
  const workYears = useWorkYears(poet);

  return (
    <div className={`flex items-center gap-2 ${active ? '' : 'opacity-80'}`}>
      <span
        className="w-14 shrink-0 truncate text-[12px] tracking-wide"
        style={{ color: poet.avatarColor }}
        title={poet.name}
      >
        {poet.name}
      </span>
      <div className="relative h-6 flex-1">
        <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 rounded bg-ink/15" />
        <div
          className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded"
          style={{ width: `${pct(year)}%`, background: poet.avatarColor, opacity: 0.75 }}
        />
        {/* 迭代 1 · B.3：有作品的年份标朱砂短竖线（区别于普通节点圆点） */}
        {[...workYears].map((wy) => (
          <div
            key={`w-${wy}`}
            className="pointer-events-none absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pct(wy)}%`, background: '#B03A2E', opacity: 0.85 }}
            title={`${wy} 年有作品`}
          />
        ))}
        {poet.nodes.map((n, i) => (
          <button
            key={n.id}
            type="button"
            title={`${n.year}｜${n.place}（${n.modernPlace}）`}
            onClick={() => onPickNode?.(poet.id, n)}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150"
            style={{
              left: `${pct(n.year)}%`,
              width: i === idx ? 11 : 8,
              height: i === idx ? 11 : 8,
              background: i <= idx ? EVENT_COLOR[n.eventType] : '#DCD3C0',
              border: i === idx ? '2px solid #F5EFE1' : '1px solid rgba(110,102,91,0.45)',
              boxShadow: i === idx ? '0 0 0 2px rgba(43,39,36,0.25)' : 'none',
            }}
          />
        ))}
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-[2px] -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pct(year)}%`, background: '#A83232' }}
        />
      </div>
      <span className="w-[128px] shrink-0 truncate text-right text-[11px] text-ink-3">
        {node ? `${node.place}` : ''}
      </span>
    </div>
  );
}

/** 底部时间轴与播放控制（迭代 1 · B.3：有作品年份朱砂标记 + 播放自动展开在 WorkPanel） */
export default function Timeline(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { primaryPoet, selectedPoets, compareMode } = useApp();

  const year = yearOf(state, primaryPoet.id);
  // 播放过程中 year 是浮点（用于轨迹平滑插值），展示位一律取整
  const shownYear = Math.round(year);
  const idx = activeNodeIndex(primaryPoet.nodes, year);
  const node: LifeNode | undefined = primaryPoet.nodes[idx];

  const onTick = useCallback(
    (y: number): void => {
      dispatch({ type: 'SET_YEAR', poetId: primaryPoet.id, year: y });
    },
    [dispatch, primaryPoet.id],
  );

  const onEnd = useCallback((): void => {
    dispatch({ type: 'SET_PLAYING', playing: false });
  }, [dispatch]);

  useTimelinePlayer({
    start: primaryPoet.birthYear,
    end: primaryPoet.deathYear,
    playing: state.playing,
    speed: state.speed,
    currentYear: year,
    onTick,
    onEnd,
  });

  const setYear = useCallback(
    (y: number): void => {
      dispatch({ type: 'SET_YEAR', poetId: primaryPoet.id, year: y });
    },
    [dispatch, primaryPoet.id],
  );

  /** 点击节点精确定位（迭代 1 · A.1：MapCanvas 监听 SET_NODE 后自动平滑飞行） */
  const onPickNode = useCallback(
    (poetId: string, n: LifeNode): void => {
      dispatch({ type: 'SET_NODE', poetId, nodeId: n.id, year: n.year });
    },
    [dispatch],
  );

  /**
   * 迭代 12 · 播放生平轨迹时朗读该诗人的主要生平介绍。
   *
   * 依赖刻意只取「播放状态 / 朗读开关 / 诗人 id」三者：
   * - 依赖不含 year，所以播放中每帧推进年份不会反复重读小传；
   * - 只有「开始播放」或「切换诗人」这两个真正需要重读的时刻才会触发；
   * - 暂停 / 播完 / 关掉朗读时立即停声（cancelSpeech）。
   */
  const { speak, cancelSpeech, supported: speechOk } = useSpeechState();
  useEffect(() => {
    if (!speechOk) return;
    if (state.playing && state.readBrief) {
      speak(`${primaryPoet.name}，${primaryPoet.dynasty}代诗人。${primaryPoet.brief}`, 'brief');
    } else {
      cancelSpeech();
    }
  }, [
    state.playing,
    state.readBrief,
    primaryPoet.id,
    primaryPoet.name,
    primaryPoet.dynasty,
    primaryPoet.brief,
    speechOk,
    speak,
    cancelSpeech,
  ]);

  const others = useMemo(() => selectedPoets.filter((p) => p.id !== primaryPoet.id), [selectedPoets, primaryPoet.id]);
  const mainWorkYears = useWorkYears(primaryPoet);
  const mainSpan = primaryPoet.deathYear - primaryPoet.birthYear || 1;
  const mainPct = (y: number): number => ((y - primaryPoet.birthYear) / mainSpan) * 100;

  return (
    <div className="panel-fade border-t border-ink-4/40 bg-paper-2/70 px-4 py-3">
      {/* 控制区 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
          className="flex h-9 min-w-[84px] items-center justify-center gap-1.5 rounded-sm border border-cinnabar/60 bg-paper px-3 text-[13px] text-cinnabar transition hover:bg-cinnabar hover:text-paper"
        >
          <span className="text-[11px]">{state.playing ? '❙❙' : '▶'}</span>
          {state.playing ? '暂停' : '播放'}
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: 'RESET_YEAR', poetId: primaryPoet.id })}
          className="h-9 rounded-sm border border-ink-4/50 px-3 text-[13px] text-ink-2 transition hover:bg-paper-3"
          title="回到出生年"
        >
          ⟲ 复位
        </button>

        <div className="flex items-center gap-1">
          <span className="text-[12px] text-ink-3">速度</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => dispatch({ type: 'SET_SPEED', speed: s })}
              className={`h-7 rounded-sm border px-2 text-[12px] transition ${
                state.speed === s
                  ? 'border-cinnabar bg-cinnabar text-paper'
                  : 'border-ink-4/50 text-ink-2 hover:bg-paper-3'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* 迭代 12：朗读开关 —— 播放生平轨迹时朗读该诗人的主要生平介绍。
            浏览器不支持 Web Speech 时整块隐藏，避免给出无效按钮。 */}
        {speechOk ? (
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_READ_BRIEF' })}
            className={`h-9 rounded-sm border px-3 text-[13px] transition ${
              state.readBrief
                ? 'border-cinnabar bg-cinnabar text-paper'
                : 'border-ink-4/50 text-ink-2 hover:bg-paper-3'
            }`}
            title="播放生平轨迹时，朗读该诗人的主要生平介绍"
          >
            🔊 朗读生平
          </button>
        ) : null}

        {/* 迭代 4：播放时地图自动跟随当前节点，避免「人已走出画面」看不见 */}
        <label className="flex items-center gap-1.5 text-[12px] text-ink-2" title="播放推进到新节点时，若节点移出视野，地图自动平滑归中（不改变缩放）">
          <input
            type="checkbox"
            checked={state.followPlay}
            onChange={() => dispatch({ type: 'TOGGLE_FOLLOW' })}
            className="accent-cinnabar"
          />
          镜头跟随
        </label>

        {/* 迭代 5：同地同时的交游连线（对比模式下才有意义） */}
        {compareMode ? (
          <label className="flex items-center gap-1.5 text-[12px] text-ink-2" title="两位诗人在同一古地名、年份相差 3 年内，即连一条交游虚线，随时间推进逐步显现">
            <input
              type="checkbox"
              checked={state.showLinks}
              onChange={() => dispatch({ type: 'TOGGLE_LINKS' })}
              className="accent-cinnabar"
            />
            交游连线
          </label>
        ) : null}

        {compareMode ? (
          <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={state.syncYears}
              onChange={(e) => dispatch({ type: 'SET_SYNC', sync: e.target.checked })}
              className="accent-cinnabar"
            />
            同步对比年份
          </label>
        ) : null}

        {/* 迭代 4：快捷键提示 */}
        <span className="hidden text-[11px] text-ink-4 lg:inline">
          空格 播放/暂停 · ←→ 上一站/下一站
        </span>

        <div className="ml-auto flex items-baseline gap-3">
          <span className="text-[20px] leading-none text-ink">{shownYear}</span>
          <span className="text-[12px] text-ink-3">{formatEra(shownYear)}</span>
          <span className="text-[12px] text-ink-3">年 {ageAt(shownYear, primaryPoet.birthYear)} 岁</span>
          {node ? (
            <span className="rounded-sm bg-paper-3 px-2 py-0.5 text-[12px] text-ink-2">
              {node.place}（{node.modernPlace}）
            </span>
          ) : null}
        </div>
      </div>

      {/* 主诗人轨道 */}
      <div className="mt-3 flex items-center gap-2">
        <span className="w-14 shrink-0 truncate text-[12px]" style={{ color: primaryPoet.avatarColor }}>
          {primaryPoet.name}
        </span>
        <input
          className="ink-range flex-1"
          type="range"
          min={primaryPoet.birthYear}
          max={primaryPoet.deathYear}
          step={1}
          value={Math.round(year)}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <span className="w-[128px] shrink-0 text-right text-[11px] text-ink-3">
          {primaryPoet.birthYear} — {primaryPoet.deathYear}
        </span>
      </div>

      {/* 主诗人节点刻度（点击精确定位；迭代 1 · B.3 叠加朱砂作品年份标记） */}
      <div className="mt-1 flex items-center gap-2">
        <span className="w-14 shrink-0" />
        <div className="relative h-7 flex-1">
          {/* 迭代 1 · B.3：有作品的年份标小朱砂点（位于刻度带上方，区别于普通节点圆点） */}
          {[...mainWorkYears].map((wy) => (
            <span
              key={`work-${wy}`}
              className="pointer-events-none absolute top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
              style={{ left: `${mainPct(wy)}%`, background: '#B03A2E', opacity: 0.9 }}
              title={`${wy} 年有作品`}
            />
          ))}
          {primaryPoet.nodes.map((n, i) => {
            const left = mainPct(n.year);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onPickNode(primaryPoet.id, n)}
                title={`${n.year}｜${n.place}`}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-150"
                style={{
                  left: `${left}%`,
                  width: i === idx ? 12 : 9,
                  height: i === idx ? 12 : 9,
                  background: i <= idx ? EVENT_COLOR[n.eventType] : '#DCD3C0',
                  border: i === idx ? '2px solid #F5EFE1' : '1px solid rgba(110,102,91,0.45)',
                  boxShadow: i === idx ? '0 0 0 2px rgba(43,39,36,0.25)' : 'none',
                }}
              />
            );
          })}
        </div>
        <span className="w-[128px] shrink-0" />
      </div>

      {/* 对比模式：其他诗人轨道 */}
      {compareMode && others.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-ink-4/25 pt-2">
          {others.map((p) => (
            <PoetTrackRow key={p.id} poet={p} year={yearOf(state, p.id)} active={false} onPickNode={onPickNode} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
