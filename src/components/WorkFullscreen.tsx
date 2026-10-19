import React, { useEffect, useMemo, useState } from 'react';
import { useAppState, useAppDispatch } from '../store/PoetContext';
import { POET_MAP } from '../data/poets';
import { type Poet, type Work } from '../types';
import { ageAt, formatEra } from '../utils/format';

/**
 * 迭代 16 · 作品全文放大页
 * ------------------------------------------------------------------
 * 点击作品标题旁的「放大」按钮后弹出（与地图浮层、右面板完全解耦）：
 * - 全屏遮罩 + 居中「纸页」版式，展示作品全文（fullText 缺省时显示节选并标注）；
 * - 字号可调：A− / A+（12–32px，步进 1px），调节正文与标题大小；
 * - 页面大小可调：⤡ / ⤢（50%–150%，步进 10%），同步调节纸页宽度与正文等比缩放；
 * - Esc 键、点击遮罩空白处或右上角「✕ 关闭」退出。
 */
export default function WorkFullscreen(): JSX.Element | null {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const openWorkId = state.openWorkId;

  // 组件级状态：关闭重开时回到默认（简单可预期）
  const [fontSize, setFontSize] = useState(18);
  const [pageScale, setPageScale] = useState(100);

  const close = (): void => dispatch({ type: 'OPEN_WORK_FULL', workId: null });

  // 打开的作品定位：按 id 反查作品与所属诗人（取主诗人优先，其次其余对比诗人）
  const ctx = useMemo<{ poet: Poet; work: Work; nodeIndex: number } | null>(() => {
    if (!openWorkId) return null;
    const ordered = [state.primaryId, ...state.selectedIds.filter((id) => id !== state.primaryId)];
    for (const pid of ordered) {
      const poet = POET_MAP[pid];
      if (!poet) continue;
      for (let i = 0; i < poet.nodes.length; i++) {
        const w = poet.nodes[i].works.find((x) => x.id === openWorkId);
        if (w) return { poet, work: w, nodeIndex: i };
      }
    }
    return null;
  }, [openWorkId, state.primaryId, state.selectedIds]);

  // Esc 关闭 + 打开时重置字号 / 缩放；同时锁定页面滚动
  useEffect(() => {
    if (!openWorkId) return;
    setFontSize(18);
    setPageScale(100);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWorkId]);

  if (!openWorkId || !ctx) return null;

  const { poet, work } = ctx;
  const node = poet.nodes[ctx.nodeIndex];
  const body = work.fullText ?? work.excerpt;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`《${work.title}》全文放大`}
      // 点击遮罩空白处即关闭（纸页自身事件不冒泡到此）
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* 纸页 */}
      <div
        className="paper-bg flex h-[92vh] flex-col overflow-hidden rounded-sm border border-ink-3/60 shadow-popup"
        style={{ width: `${pageScale}vw`, maxWidth: '1100px' }}
      >
        {/* 工具栏：字号 / 页面大小 / 关闭 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-4/30 bg-paper px-3 py-2">
          <span className="text-[13px] text-ink-3">字号</span>
          <button
            type="button"
            onClick={() => setFontSize((s) => Math.max(12, s - 1))}
            disabled={fontSize <= 12}
            className="rounded-sm border border-ink-4/45 px-2 py-0.5 text-[13px] text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
            title="缩小字号"
          >
            A−
          </button>
          <span className="w-8 text-center text-[12px] text-ink-3">{fontSize}px</span>
          <button
            type="button"
            onClick={() => setFontSize((s) => Math.min(32, s + 1))}
            disabled={fontSize >= 32}
            className="rounded-sm border border-ink-4/45 px-2 py-0.5 text-[13px] text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
            title="放大字号"
          >
            A+
          </button>

          <span className="ml-3 text-[13px] text-ink-3">页面</span>
          <button
            type="button"
            onClick={() => setPageScale((s) => Math.max(50, s - 10))}
            disabled={pageScale <= 50}
            className="rounded-sm border border-ink-4/45 px-2 py-0.5 text-[13px] text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
            title="缩小页面"
          >
            ⤡
          </button>
          <span className="w-10 text-center text-[12px] text-ink-3">{pageScale}%</span>
          <button
            type="button"
            onClick={() => setPageScale((s) => Math.min(150, s + 10))}
            disabled={pageScale >= 150}
            className="rounded-sm border border-ink-4/45 px-2 py-0.5 text-[13px] text-ink-2 transition enabled:hover:bg-paper-3 disabled:opacity-40"
            title="放大页面"
          >
            ⤢
          </button>

          <button
            type="button"
            onClick={close}
            className="ml-auto rounded-sm border border-ink-4/40 px-2 py-0.5 text-[13px] text-ink-2 transition hover:bg-paper-3"
            title="关闭（Esc）"
          >
            ✕ 关闭
          </button>
        </div>

        {/* 正文区：外层固定高度，内层按页面百分比等比缩放（zoom），版式不变形 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className="absolute inset-0 overflow-y-auto px-4 py-5"
            style={{ zoom: pageScale / 100 }}
          >
            <div
              className="mx-auto max-w-[820px]"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.95 }}
            >
              <header className="border-b border-ink-4/30 pb-4 text-center">
                <h2 className="font-kai text-ink" style={{ fontSize: fontSize * 1.6 }}>
                  {work.title}
                </h2>
                <p className="mt-2 text-[0.85em] text-ink-3">
                  {poet.dynasty} · {poet.name}
                  {poet.courtesy ? ` 字${poet.courtesy}` : ''}
                  {poet.pseudonym ? ` 号${poet.pseudonym}` : ''}
                </p>
                {node ? (
                  <p className="mt-1 text-[0.75em] text-ink-4">
                    {work.yearLabel ?? formatEra(work.year)}（{work.year}）· 于
                    {node.place}（今{node.modernPlace}）· 年 {ageAt(work.year, poet.birthYear)} 岁
                    {work.fullText ? null : ' · 长篇仅节选'}
                  </p>
                ) : null}
              </header>

              <div className="mt-4 whitespace-pre-line font-kai text-ink-2">{body}</div>

              {work.tags && work.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-1.5 text-[0.75em]">
                  {work.tags.map((t) => (
                    <span key={t} className="rounded-sm bg-paper-3 px-1.5 py-0.5 text-ink-3">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-5 text-[0.8em] leading-relaxed text-ink-4">
                【创作背景】{work.background}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
