import React, { useEffect, useState, type ReactNode } from 'react';
import { META_STATS, ensurePoetsLoaded } from '../data/poetStore';
import { usePoetsReady } from '../hooks/usePoetData';

/**
 * 迭代 19 · 首屏闸门
 * ==================================================================
 * 诗人详情（年谱节点 / 作品全文 / 小传）占产物八成以上，已改为独立分块
 * 异步加载（见 data/poetStore.ts）。依赖年谱的组件 —— 地图轨迹、时间轴、
 * 作品面板、对照视图 —— 都必须等它到位才能渲染，否则读到的是空数组。
 *
 * 这里用一道闸门把「等数据」集中到一处：数据未就绪时显示载入页，
 * 就绪后一次性挂载真正的应用。好处是**所有下游组件都不必处理 null**，
 * 也就不会出现「半载入状态下的空指针白屏」。
 *
 * 载入页刻意用真实的收录数字（来自名录索引，首屏即可取），
 * 而不是「加载中…」这种没有任何信息量的占位。
 */
export default function BootGate({ children }: { children: ReactNode }): JSX.Element {
  const ready = usePoetsReady();
  const [failed, setFailed] = useState(false);
  // 每次重试 +1，触发下面的 effect 重新发起加载
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (ready) return undefined;
    let cancelled = false;
    setFailed(false);
    ensurePoetsLoaded().catch((err) => {
      console.error('[poets] 诗人详情载入失败', err);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, attempt]);

  if (ready) return <>{children}</>;

  return (
    <div className="paper-bg flex h-full flex-col items-center justify-center gap-6 px-6 text-ink">
      <div className="flex items-center gap-3">
        <span className="seal text-[12px] leading-tight">
          诗
          <br />
          旅
        </span>
        <div className="leading-tight">
          <h1 className="text-[20px] tracking-[0.14em] text-ink">唐宋词人时空轨迹图</h1>
          <p className="mt-0.5 text-[11.5px] text-ink-3">人 · 时间 · 地点 · 作品 —— 一一对应</p>
        </div>
      </div>

      {failed ? (
        <div role="alert" className="flex flex-col items-center gap-3">
          <p className="text-[12.5px] text-ink-2">
            年谱数据未能载入。可能是网络中断，或页面版本已更新（旧分块失效）。
          </p>
          <button
            type="button"
            onClick={() => setAttempt((a) => a + 1)}
            className="rounded-sm border border-cinnabar/60 px-3 py-1 text-[12.5px] text-cinnabar transition hover:bg-cinnabar/10"
          >
            重新载入
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[11.5px] text-ink-4 underline underline-offset-2 hover:text-ink-2"
          >
            或刷新整个页面
          </button>
        </div>
      ) : (
        <div className="flex w-[260px] flex-col items-center gap-3">
          {/* 进度不可测（单个分块的下载进度拿不到），所以用不定长扫光条，不谎报百分比 */}
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-ink-4/20">
            <div className="boot-bar h-full w-full rounded-full" />
          </div>
          <p className="text-[11.5px] tracking-[0.08em] text-ink-3">
            正在载入 {META_STATS.poets} 位诗人词人的年谱…
          </p>
          <p className="text-[11px] text-ink-4">
            唐 {META_STATS.tang} 家 · 宋 {META_STATS.song} 家 · {META_STATS.nodes} 个时空节点
          </p>
        </div>
      )}
    </div>
  );
}
