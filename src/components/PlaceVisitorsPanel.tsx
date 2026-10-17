import React, { useState } from 'react';
import { EVENT_COLOR, EVENT_LABEL } from '../types';
import { formatEra } from '../utils/format';
import type { PlaceDetail, PlaceVisitorGroup } from '../utils/search';

/**
 * 迭代 11 · 地点访客面板
 * ------------------------------------------------------------------
 * 点击地图上的一座城市（或节点浮层里的「查看此地来过的人」）后弹出：
 * 列出「到过此地」的全部诗人、各自到访的年份（年号）、以及在此地留下的作品。
 * 设计目标——把「地点 → 谁 · 何时 · 写了什么」三件事一次性讲清。
 *
 * 数据由 search.ts 的 placeDetailAt() 以「经纬度」坐标归并而来，
 * 因此无论古称写法如何（长安 / 京兆 / 长安（今陕西西安）），都能正确聚合。
 */
export interface PlaceVisitorsPanelProps {
  detail: PlaceDetail;
  /** 点击城市标注时带入的城市古称 / 今地（覆盖坐标归并得出的聚簇名，更直观） */
  overrideName?: string;
  overrideModern?: string;
  onClose: () => void;
  /** 点击某位访客：切换为该诗人并关闭本面板 */
  onSelectPoet: (poetId: string) => void;
}

function VisitorGroup({
  group,
  onSelectPoet,
}: {
  group: PlaceVisitorGroup;
  onSelectPoet: (poetId: string) => void;
}): JSX.Element {
  const [openWorks, setOpenWorks] = useState<Set<string>>(new Set());
  const toggle = (id: string): void =>
    setOpenWorks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const poet = group.poet;

  return (
    <div className="rounded-sm border border-ink-4/35 bg-paper-2 p-2.5">
      {/* 访客头：色点 + 姓名 + 朝代 + 到访次数 */}
      <button
        type="button"
        onClick={() => onSelectPoet(poet.id)}
        className="flex w-full items-baseline gap-1.5 text-left transition hover:opacity-80"
        title="切换查看这位诗人"
      >
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: poet.avatarColor }}
        />
        <span className="font-kai text-[17px] text-ink hover:text-cinnabar">{poet.name}</span>
        <span className="text-[12px] text-ink-4">{poet.dynasty} · 到访 {group.visits.length} 次</span>
      </button>

      {/* 每次到访：年份（年号）+ 事件 + 作品 */}
      <div className="mt-1.5 space-y-2 border-l border-dashed border-ink-4/40 pl-2.5">
        {group.visits.map((v, i) => (
          <div key={v.nodeId} className="relative">
            <span
              className="absolute -left-[13px] top-1 h-2 w-2 rounded-full"
              style={{ background: EVENT_COLOR[v.eventType] }}
            />
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <span className="rounded-sm px-1.5 py-0.5 text-paper" style={{ background: EVENT_COLOR[v.eventType] }}>
                {EVENT_LABEL[v.eventType]}
              </span>
              <span className="text-ink-2">
                {formatEra(v.year)}（{v.year}）
              </span>
              {v.era ? <span className="text-ink-4">· {v.era}</span> : null}
            </div>

            {v.works.length === 0 ? (
              <p className="mt-0.5 text-[12px] text-ink-4">此地未见系年作品</p>
            ) : (
              <div className="mt-1 space-y-1">
                {v.works.map((w) => {
                  const expanded = openWorks.has(w.id);
                  return (
                    <div key={w.id} className="work-card rounded-sm border border-ink-4/30 bg-paper p-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggle(w.id)}
                          className="text-left text-[15px] text-ink hover:text-cinnabar"
                          title="展开 / 收起全文"
                        >
                          {w.title}
                        </button>
                        <span className="shrink-0 text-[11.5px] text-ink-4">
                          {w.genre} · {w.yearLabel ?? `${w.year}年`}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-line font-kai text-[14px] leading-[1.9] text-ink-2">
                        {expanded && w.fullText ? w.fullText : w.excerpt}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[12px]">
                        <button
                          type="button"
                          onClick={() => toggle(w.id)}
                          className="text-cinnabar hover:underline"
                        >
                          {expanded ? '收起' : '展开全文'}
                        </button>
                        {w.fullText ? null : <span className="text-ink-4">（长篇仅节选）</span>}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-4">【背景】{w.background}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {i < group.visits.length - 1 ? null : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlaceVisitorsPanel({
  detail,
  overrideName,
  overrideModern,
  onClose,
  onSelectPoet,
}: PlaceVisitorsPanelProps): JSX.Element {
  // 优先用「点击城市时带入的标题」，否则用坐标归并得出的聚簇名
  const placeName = overrideName ?? detail.name;
  const placeModern = overrideModern ?? detail.modern;
  return (
    <div
      className="absolute left-3 top-3 bottom-3 z-30 flex w-[336px] flex-col rounded-sm border border-ink-3/50 bg-paper shadow-popup"
      // 面板自身拦截事件，避免拖拽地图时误触发
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 头部：地点名 · 今地 · 访客数 */}
      <div className="flex items-start justify-between gap-2 border-b border-ink-4/30 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-kai text-[20px] text-ink">{placeName}</span>
            <span className="truncate text-[13px] text-ink-4">今{placeModern}</span>
          </div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">
            到访 {detail.totalVisitors} 位诗人 · 留作 {detail.totalWorks} 篇
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

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2.5">
        {detail.groups.length === 0 ? (
          <p className="rounded-sm border border-dashed border-ink-4/45 px-2 py-3 text-center text-[12.5px] text-ink-4">
            暂无收录诗人到访此地的记录。
          </p>
        ) : (
          detail.groups.map((g) => (
            <VisitorGroup key={g.poet.id} group={g} onSelectPoet={onSelectPoet} />
          ))
        )}
      </div>

      <div className="border-t border-ink-4/30 px-3 py-1.5 text-[11.5px] text-ink-4">
        点击访客姓名可切换查看该诗人 · 点击作品标题展开全文
      </div>
    </div>
  );
}
