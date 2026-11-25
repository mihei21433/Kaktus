import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MAX_VOICE_SEC, mmss, VOICE_PRESET } from '@/lib/audio';
import { Small } from '@/ui';
import { colors } from '@/theme';

/** Большая кнопка записи: нажали — пишем, нажали ещё раз — готово. Через 2 минуты останавливается сама. */
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
      // Возвращаем звук в динамик для прослушивания
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri) onRecorded(recorder.uri, Math.min(sec, MAX_VOICE_SEC));
    } finally {
      stopping.current = false;
    }
  };

  useEffect(() => {
    if (state.isRecording && state.durationMillis >= MAX_VOICE_SEC * 1000) void stop();
    // stop зависит только от текущего состояния записи
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRecording, state.durationMillis]);

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
        {recording ? `${mmss(state.durationMillis / 1000)} / ${mmss(MAX_VOICE_SEC)}` : 'Нажмите и говорите'}
      </Text>
      <Small style={{ fontSize: 12 }}>{recording ? 'Нажмите ещё раз, чтобы закончить' : 'До 2 минут'}</Small>
      {denied ? (
        <Text style={{ color: colors.red, fontSize: 13, textAlign: 'center' }}>
          Нет доступа к микрофону. Разрешите его для «Кактуса» в настройках телефона или напишите заявление текстом.
        </Text>
      ) : null}
    </View>
  );
}
