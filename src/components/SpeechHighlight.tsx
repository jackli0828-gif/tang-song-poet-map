import React, { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeBoundaries, type SpeechBoundaryEvent } from '../utils/speech';

/**
 * 逐句高亮文本组件
 * ------------------------------------------------------------------
 * 把一段展示文本渲染出来，并在「同一 id 正在朗读」时，依据语音引擎回传的
 * 词 / 句边界实时高亮：当前句淡朱砂底，当前词深朱砂反白。
 *
 * - Edge 引擎：拿到的是「逐字朗读的原文片段」，需与展示文本做顺序对齐
 *   （贪心 indexOf，容错标点 / 个别字符归一化差异）。
 * - 系统引擎：直接给出字符起止下标，无需对齐。
 * 两种引擎的高亮均不依赖主题色，深色模式切换不受影响。
 */

interface ActiveRange {
  /** 当前句在「句首下标」映射中的起点（sentenceMap 值） */
  sentenceStart: number;
  /** 当前词在展示文本中的 [起, 止) 区间（UTF-16 下标） */
  word: [number, number] | null;
}

/** 计算每个字符所属的「句首下标」；按 。！？\n 以及 .!? 断句 */
function buildSentenceMap(text: string): number[] {
  const map = new Array<number>(text.length).fill(-1);
  const delim = /[。！？\n.!?…；;]/;
  let cur = -1;
  for (let i = 0; i < text.length; i++) {
    if (cur === -1) cur = i;
    map[i] = cur;
    if (delim.test(text[i])) cur = -1; // 下一个字符另起一句
  }
  return map;
}

/** 把朗读得到的词片段对齐到展示文本：从 cursor 起就近匹配，容错 */
function alignWord(text: string, word: string, cursor: number): [number, number] {
  if (!word) return [-1, -1];
  const i = text.indexOf(word, cursor);
  if (i >= 0) return [i, i + word.length];
  // 整词未命中（标点被吞 / 个别字归一化）：退而求其次，锚定首字
  const j = text.indexOf(word[0], cursor);
  if (j >= 0) return [j, j + 1];
  return [-1, -1];
}

export interface SpeechHighlightProps {
  /** 朗读 id（与 speak(text, id) 一致） */
  id: string;
  /** 展示文本（即被朗读的同一段文本） */
  text: string;
  /** 容器 className（字体 / 字号 / 行高 / 最大高度等由此传入） */
  className?: string;
}

export default function SpeechHighlight({ id, text, className }: SpeechHighlightProps): JSX.Element {
  const sentenceMap = useMemo(() => buildSentenceMap(text), [text]);
  const cursorRef = useRef(0);
  const [active, setActive] = useState<ActiveRange | null>(null);

  // 切换目标 / 文本时复位
  useEffect(() => {
    cursorRef.current = 0;
    setActive(null);
  }, [id, text]);

  useEffect(() => {
    const unsub = subscribeBoundaries((ev: SpeechBoundaryEvent) => {
      if (ev.id !== id) return;
      if (ev.type === 'start') {
        cursorRef.current = 0;
        setActive(null);
        return;
      }
      if (ev.type === 'end') {
        setActive(null);
        return;
      }
      // boundary
      if (ev.kind === 'edge') {
        const word = ev.text ?? '';
        // 标点 / 空白单独成边界时不参与高亮（也不推进游标，避免错位）
        if (word && /^[\s\p{P}\p{S}]+$/u.test(word)) return;
        const [s, e] = alignWord(text, word, cursorRef.current);
        if (s >= 0) {
          cursorRef.current = e;
          const sentenceStart = sentenceMap[s] ?? s;
          setActive({ sentenceStart, word: [s, e] });
        }
      } else {
        const cs = ev.charStart ?? 0;
        const cl = ev.charLen ?? 0;
        if (cl > 0 && cs < text.length) {
          const sentenceStart = sentenceMap[cs] ?? cs;
          setActive({ sentenceStart, word: [cs, cs + cl] });
        }
      }
    });
    return unsub;
  }, [id, text, sentenceMap]);

  // 将文本按「当前句 / 当前词」分组为 span，保留换行
  const spans = useMemo(() => {
    const out: { text: string; sentence: boolean; word: boolean }[] = [];
    const push = (ch: string, sentence: boolean, word: boolean): void => {
      const last = out[out.length - 1];
      if (last && last.sentence === sentence && last.word === word) last.text += ch;
      else out.push({ text: ch, sentence, word });
    };
    const sentenceStart = active?.sentenceStart ?? -1;
    const word = active?.word ?? null;
    for (let i = 0; i < text.length; i++) {
      const sentence = sentenceStart >= 0 && sentenceMap[i] === sentenceStart;
      const w = word !== null && i >= word[0] && i < word[1];
      push(text[i], sentence, w);
    }
    return out;
  }, [text, sentenceMap, active]);

  return (
    <div className={className} style={{ whiteSpace: 'pre-line' }}>
      {spans.map((sp, i) => {
        if (sp.word) {
          return (
            <span
              key={i}
              style={{
                background: '#A83232',
                color: '#F5EFE1',
                padding: '0 1px',
                borderRadius: 2,
              }}
            >
              {sp.text}
            </span>
          );
        }
        if (sp.sentence) {
          return (
            <span key={i} style={{ background: 'rgba(168,50,50,0.13)', borderRadius: 2 }}>
              {sp.text}
            </span>
          );
        }
        return <span key={i}>{sp.text}</span>;
      })}
    </div>
  );
}
