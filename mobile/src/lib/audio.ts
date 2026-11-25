import { Platform } from 'react-native';
import { RecordingPresets, type RecordingOptions } from 'expo-audio';

/** Речь: моно, 64 кбит/с AAC — 2 минуты ≈ 1 МБ. В браузере — webm. */
export const VOICE_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
};

export const VOICE_MIME = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
export const MAX_VOICE_SEC = 120;

/** «1:05» */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
