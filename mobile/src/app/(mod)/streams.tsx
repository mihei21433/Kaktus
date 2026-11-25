import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Avatar, LoadState } from '@/components/mod-ui';
import { api } from '@/data/api';
import { MemberRow, Overview, useQuery } from '@/data/mod';
import { plural } from '@/lib/date';
import { Caption, Card, Field, Header, Ionicons, RowLink, Screen, Small, Stat, Tag } from '@/ui';
import { colors, font } from '@/theme';

export default function StreamsScreen() {
  const { data, error, loading, reload } = useQuery<Overview>('/v1/mod/overview');
  const [search, setSearch] = useState('');

  return (
    <Screen inTabs header={<Header title="Потоки" rightIcon="add" rightColor={colors.blue} onRight={() => router.push('/mod/stream-new')} />}>
      <Field value={search} onChangeText={setSearch} placeholder="Поиск по потокам и участникам" focusColor={colors.blue} />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && search.trim() ? <SearchResults overview={data} query={search.trim().toLowerCase()} /> : null}
      {data && !search.trim() ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Stat label="Участников" value={String(data.totals.members)} />
            <Stat label="Требуют внимания" value={String(data.totals.attention)} sub="отстают и без отправок" subColor={colors.orange} />
          </View>
          <Caption>Активные потоки</Caption>
          {data.streams.length === 0 ? (
            <Card style={{ gap: 8, alignItems: 'center', paddingVertical: 24 }}>
              <Text style={font.title}>Потоков пока нет</Text>
              <Small style={{ textAlign: 'center' }}>Создайте первый поток — участники вступят в него по коду.</Small>
              <Text style={{ color: colors.blue, fontWeight: '600', marginTop: 4 }} onPress={() => router.push('/mod/stream-new')}>
                + Создать поток
              </Text>
            </Card>
          ) : null}
          {data.streams.map((s) => {
            const total = Math.max(1, s.counts.on_plan + s.counts.behind + s.counts.no_reports + s.counts.new);
            const seg = [
              [s.counts.on_plan, colors.green],
              [s.counts.behind, colors.orange],
              [s.counts.no_reports, colors.red],
              [s.counts.new, colors.textSecondary],
            ] as const;
            return (
              <Card key={s.id} style={{ gap: 10, paddingBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={font.title}>{s.name}</Text>
                    <Small style={{ fontSize: 12 }}>
                      {s.members} {plural(s.members, ['участник', 'участника', 'участников'])} · код {s.code}
                    </Small>
                  </View>
                  <Tag label="АКТИВЕН" color={colors.green} />
                </View>
                {s.members ? (
                  <>
                    <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.cardAlt }}>
                      {seg.map(([n, c], i) => (n ? <View key={i} style={{ flex: n / total, backgroundColor: c }} /> : null))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                      <Small style={{ fontSize: 11 }} color={colors.green}>{s.counts.on_plan} по плану</Small>
                      <Small style={{ fontSize: 11 }} color={colors.orange}>{s.counts.behind} отстают</Small>
                      <Small style={{ fontSize: 11 }} color={colors.red}>{s.counts.no_reports} без отправок</Small>
                      <Small style={{ fontSize: 11 }}>{s.counts.new} новых</Small>
                    </View>
                  </>
                ) : (
                  <Small style={{ fontSize: 12 }}>Участников пока нет</Small>
                )}
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                  {s.pending ? (
                    <RowLink
                      title={`${s.pending} ${plural(s.pending, ['заявка', 'заявки', 'заявок'])} на вступление`}
                      color={colors.orange}
                      onPress={() => router.push('/requests')}
                    />
                  ) : null}
                  <RowLink title="Участники" color={colors.blue} onPress={() => router.push({ pathname: '/mod/stream/[id]', params: { id: s.id } })} />
                  <RowLink
                    title="Настройки потока"
                    subtitle="код, правила, разделы, порог шагов"
                    onPress={() => router.push({ pathname: '/mod/stream-settings/[id]', params: { id: s.id } })}
                  />
                </View>
              </Card>
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}

/** Поиск по названиям потоков и именам участников. */
function SearchResults({ overview, query }: { overview: Overview; query: string }) {
  const streams = overview.streams.filter((s) => s.name.toLowerCase().includes(query) || s.code.toLowerCase().includes(query));
  // Участников загружаем один раз на набор потоков, фильтруем на телефоне
  const [all, setAll] = useState<{ row: MemberRow; stream: string }[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list: { row: MemberRow; stream: string }[] = [];
      for (const s of overview.streams) {
        const rows = await api<MemberRow[]>('GET', `/v1/mod/streams/${s.id}/members`).catch(() => [] as MemberRow[]);
        for (const r of rows) list.push({ row: r, stream: s.name });
      }
      if (!cancelled) setAll(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [overview.streams]);
  const people = all ? all.filter((p) => p.row.name.toLowerCase().includes(query)) : null;

  return (
    <>
      <Caption>Участники</Caption>
      {people === null ? <Small>Ищем…</Small> : null}
      {people?.length === 0 ? <Small>Никого не нашли</Small> : null}
      {people?.map(({ row, stream }) => (
        <Pressable key={row.id} onPress={() => router.push({ pathname: '/mod/member/[id]', params: { id: row.id } })}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={row.name} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={font.title}>{row.name}</Text>
              <Small style={{ fontSize: 12 }}>{stream}</Small>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Card>
        </Pressable>
      ))}
      <Caption>Потоки</Caption>
      {streams.length === 0 ? <Small>Нет совпадений</Small> : null}
      {streams.map((s) => (
        <Card key={s.id} style={{ paddingVertical: 0 }}>
          <RowLink title={s.name} subtitle={`код ${s.code}`} onPress={() => router.push({ pathname: '/mod/stream/[id]', params: { id: s.id } })} />
        </Card>
      ))}
    </>
  );
}
