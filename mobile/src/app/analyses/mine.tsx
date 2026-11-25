import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DISCLAIMER, IndicatorRow, SummaryTiles } from '@/components/analyses-ui';
import { LoadState } from '@/components/mod-ui';
import { type Analyses, latestWithValues } from '@/data/analyses';
import { useQuery } from '@/data/mod';
import { Caption, Card, Chip, EmptyState, Header, Ionicons, Screen, Small, ui } from '@/ui';
import { colors, font } from '@/theme';

export default function MyAnalyses() {
  const { data, error, loading, reload } = useQuery<Analyses>('/v1/me/analyses');
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const withValues = data?.measurements.filter((m) => m.summary.filled > 0) ?? [];
  const m = withValues.find((x) => x.id === picked) ?? (data ? latestWithValues(data) : null);

  return (
    <Screen header={<Header title="Мои анализы" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && !m ? <EmptyState title="Результатов пока нет" text="Загрузите бланк и введите значения — показатели появятся здесь." /> : null}
      {data && m ? (
        <>
          {withValues.length > 1 ? (
            <View style={ui.wrap}>
              {withValues.map((x) => (
                <Chip key={x.id} label={x.name} selected={x.id === m.id} onPress={() => setPicked(x.id)} />
              ))}
            </View>
          ) : null}
          <SummaryTiles m={m} />
          {(() => {
            const attention = data.catalog.filter((c) => ['low', 'high', 'border'].includes(m.values[c.id]?.status ?? ''));
            return attention.length ? (
              <>
                <Caption>Требуют внимания</Caption>
                {attention.map((c) => (
                  <IndicatorRow key={c.id} c={c} m={m} onPress={() => router.push({ pathname: '/analyses/indicator/[id]', params: { id: c.id } })} />
                ))}
              </>
            ) : (
              <Card>
                <Small color={colors.text}>Все введённые показатели в норме.</Small>
              </Card>
            );
          })()}
          <Caption>Панели</Caption>
          {data.groups.map((g) => {
            const items = data.catalog.filter((c) => c.group === g);
            const dev = items.filter((c) => ['low', 'high'].includes(m.values[c.id]?.status ?? '')).length;
            const border = items.filter((c) => m.values[c.id]?.status === 'border').length;
            const filled = items.filter((c) => m.values[c.id]).length;
            const expanded = open === g;
            return (
              <View key={g} style={{ gap: 8 }}>
                <Pressable onPress={() => setOpen(expanded ? null : g)}>
                  <Card style={[ui.row, { justifyContent: 'space-between' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[font.title, { fontSize: 14 }]}>{g}</Text>
                      <Small style={{ fontSize: 11 }}>
                        {filled} из {items.length} сдано
                      </Small>
                    </View>
                    <Text style={{ color: dev ? colors.red : border ? colors.orange : colors.green, fontSize: 12, fontWeight: '700' }}>
                      {dev ? `${dev} откл.` : border ? `${border} у границы` : filled ? 'всё в норме' : '—'}
                    </Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                  </Card>
                </Pressable>
                {expanded
                  ? items.map((c) => (
                      <IndicatorRow key={c.id} c={c} m={m} onPress={() => router.push({ pathname: '/analyses/indicator/[id]', params: { id: c.id } })} />
                    ))
                  : null}
              </View>
            );
          })}
          <Small style={{ fontSize: 11 }}>{DISCLAIMER}</Small>
        </>
      ) : null}
    </Screen>
  );
}
