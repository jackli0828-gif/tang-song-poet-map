import React from 'react';
import { useAppDispatch, useAppState } from '../store/PoetContext';
import { EVENT_COLOR, EVENT_LABEL, type LifeNode, type Poet } from '../types';
import { ageAt, formatEra } from '../utils/format';
import { visitorNamesAt } from '../utils/search';

/**
 * 迭代 6 · 地图作品浮层
 * ------------------------------------------------------------------
 * 把原先位于右侧栏的「此地此际所作」搬到地图上：
 * 点击某个足迹节点后，作品就地呈现在节点旁，做到「地点 → 作品」的直接对应，
 * 不再需要视线在地图与右侧栏之间来回跳转。
 *
 * 组件只负责呈现与定位（位置由 MapCanvas 依据当前变换算好后传入），
 * 展开状态仍走全局 expandedWorkIds，与作品总览页保持一致。
 *
 * 迭代 7 · 可读性：
 * - 背景改为宣纸**实色**（原为半透明，压在地图上发灰、字迹难辨），并加深投影；
 * - 作品卡用 paper-2 实色，与浮层底色形成层次；
 * - 各层级字号整体上调（见下方 text-[..]）。
 */
export interface MapWorkPopupProps {
  poet: Poet;
  node: LifeNode;
  /** 浮层左上角锚点（容器内像素坐标），已由父组件做过边界收敛 */
  left: number;
  top: number;
  /** 朝向：'up' 表示节点在浮层下方（浮层画在节点上方） */
  placement: 'up' | 'down';
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  /** 当前年份（播放时为浮点，展示取整数） */
  year: number;
}

export default function MapWorkPopup({
  poet,
  node,
  left,
  top,
  placement,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  year,
}: MapWorkPopupProps): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const shownYear = Math.round(year);
  // 迭代 11：此地还有多少位「其他」诗人到访（用于浮层底部入口）
  const otherVisitors = Math.max(0, visitorNamesAt(node.lng, node.lat).length - 1);

  return (
    <div
      className="absolute z-30 w-[340px] rounded-sm border border-ink-3/50 bg-paper shadow-popup"
      style={{ left, top }}
      // 浮层自身拦截事件，避免拖拽地图时误触发节点
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 指向节点的小三角 */}
      <div
        className="absolute h-2 w-2 rotate-45 border-b border-r border-ink-4/45 bg-paper"
        style={
          placement === 'up'
            ? { left: 22, bottom: -5 }
            : { left: 22, top: -5, borderBottom: 'none', borderRight: 'none', borderTop: '1px solid', borderLeft: '1px solid' }
        }
      />

      {/* 头部：人 · 时间 · 地点 */}
      <div className="flex items-start justify-between gap-2 border-b border-ink-4/30 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-kai text-[19px] text-ink">{node.place}</span>
            <span className="truncate text-[13px] text-ink-4">今{node.modernPlace}</span>
          </div>
          <div className="mt-0.5 text-[13px] text-ink-3">
            {poet.name} · {formatEra(shownYear)}（{shownYear}） · 年 {ageAt(shownYear, poet.birthYear)} 岁
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-sm border border-ink-4/40 px-1.5 text-[13px] text-ink-3 transition hover:bg-paper-3"
          title="关闭"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[52vh] overflow-y-auto px-3 py-2">
        <div className="flex items-center gap-1.5 text-[12.5px]">
          <span
            className="rounded-sm px-1.5 py-0.5 text-paper"
            style={{ background: EVENT_COLOR[node.eventType] }}
          >
            {EVENT_LABEL[node.eventType]}
          </span>
          {node.yearRange ? (
            <span className="text-ink-4">
              {node.yearRange[0]}—{node.yearRange[1]} 年间
            </span>
          ) : null}
        </div>

        <p className="mt-1.5 text-[13.5px] leading-[1.9] text-ink-2">{node.event}</p>
        {node.note ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">按：{node.note}</p> : null}

        {/* 作品列表：就地呈现此地此际所作 */}
        <div className="mt-2.5">
          <div className="section-title mb-1.5 flex items-center gap-1.5 text-[14px] text-ink-2">
            <span className="rule-cloud" />
            此地此际所作（{node.works.length}）
          </div>

          {node.works.length === 0 ? (
            <p className="rounded-sm border border-dashed border-ink-4/45 px-2 py-3 text-center text-[12.5px] text-ink-4">
              此节点未系确切作品（或作品系年存疑，未强系于此）。
            </p>
          ) : (
            <div className="space-y-1.5">
              {node.works.map((w) => {
                const expanded = state.expandedWorkIds.includes(w.id);
                return (
                  <div key={w.id} className="work-card rounded-sm border border-ink-4/35 bg-paper-2 p-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_WORK', workId: w.id })}
                        className="text-left text-[16px] text-ink hover:text-cinnabar"
                        title="展开 / 收起全文"
                      >
                        {w.title}
                      </button>
                      <span className="shrink-0 text-[12px] text-ink-4">
                        {w.genre} · {w.yearLabel ?? `${w.year}年`}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line font-kai text-[14.5px] leading-[1.95] text-ink-2">
                      {expanded && w.fullText ? w.fullText : w.excerpt}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[12.5px]">
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'TOGGLE_WORK', workId: w.id })}
                        className="text-cinnabar hover:underline"
                      >
                        {expanded ? '收起' : '展开全文'}
                      </button>
                      {w.fullText ? null : <span className="text-ink-4">（长篇仅节选）</span>}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-4">【背景】{w.background}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 底部：上一站 / 下一站 / 查看此地来过的人 */}
      <div className="flex items-center gap-2 border-t border-ink-4/30 px-3 py-1.5 text-[12.5px]">
        <button
          type="button"
          disabled={!hasPrev}
          onClick={onPrev}
          className="rounded-sm border border-ink-4/45 px-1.5 py-0.5 text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
        >
          ← 上一站
        </button>
        <button
          type="button"
          onClick={() => {
            // 迭代 11：打开「地点访客」面板，并把本节点浮层收起
            dispatch({ type: 'OPEN_PLACE', lng: node.lng, lat: node.lat });
            onClose();
          }}
          className="rounded-sm border border-cinnabar/50 bg-cinnabar/5 px-1.5 py-0.5 text-cinnabar transition hover:bg-cinnabar/10"
          title="查看所有到过此地的诗人、年份与作品"
        >
          此地来过的人{otherVisitors > 0 ? `（${otherVisitors}）` : ''} ›
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={onNext}
          className="ml-auto rounded-sm border border-ink-4/45 px-1.5 py-0.5 text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
        >
          下一站 →
        </button>
      </div>
    </div>
  );
}
