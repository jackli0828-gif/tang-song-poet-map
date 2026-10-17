import { useSyncExternalStore } from 'react';
import {
  cancelSpeech,
  speak,
  speechSupported,
  speakingId,
  subscribeSpeech,
} from '../utils/speech';

/**
 * 朗读状态钩子：订阅 speech 单例，返回当前正在朗读的 id 与稳定方法。
 * speakingId 为 null 表示当前无朗读；为某条目标 id（如 'brief' 或作品 id）时，
 * 对应按钮可据此显示「朗读中」。
 */
export function useSpeechState(): {
  speakingId: string | null;
  speak: typeof speak;
  cancelSpeech: typeof cancelSpeech;
  supported: boolean;
} {
  const id = useSyncExternalStore(subscribeSpeech, speakingId, () => null);
  return {
    speakingId: id,
    speak,
    cancelSpeech,
    supported: speechSupported(),
  };
}
