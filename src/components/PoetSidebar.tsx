import React from 'react';
import { useApp, useAppDispatch, useAppState, useFilteredPoets } from '../store/PoetContext';
import { useStats } from '../hooks/usePoetData';

/** 左侧诗人名录：朝代筛选、搜索、单选 / 多选对比 */
export default function PoetSidebar(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { primaryPoet, selectedPoets } = useApp();
  const list = useFilteredPoets();
  const stats = useStats();

  return (
    <aside className="flex h-full w-full flex-col border-r border-ink-4/40 bg-paper-2 transition-all">
      <div className="flex items-center justify-between px-3 py-2 text-[13px] text-ink-3">
        <span>
          诗人词人
          <span className="ml-1.5 text-[11.5px] text-ink-4">
            {list.length} / {stats.poets} 家
          </span>
        </span>
        <button
          type="button"
          className="rounded-sm border border-ink-4/40 px-1.5 text-[12px] hover:bg-paper-3"
          onClick={() => dispatch({ type: 'CLEAR_COMPARE' })}
          title="只保留主诗人"
        >
          清空对比
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {list.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-ink-4">未找到匹配的诗人</p>
        ) : null}

        {list.map((p, i) => {
          // 迭代 10：名录按「朝代 + 生年」排序，此处在朝代切换处插一条分隔标题
          const prev = list[i - 1];
          const showDynastyHead = !prev || prev.dynasty !== p.dynasty;
          const isPrimary = p.id === state.primaryId;
          const inCompare = state.selectedIds.includes(p.id);
          return (
            <div key={p.id}>
              {showDynastyHead ? (
                <div className="mb-1 mt-1.5 flex items-center gap-1.5 px-1">
                  <span className="h-[10px] w-[2px] bg-cinnabar" />
                  <span className="text-[12px] tracking-[0.16em] text-ink-2">
                    {p.dynasty}
                    <span className="ml-1.5 text-[11px] text-ink-4">
                      {list.filter((x) => x.dynasty === p.dynasty).length} 家
                    </span>
                  </span>
                </div>
              ) : null}
              <div
                className={`mb-1 flex items-center rounded-sm border px-2 py-1 transition ${
                  isPrimary
                    ? 'border-cinnabar/70 bg-paper shadow-sm'
                    : inCompare
                      ? 'border-ink-4/45 bg-paper'
                      : 'border-transparent hover:bg-paper-3'
                }`}
              >
                <input
                  type="checkbox"
                  checked={inCompare}
                  onChange={() => dispatch({ type: 'TOGGLE_COMPARE', id: p.id })}
                  className="shrink-0 accent-cinnabar"
                  title="加入对比（最多 3 位）"
                />
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SELECT_POET', id: p.id })}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {p.name}
                  </span>
                  <span className="seal-square shrink-0 text-[10px]">{p.dynasty}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-ink-4/30 px-3 py-2 text-[12px] leading-relaxed text-ink-4">
        勾选多位（≤3）可开启对比模式：轨迹叠加、对照时间线。
        <br />
        当前主诗人：
        <span className="text-ink-2">{primaryPoet.name}</span>
        {selectedPoets.length > 1 ? (
          <>
            ｜对比：
            <span className="text-ink-2">{selectedPoets.map((p) => p.name).join('、')}</span>
          </>
        ) : null}
      </div>
    </aside>
  );
}
