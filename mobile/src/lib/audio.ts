import { Platform } from 'react-native';
import { RecordingPresets, type RecordingOptions } from 'expo-audio';

/** Речь: моно, 64 кбит/с — час записи ≈ 30 МБ. В браузере — webm той же плотности. */
export const VOICE_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

export const VOICE_MIME = Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4';
/** «1:05», для длинных записей — «1:02:05» */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
