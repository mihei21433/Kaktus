import { Platform } from 'react-native';
import { RecordingPresets, type RecordingOptions } from 'expo-audio';

/** Браузер: Chrome пишет webm, Safari на iPhone — только mp4 (AAC). */
const WEB_MIME =
  typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && !MediaRecorder.isTypeSupported('audio/webm')
    ? 'audio/mp4'
    : 'audio/webm';

/** Речь: моно, 64 кбит/с — час записи ≈ 30 МБ. В браузере — той же плотности. */
export const VOICE_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  web: { mimeType: WEB_MIME, bitsPerSecond: 64000 },
};

export const VOICE_MIME = Platform.OS === 'web' ? WEB_MIME : 'audio/mp4';
/** «1:05», для длинных записей — «1:02:05» */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
