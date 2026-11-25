import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { VoicePlayer } from '@/components/voice-player';
import { VoiceRecorder } from '@/components/voice-recorder';
import { useApp } from '@/data/store';
import { mmss, VOICE_MIME } from '@/lib/audio';
import { formatTime, todayKey } from '@/lib/date';
import { Button, Card, Field, Header, Screen, Segmented, Small } from '@/ui';
import { colors, font } from '@/theme';

type Mode = 'voice' | 'text';

export default function StatementScreen() {
  const { state, actions } = useApp();
  const today = todayKey();
  const sent = state.statements[today];
  const [mode, setMode] = useState<Mode>('voice');
  const [text, setText] = useState('');
  const [take, setTake] = useState<{ uri: string; sec: number } | null>(null);
  const [sending, setSending] = useState(false);

  const sendVoice = async () => {
    if (!take) return;
    setSending(true);
    const ok = await actions.sendVoice(take.uri, take.sec, VOICE_MIME);
    setSending(false);
    if (ok) setTake(null);
  };

  return (
    <Screen header={<Header title="Утреннее заявление" onBack={() => router.back()} />}>
      <Small>Проговорите настрой и планы на день. Формат и длительность задаёт модератор.</Small>
      <Small style={{ fontSize: 12 }}>Голосом или текстом · Ежедневно, в любое время</Small>

      {sent ? (
        <Card style={{ gap: 10 }}>
          <Text style={font.title}>Заявление отправлено</Text>
          <Small style={{ fontSize: 12 }}>
            {sent.kind === 'voice' ? `голосом · ${mmss(sent.durationSec ?? 0)}` : 'текстом'} · в {formatTime(sent.sentAt)}
          </Small>
          {sent.kind === 'voice' ? (
            <VoicePlayer
              linkPath={sent.localUri ? undefined : `/v1/me/statements/${today}/audio-link`}
              localUri={sent.localUri}
              durationSec={sent.durationSec}
            />
          ) : (
            <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{sent.text}</Text>
          )}
          <Button
            title="Переписать"
            variant="secondary"
            onPress={() => {
              if (sent.kind === 'text') {
                setText(sent.text);
                setMode('text');
              }
              actions.clearStatement();
            }}
          />
        </Card>
      ) : (
        <>
          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setTake(null);
            }}
            options={[
              { value: 'voice', label: 'Голосом' },
              { value: 'text', label: 'Текстом' },
            ]}
          />
          {mode === 'voice' ? (
            take ? (
              <Card style={{ gap: 12 }}>
                <Text style={font.title}>Запись готова · {mmss(take.sec)}</Text>
                <VoicePlayer localUri={take.uri} durationSec={take.sec} />
                <Button title={sending ? 'Отправляем…' : 'Отправить заявление'} disabled={sending} onPress={sendVoice} />
                {sending && take.sec > 300 ? <Small style={{ fontSize: 12, textAlign: 'center' }}>Длинная запись — отправка может занять минуту-другую. Не закрывайте экран.</Small> : null}
                <Button title="Записать заново" variant="secondary" disabled={sending} onPress={() => setTake(null)} />
              </Card>
            ) : (
              <VoiceRecorder onRecorded={(uri, sec) => setTake({ uri, sec })} />
            )
          ) : (
            <>
              <Field
                value={text}
                onChangeText={setText}
                multiline
                autoFocus
                placeholder="Например: сегодня я спокойна и собрана. Пробегаю 3 км, пью воду и ложусь до 23:00."
              />
              <Button
                title="Отправить заявление"
                disabled={!text.trim()}
                onPress={() => {
                  actions.sendStatement(text.trim());
                  setText('');
                }}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
