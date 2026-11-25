import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { mmss, VOICE_PRESET } from '@/lib/audio';
import { Small } from '@/ui';
import { colors } from '@/theme';

/**
 * Большая кнопка записи: нажали — пишем, нажали ещё раз — готово. Длительность не ограничена.
 * Пока идёт запись, экран не гаснет: блокировка телефона прервала бы запись.
 */
const KEEP_AWAKE_TAG = 'voice-recording';

export function VoiceRecorder({ onRecorded }: { onRecorded: (uri: string, durationSec: number) => void }) {
  const recorder = useAudioRecorder(VOICE_PRESET);
  const state = useAudioRecorderState(recorder, 250);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const stopping = useRef(false);

  const start = async () => {
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setDenied(true);
        return;
      }
      setDenied(false);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const sec = Math.max(1, Math.round(state.durationMillis / 1000));
    try {
      await recorder.stop();
      await deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      // Возвращаем звук в динамик для прослушивания
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri) onRecorded(recorder.uri, sec);
    } finally {
      stopping.current = false;
    }
  };

  // Ушли с экрана посреди записи — отпускаем экран
  useEffect(() => () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {}), []);

  const recording = state.isRecording;
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 12 }}>
      <Pressable
        onPress={recording ? stop : start}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Остановить запись' : 'Начать запись'}
        style={({ pressed }) => ({
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: recording ? colors.red : colors.green,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || busy ? 0.75 : 1,
        })}>
        <View
          style={{
            width: recording ? 28 : 16,
            height: recording ? 28 : 16,
            borderRadius: recording ? 6 : 8,
            backgroundColor: colors.greenText,
          }}
        />
      </Pressable>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
        {recording ? mmss(state.durationMillis / 1000) : 'Нажмите и говорите'}
      </Text>
      <Small style={{ fontSize: 12 }}>{recording ? 'Нажмите ещё раз, чтобы закончить' : 'Говорите сколько нужно'}</Small>
      {denied ? (
        <Text style={{ color: colors.red, fontSize: 13, textAlign: 'center' }}>
          Нет доступа к микрофону. Разрешите его для «Кактуса» в настройках телефона или напишите заявление текстом.
        </Text>
      ) : null}
    </View>
  );
}
