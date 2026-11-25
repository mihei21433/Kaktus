import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, LabelTag, LoadState } from '@/components/mod-ui';
import { MemberLabel, MemberRow, useQuery } from '@/data/mod';
import { Stream } from '@/data/types';
import { formatNumber } from '@/lib/date';
import { Button, Card, Chip, Header, Screen, Small, ui } from '@/ui';
import { colors, font } from '@/theme';

type Filter = 'all' | MemberLabel;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'behind', label: 'Отстают' },
  { value: 'no_reports', label: 'Без отправок' },
  { value: 'new', label: 'Новые' },
  { value: 'on_plan', label: 'По плану' },
];

export default function StreamMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const stream = useQuery<Stream>(`/v1/mod/streams/${id}`);
  const { data, error, loading, reload } = useQuery<MemberRow[]>(`/v1/mod/streams/${id}/members`);
  const [filter, setFilter] = useState<Filter>('all');

  const list = (data ?? []).filter((m) => filter === 'all' || m.label === filter);
  const count = (f: Filter) => (data ?? []).filter((m) => f === 'all' || m.label === f).length;

  return (
    <Screen
      header={<Header title={stream.data?.name ?? 'Поток'} onBack={() => router.back()} />}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Рассылка" variant="blue" style={{ flex: 1 }} onPress={() => router.push('/broadcasts')} />
          <Button
            title="Настройки"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/mod/stream-settings/[id]', params: { id } })}
          />
        </View>
      }>
      <View style={ui.wrap}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={`${f.label} · ${count(f.value)}`} color={colors.text} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && data.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 20 }}>
          <Text style={font.title}>В потоке пока нет участников</Text>
          <Small style={{ textAlign: 'center' }}>
            Как только заявка на вступление будет одобрена, участник появится здесь. Код потока: {stream.data?.code}
          </Small>
        </Card>
      ) : null}
      {data && data.length > 0 && list.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 20 }}>
          <Text style={font.title}>Под этот фильтр никто не попал</Text>
          <Small>Снимите фильтр, чтобы увидеть всех участников потока.</Small>
        </Card>
      ) : null}
      {list.map((m) => (
        <Pressable key={m.id} onPress={() => router.push({ pathname: '/mod/member/[id]', params: { id: m.id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={m.name} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={[ui.row, { gap: 6 }]}>
                <Text style={font.title} numberOfLines={1}>
                  {m.name}
                </Text>
                <LabelTag label={m.label} blocked={m.blocked} />
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                задачи <Text style={{ color: m.today.total && m.today.done === m.today.total ? colors.green : colors.orange }}>{m.today.done}/{m.today.total}</Text>
                {'  '}шаги{' '}
                <Text style={{ color: m.today.steps !== null ? colors.green : colors.textMuted }}>{m.today.steps !== null ? formatNumber(m.today.steps) : '—'}</Text>
                {'  '}заявление{' '}
                <Text style={{ color: m.today.statement ? colors.green : colors.red }}>{m.today.statement ? '✓' : '✗'}</Text>
              </Text>
            </View>
            <Text style={{ color: colors.textMuted }}>›</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
