import React, { useEffect, useMemo, useState } from 'react';
import { useApp, useAppDispatch, useAppState } from '../store/PoetContext';
import { EVENT_LABEL, type LifeNode, type Work } from '../types';
import { ageAt, formatEra } from '../utils/format';
import { useSpeechState } from '../hooks/useSpeech';

interface Row {
  work: Work;
  node: LifeNode;
}

/** 作品总览（作品墙）：按时间倒序列出全部作品，点击可反向定位回地图节点（迭代 1 · B.1） */
export default function WorksGallery(): JSX.Element {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { primaryPoet } = useApp();
  // 迭代 12：作品朗读（与地图浮层、时间轴「朗读生平」共用同一个语音单例）
  // 迭代 14：新增 TTS 引擎 / 音色 切换（Edge 拟人化 ↔ 系统机械音）
  const {
    speak, cancelSpeech, speakingId,
    engine, setEngine, cycleVoice, voiceLabel,
  } = useSpeechState();

  // 迭代 4 · 检索筛选：关键词（标题/正文/背景/地点）+ 体裁下拉
  const [keyword, setKeyword] = useState('');
  const [genre, setGenre] = useState<string>('');

  const allRows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const node of primaryPoet.nodes) {
      for (const work of node.works) out.push({ work, node });
    }
    return out.sort((a, b) => b.work.year - a.work.year);
  }, [primaryPoet]);

  /** 该诗人出现过的体裁（用于下拉选项，按出现频次降序） */
  const genres = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of allRows) count.set(r.work.genre, (count.get(r.work.genre) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [allRows]);

  const rows = useMemo<Row[]>(() => {
    const kw = keyword.trim();
    if (!kw && !genre) return allRows;
    return allRows.filter(({ work, node }) => {
      if (genre && work.genre !== genre) return false;
      if (!kw) return true;
      const hay = `${work.title}${work.excerpt}${work.fullText ?? ''}${work.background}${work.tags?.join('') ?? ''}${node.place}${node.modernPlace}`;
      return hay.includes(kw);
    });
  }, [allRows, keyword, genre]);

  // 切换诗人时清空筛选条件，避免看到「0 篇」误以为数据缺失
  useEffect(() => {
    setKeyword('');
    setGenre('');
  }, [primaryPoet.id]);

  /**
   * 反向定位（迭代 1 · B.1）：
   * 点击作品条目 → SET_NODE 跳该作品所属节点 + 地图平滑飞行（MapCanvas.flyTo），
   * 同时把该作品并入展开列表（ENSURE_WORK_EXPANDED），右面板/本页即见全文。
   */
  const locate = (row: Row): void => {
    dispatch({ type: 'SET_NODE', poetId: primaryPoet.id, nodeId: row.node.id, year: row.node.year });
    dispatch({ type: 'ENSURE_WORK_EXPANDED', workId: row.work.id });
    dispatch({ type: 'SET_VIEW', view: 'map' });
  };

  return (
    <div className="panel-fade flex h-full min-h-0 flex-col">
      <div className="border-b border-ink-4/30 px-4 py-3">
        <h2 className="section-title text-[17px] text-ink">
          {primaryPoet.name} · 作品总览
          <span className="ml-2 text-[12px] text-ink-4">
            {rows.length === allRows.length ? `共 ${allRows.length} 篇` : `筛出 ${rows.length} / ${allRows.length} 篇`}
            （按创作时间倒序）
          </span>
        </h2>

        {/* 迭代 4 · 检索筛选 */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="检索标题 / 正文 / 地点"
            className="h-7 w-44 rounded-sm border border-ink-4/45 bg-paper px-2 text-[12px] text-ink placeholder:text-ink-4 focus:border-cinnabar focus:outline-none"
          />
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="h-7 rounded-sm border border-ink-4/45 bg-paper px-1.5 text-[12px] text-ink focus:border-cinnabar focus:outline-none"
          >
            <option value="">全部体裁</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {keyword || genre ? (
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setGenre('');
              }}
              className="h-7 rounded-sm border border-ink-4/45 px-2 text-[11.5px] text-ink-2 transition hover:bg-paper-3"
            >
              清除筛选
            </button>
          ) : null}
        </div>

        <p className="mt-1 text-[11.5px] text-ink-3">点击任意条目，可回到地图定位到该作品的创作地点。</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-ink-4">
            {allRows.length === 0 ? '暂无作品数据' : '没有符合条件的作品，试试清除筛选'}
          </p>
        ) : (
          <ol className="space-y-2">
            {rows.map((row) => {
              const expanded = state.expandedWorkIds.includes(row.work.id);
              // 迭代 1 · B.2：播放到该作品所属节点时会自动展开（expanded 即亮），
              // 这里再高亮「当前正在这一地创作」的作品
              const isCurrentNode = state.lockedNodeByPoet[primaryPoet.id] === row.node.id;
              return (
                <li key={row.work.id}>
                  {/* 注意：<button> 只允许 phrasing content，卡片内包含标题、正文与独立交互控件，
                      因此外层改用 div[role=button] + tabIndex + onKeyDown，内层保持纯展示元素。 */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`定位到《${row.work.title}》的创作地 ${row.node.place}`}
                    onClick={() => locate(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        locate(row);
                      }
                    }}
                    className={`w-full cursor-pointer rounded-sm border p-3 text-left transition hover:bg-paper ${
                      isCurrentNode
                        ? 'border-cinnabar/70 bg-paper-2/70'
                        : 'border-ink-4/40 bg-paper hover:border-cinnabar/70'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[17px] text-ink">
                        {row.work.title}
                        {/* 迭代 1 · B.2：当前正在这一地创作时，标朱砂「在作」 */}
                        {isCurrentNode ? (
                          <span className="ml-2 rounded-sm bg-cinnabar/10 px-1.5 py-0.5 text-[11px] text-cinnabar">
                            正在此地创作
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-4">
                        {row.work.genre} · {row.work.year}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
                      <span>{row.work.yearLabel ?? formatEra(row.work.year)}</span>
                      <span>·</span>
                      <span>
                        {row.node.place}（今{row.node.modernPlace}）
                      </span>
                      <span>·</span>
                      <span>{EVENT_LABEL[row.node.eventType]}</span>
                      <span>·</span>
                      <span>年 {ageAt(row.work.year, primaryPoet.birthYear)}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line font-kai text-[15.5px] leading-[1.9] text-ink-2">
                      {expanded && row.work.fullText ? row.work.fullText : row.work.excerpt}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'TOGGLE_WORK', workId: row.work.id });
                        }}
                        className="rounded-sm border border-cinnabar/45 px-1.5 py-0.5 text-cinnabar transition hover:bg-cinnabar hover:text-paper"
                      >
                        {expanded ? '收起' : '展开全文'}
                      </button>
                      {/* 迭代 12：朗读此篇作品（再次点击即停止）。
                          迭代 14：朗读按钮旁新增「换音色 / 引擎」两个小按钮。
                          需 stopPropagation，否则会触发外层卡片的「回到地图」定位。 */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (speakingId === row.work.id) cancelSpeech();
                          else speak(`《${row.work.title}》。${row.work.fullText ?? row.work.excerpt}`, row.work.id);
                        }}
                        className={`rounded-sm border px-1.5 py-0.5 transition ${
                          speakingId === row.work.id
                            ? 'border-cinnabar bg-cinnabar text-paper'
                            : 'border-cinnabar/45 text-cinnabar hover:bg-cinnabar hover:text-paper'
                        }`}
                        title={
                          speakingId === row.work.id
                            ? '停止朗读'
                            : engine === 'edge'
                              ? `朗读此篇作品（${voiceLabel}）`
                              : '朗读此篇作品（系统声音）'
                        }
                      >
                        {speakingId === row.work.id ? '🔊 朗读中' : '🔊 朗读'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cycleVoice();
                        }}
                        className="rounded-sm border border-cinnabar/25 px-1.5 py-0.5 text-cinnabar/70 hover:bg-cinnabar/10 hover:text-cinnabar transition"
                        title={`换音色（当前：${voiceLabel}）`}
                      >
                        🔈 换音
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEngine(engine === 'edge' ? 'system' : 'edge');
                        }}
                        className="rounded-sm border border-cinnabar/25 px-1.5 py-0.5 text-cinnabar/70 hover:bg-cinnabar/10 hover:text-cinnabar transition"
                        title={engine === 'edge' ? 'Edge 拟人化 → 系统机械音' : '系统机械音 → Edge 拟人化'}
                      >
                        {engine === 'edge' ? '拟人音' : '系统音'}
                      </button>
                      <span className="ml-auto text-ink-4">点击卡片回到地图</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
