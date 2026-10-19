import { useSyncExternalStore } from 'react';
import {
  cancelSpeech,
  speak,
  speakingId,
  subscribeSpeech,
  getTTSEngine,
  setTTSEngine,
  getTTSVoice,
  setTTSVoice,
  cycleTTSVoice,
  voiceLabel,
  TTS_VOICES,
  type TTSEngine,
} from '../utils/speech';

/**
 * 朗读状态钩子：订阅 speech 单例，返回当前正在朗读的 id 与稳定方法。
 * speakingId 为 null 表示当前无朗读；为某条目标 id（如 'brief' 或作品 id）时，
 * 对应按钮可据此显示「朗读中」。
 *
 * 迭代 14（新增）：TTS 引擎 / 音色切换。
 * - getTTSEngine / setTTSEngine：'edge'（拟人化，默认） | 'system'（机械音）
 * - getTTSVoice / cycleTTSVoice：在 5 个 Edge 中文音色间轮换
 * - TTS_VOICES：当前可用音色清单
 */
export function useSpeechState(): {
  speakingId: string | null;
  speak: typeof speak;
  cancelSpeech: typeof cancelSpeech;
  engine: TTSEngine;
  setEngine: typeof setTTSEngine;
  voice: string;
  cycleVoice: () => string;
  voiceLabel: string;
  voices: typeof TTS_VOICES;
} {
  const id = useSyncExternalStore(subscribeSpeech, speakingId, () => null);
  const engine = useSyncExternalStore(subscribeSpeech, getTTSEngine, () => 'edge' as TTSEngine);
  const voice = useSyncExternalStore(subscribeSpeech, getTTSVoice, () => '');
  return {
    speakingId: id,
    speak,
    cancelSpeech,
    engine,
    setEngine: setTTSEngine,
    voice,
    cycleVoice: cycleTTSVoice,
    voiceLabel: voiceLabel(voice),
    voices: TTS_VOICES,
  };
}
