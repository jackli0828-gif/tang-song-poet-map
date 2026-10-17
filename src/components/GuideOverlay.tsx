import React, { useEffect } from 'react';

export type GuideMode = 'intro' | 'help' | null;

const ONBOARD_KEY = 'poetmap.onboarded.v1';

/** 是否已看过首屏引导（首访自动弹出一次） */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARD_KEY) === '1';
  } catch {
    // 隐私模式 / file:// 下 localStorage 可能不可用，退化成「每次都引导」，不影响主流程
    return false;
  }
}

function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARD_KEY, '1');
  } catch {
    /* 忽略：写入失败只是下次还会再弹，不影响功能 */
  }
}

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: '一',
    title: '选一位诗人',
    body: '左侧名录点选（或用顶栏检索直接搜姓名、作品、地名）。地图会立刻画出他一生的行迹。',
  },
  {
    n: '二',
    title: '让他走完一生',
    body: '底部时间轴点「播放」，轨迹会随年份生长；也可用空格键播放/暂停，← → 逐站跳转。',
  },
  {
    n: '三',
    title: '点开地点看作品',
    body: '点地图上的圆点，即弹出「此地此时」写下的作品全文——人、时间、地点、作品就此对上。',
  },
];

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ['空格'], desc: '播放 / 暂停（输入框内不拦截）' },
  { keys: ['←', '→'], desc: '上一站 / 下一站' },
  { keys: ['Home'], desc: '回到出生年' },
  { keys: ['?'], desc: '打开本速查表' },
  { keys: ['Esc'], desc: '关闭浮层与面板' },
  { keys: ['双击地图'], desc: '复位视野' },
  { keys: ['滚轮'], desc: '以光标为中心缩放' },
  { keys: ['Tab', 'Enter'], desc: '聚焦地图节点并定位' },
];

/**
 * 迭代 9 · 轮次 3：首屏引导 + 快捷键速查
 * 同一套遮罩，两种模式：
 *  - intro：首访三步引导（看完写入 localStorage，不再自动弹出）
 *  - help：随时可按「?」或顶栏按钮唤出的速查表，内含「重新观看引导」
 */
export default function GuideOverlay({
  mode,
  onClose,
  onSwitchMode,
}: {
  mode: GuideMode;
  onClose: () => void;
  onSwitchMode: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onClose]);

  if (!mode) return null;

  const closeIntro = (): void => {
    if (mode === 'intro') markOnboarded();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'intro' ? '使用引导' : '快捷键速查'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeIntro();
      }}
    >
      <div className="max-h-[86vh] w-[600px] overflow-y-auto rounded-sm border border-ink-3/50 bg-paper shadow-popup">
        {/* 头部 */}
        <div className="flex items-start gap-3 border-b border-ink-4/30 px-5 py-4">
          <span className="seal-square text-[12px] leading-tight">
            诗
            <br />
            旅
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="section-title text-[20px] text-ink">
              {mode === 'intro' ? '三步看懂这张图' : '操作速查'}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {mode === 'intro'
                ? '人 · 时间 · 地点 · 作品 —— 一一对应'
                : '键盘与鼠标操作一览；按 Esc 或点击空白处关闭'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeIntro}
            aria-label="关闭"
            className="shrink-0 rounded-sm border border-ink-4/45 px-2 py-0.5 text-[13px] text-ink-3 transition hover:bg-paper-3"
          >
            ✕
          </button>
        </div>

        {mode === 'intro' ? (
          <div className="px-5 py-4">
            <ol className="space-y-3">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cinnabar text-[13px] text-paper">
                    {s.n}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[16px] text-ink">{s.title}</div>
                    <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-2">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-sm border border-ink-4/35 bg-paper-2/60 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
              <span className="mr-1.5 text-cinnabar">提示</span>
              圆点越大＝在此地留下的作品越多；带<span className="text-cinnabar">朱砂双环</span>
              的是创作重镇（≥3 篇）。把鼠标停在圆点或地名上可看详情。
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={closeIntro}
                className="rounded-sm bg-cinnabar px-4 py-1.5 text-[14px] text-paper transition hover:opacity-90"
              >
                开始探索
              </button>
              <button
                type="button"
                onClick={() => onSwitchMode()}
                className="rounded-sm border border-ink-4/45 px-3 py-1.5 text-[13px] text-ink-2 transition hover:bg-paper-3"
              >
                查看全部快捷键
              </button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4">
            <table className="w-full border-collapse text-[13.5px]">
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={s.desc} className="border-b border-ink-4/25 last:border-b-0">
                    <td className="w-[150px] py-1.5 align-top">
                      <span className="flex flex-wrap gap-1">
                        {s.keys.map((k) => (
                          <kbd
                            key={k}
                            className="rounded-sm border border-ink-4/45 bg-paper-2 px-1.5 py-0.5 text-[12.5px] text-ink-2"
                          >
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </td>
                    <td className="py-1.5 text-ink-2">{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 rounded-sm border border-ink-4/35 bg-paper-2/60 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
              <div className="mb-1 text-cinnabar">图层开关</div>
              底部时间轴可切换「跟随播放」「交游连线」；顶栏可切换唐 / 宋底图与右栏视图
              （行迹·作品 / 作品总览 / 对照时间线）。
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSwitchMode()}
                className="rounded-sm border border-cinnabar/50 px-3 py-1.5 text-[13px] text-cinnabar transition hover:bg-cinnabar hover:text-paper"
              >
                重新观看引导
              </button>
              <button
                type="button"
                onClick={closeIntro}
                className="rounded-sm border border-ink-4/45 px-3 py-1.5 text-[13px] text-ink-2 transition hover:bg-paper-3"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
