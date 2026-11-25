import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, LoadState } from '@/components/mod-ui';
import { api, ApiError, uuid } from '@/data/api';
import { Dossier, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { addDays, todayKey } from '@/lib/date';
import { Button, Caption, Card, Chip, Field, Header, Screen, Small, Toggle, ui } from '@/ui';
import { colors, font } from '@/theme';

export default function AssignTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Dossier>(`/v1/mod/members/${id}`);
  const [text, setText] = useState('');
  const [goalId, setGoalId] = useState<string | null>(null);
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');
  const [notify, setNotify] = useState(true);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('POST', `/v1/mod/members/${id}/tasks`, {
        id: uuid(),
        goalId,
        text: text.trim(),
        // Дата по времени телефона модератора; сервер проверит, что она не в прошлом для потока
        date: when === 'today' ? todayKey() : addDays(todayKey(), 1),
        comment: comment.trim() || undefined,
        notify,
      });
      router.back();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось поставить задачу');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Header title="Задача участнику" backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        <>
          {!goalId ? <Small style={{ fontSize: 12, textAlign: 'center' }}>Выберите цель — задача не существует без цели</Small> : null}
          <Button title={busy ? 'Ставим…' : 'Поставить задачу'} variant="blue" disabled={!goalId || !text.trim() || busy} onPress={submit} />
        </>
      }>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Card style={[ui.row, { gap: 10 }]}>
            <Avatar name={data.member.name} />
            <View>
              <Text style={font.title}>{data.member.name}</Text>
              <Small style={{ fontSize: 12 }}>{data.stream.name}</Small>
            </View>
          </Card>
          <Field
            label="Текст задачи"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={300}
            placeholder="Например: сдать анализ на витамин D повторно"
            focusColor={colors.blue}
          />
          <Caption>Привязать к цели</Caption>
          <View style={ui.wrap}>
            {data.goals.map((g) => (
              <Chip key={g.id} label={g.title} color={colors.blue} selected={goalId === g.id} onPress={() => setGoalId(g.id)} />
            ))}
          </View>
          <Caption>Когда</Caption>
          <View style={ui.wrap}>
            <Chip label="Сегодня" color={colors.blue} selected={when === 'today'} onPress={() => setWhen('today')} />
            <Chip label="Завтра" color={colors.blue} selected={when === 'tomorrow'} onPress={() => setWhen('tomorrow')} />
          </View>
          <Card style={{ gap: 12 }}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15 }}>Обязательная</Text>
                <Small style={{ fontSize: 12 }}>Задачу от модератора участник удалить не может</Small>
              </View>
            </View>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Уведомить участника</Text>
              <Toggle value={notify} onChange={setNotify} />
            </View>
          </Card>
          <Field
            label="Комментарий участнику · необязательно"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            placeholder="Например: догоняем недельную цель"
            hint="Участник увидит его под задачей на экране «Сегодня»"
            focusColor={colors.blue}
          />
        </>
      ) : null}
    </Screen>
  );
}
