import React, { useState } from 'react';
import { useAppState } from '../store/PoetContext';
import { EVENT_TYPE_META } from '../types';
import { SONG_REGIONS, TANG_REGIONS } from '../data/regions';

/** 图例：节点类型、河流、底图政区说明（迭代 13：可收起） */
export default function Legend(): JSX.Element {
  const state = useAppState();
  const regions = state.era === 'tang' ? TANG_REGIONS : SONG_REGIONS;
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 max-w-[300px] rounded-sm border border-ink-4/45 bg-paper text-[12px] shadow-scroll backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="h-3 w-[3px] self-center bg-cinnabar" />
        <span className="section-title tracking-[0.12em] text-ink-2">图例</span>
        <span className="ml-auto text-[11px] text-ink-4">
          {state.era === 'tang' ? '唐 · 开元十五道' : '宋 · 路制'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm border border-ink-4/40 px-1 text-[11px] text-ink-3 hover:bg-paper-3"
          title={open ? '收起图例' : '展开图例'}
          aria-expanded={open}
        >
          {open ? '▴' : '▾'}
        </button>
      </div>

      {open ? (
        <div className="mt-2 p-2.5 pt-0">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="ml-auto text-ink-4">
            {state.era === 'tang' ? '唐 · 开元十五道' : '宋 · 路制'} · 示意 {regions.length} 区
          </span>
        </div>

        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {EVENT_TYPE_META.map((m) => (
            <span key={m.key} className="flex items-center gap-1">
              <span
                className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[10px] text-paper"
                style={{ background: m.color }}
                title={m.desc}
              >
                {m.glyph}
              </span>
              <span className="text-ink-3">{m.label}</span>
            </span>
          ))}
        </div>

        {/* 迭代 8：补充迭代 5/6 新增图元的说明（交游连线、时代都会分级） */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-ink-4/25 pt-1.5 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1">
            <svg width="18" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="18" y2="3" stroke="#B28A3C" strokeWidth="1.4" strokeDasharray="3 4" />
            </svg>
            交游连线（同地且相隔 ≤3 年）
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: '#A83232' }} />
            都城 / 陪都
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ background: '#6E665B', opacity: 0.75 }} />
            州府重镇
          </span>
          <span className="text-ink-4">放大地图可看到更多都会与其今地名</span>
        </div>

        {/* 迭代 9：说明新的视觉编码——节点大小 = 作品数，双环 = 创作重镇 */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-4/25 pt-1.5 text-[11.5px] text-ink-3">
          <span className="flex items-center gap-1.5">
            <svg width="34" height="14" aria-hidden="true">
              <circle cx="7" cy="7" r="3" fill="#9A9186" fillOpacity="0.5" stroke="#9A9186" strokeWidth="1" />
              <circle cx="22" cy="7" r="6" fill="#9A9186" fillOpacity="0.5" stroke="#9A9186" strokeWidth="1" />
            </svg>
            圆点越大＝此地作品越多
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="5" fill="#9A9186" fillOpacity="0.5" stroke="#9A9186" strokeWidth="1" />
              <circle cx="8" cy="8" r="7.5" fill="none" stroke="#A83232" strokeWidth="1.1" strokeDasharray="2.2 1.8" />
            </svg>
            双环＝创作重镇（≥3 篇）
          </span>
        </div>

        <div className="mt-1.5 border-t border-ink-4/25 pt-1.5 text-[11.5px] leading-relaxed text-ink-4">
          <span className="mr-2 inline-block h-[2px] w-4 align-middle" style={{ background: '#8C7A4F' }} />
          黄河
          <span className="mx-2 inline-block h-[2px] w-4 align-middle" style={{ background: '#5B7F95' }} />
          长江
          <br />
          底图为内置矢量（离线）：省级边界、南海诸岛断续线、主要河流与古今都会；
          唐宋政区为<b className="text-ink-3">简化示意</b>
          ，以现代省域近似归属，非精确疆界。
        </div>
        </div>
      ) : null}
    </div>
  );
}
