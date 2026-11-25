import { useState } from 'react';
import { Text, View } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { api, ApiError } from '@/data/api';
import { Broadcast, Overview, timeAgo, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { plural } from '@/lib/date';
import { Button, Caption, Card, Chip, Field, Header, Screen, Small, ui } from '@/ui';
import { colors, font } from '@/theme';

export default function BroadcastsScreen() {
  const { showError } = useApp();
  const overview = useQuery<Overview>('/v1/mod/overview');
  const [streamId, setStreamId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const history = useQuery<Broadcast[]>(streamId ? `/v1/mod/streams/${streamId}/broadcasts` : null);

  const streams = overview.data?.streams ?? [];
  const stream = streams.find((s) => s.id === streamId);

  const send = async () => {
    if (!stream) return;
    setBusy(true);
    try {
      const r = await api<{ recipients: number }>('POST', `/v1/mod/streams/${stream.id}/broadcasts`, { text: text.trim() });
      setText('');
      setSent(`Отправлено: ${r.recipients} ${plural(r.recipients, ['участник', 'участника', 'участников'])}`);
      await history.reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen inTabs header={<Header title="Рассылка" />}>
      <Caption>Кому</Caption>
      {!overview.data ? <LoadState loading={overview.loading} error={overview.error} onRetry={overview.reload} /> : null}
      {overview.data && !streams.length ? <Small>Сначала создайте поток</Small> : null}
      <View style={ui.wrap}>
        {streams.map((s) => (
          <Chip
            key={s.id}
            label={`${s.name} · ${s.members}`}
            color={colors.blue}
            selected={streamId === s.id}
            onPress={() => {
              setStreamId(s.id);
              setSent(null);
            }}
          />
        ))}
      </View>
      <Field
        label="Сообщение"
        value={text}
        onChangeText={(v) => {
          setText(v);
          setSent(null);
        }}
        multiline
        maxLength={1000}
        counter
        placeholder="Например: в субботу общая пробежка в парке в 9:00"
        focusColor={colors.blue}
      />
      <Caption>Предпросмотр уведомления</Caption>
      <Card style={{ gap: 4 }}>
        <Text style={[font.title, { fontSize: 14 }]}>{stream?.name ?? 'Поток'}</Text>
        <Text style={{ color: text ? colors.text : colors.textMuted, fontSize: 14 }}>{text || 'Сообщение пока пустое — набранное появится здесь'}</Text>
      </Card>
      <Small style={{ fontSize: 12 }}>
        Придёт каждому участнику потока пуш-уведомлением. Уведомления проходят через внешние сервисы Expo, Google и Apple — не
        пишите в рассылках личные и медицинские данные.
      </Small>
      {sent ? <Text style={{ color: colors.green, fontSize: 14 }}>{sent}</Text> : null}
      <Button
        title={stream ? `Отправить ${stream.members} ${plural(stream.members, ['участнику', 'участникам', 'участникам'])}` : 'Выберите, кому отправить'}
        variant="blue"
        disabled={!stream || !text.trim() || busy || !stream.members}
        onPress={send}
      />
      {stream ? (
        <>
          <Caption style={{ marginTop: 8 }}>Рассылки потока {stream.name}</Caption>
          {history.data?.length === 0 ? <Small>В этот поток рассылок ещё не приходило</Small> : null}
          {history.data?.map((b) => (
            <Card key={b.id} style={{ gap: 4 }}>
              <Text style={{ color: colors.text, fontSize: 14 }}>{b.text}</Text>
              <Small style={{ fontSize: 11 }}>
                {timeAgo(b.createdAt)} · {b.recipients} {plural(b.recipients, ['получатель', 'получателя', 'получателей'])}
              </Small>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
