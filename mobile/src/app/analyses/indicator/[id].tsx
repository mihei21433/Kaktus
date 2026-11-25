import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { DISCLAIMER } from '@/components/analyses-ui';
import { LoadState } from '@/components/mod-ui';
import { type Analyses, fmt, STATUS_COLOR, STATUS_LABEL, unitOf } from '@/data/analyses';
import { useQuery } from '@/data/mod';
import { formatDayMonth } from '@/lib/date';
import { Caption, Card, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

/** Показатель в динамике: каждый замер — точка на полосе, зелёная зона — норма. */
export default function IndicatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useQuery<Analyses>('/v1/me/analyses');
  const c = data?.catalog.find((x) => x.id === id);
  const points = data?.measurements.filter((m) => m.values[id]).map((m) => ({ m, v: m.values[id] })) ?? [];

  // Шкала: норма занимает середину полосы, значения за нормой — по краям
  const lo = c?.norm?.lo ?? 0;
  const hi = c?.norm?.hi ?? Math.max(lo * 2, ...points.map((p) => p.v.value), 1);
  const span = hi - lo || 1;
  const min = Math.min(lo - span * 0.5, ...points.map((p) => p.v.value));
  const max = Math.max(hi + span * 0.5, ...points.map((p) => p.v.value));
  const pos = (v: number) => `${((v - min) / (max - min || 1)) * 100}%` as const;

  return (
    <Screen header={<Header title="Показатель" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {c ? (
        <>
          <Text style={font.h2}>{c.name}</Text>
          <Small>{unitOf(c)}</Small>
          {points.length ? (
            <Card style={{ gap: 12 }}>
              <Caption>Динамика по замерам</Caption>
              <View style={{ height: 36, justifyContent: 'center' }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.cardAlt }} />
                {c.norm ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: pos(lo),
                      width: `${(span / (max - min || 1)) * 100}%`,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.greenDim,
                      borderWidth: 1,
                      borderColor: colors.green,
                    }}
                  />
                ) : null}
                {points.map(({ m, v }, i) => (
                  <View
                    key={m.id}
                    accessibilityLabel={`${m.name}: ${fmt(v.value)}`}
                    style={{
                      position: 'absolute',
                      left: pos(v.value),
                      marginLeft: -7,
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: STATUS_COLOR[v.status],
                      opacity: i === points.length - 1 ? 1 : 0.5,
                    }}
                  />
                ))}
              </View>
              <Small style={{ fontSize: 11 }}>Зелёная зона — норма. Яркая точка — последний замер.</Small>
            </Card>
          ) : (
            <Card>
              <Small color={colors.text}>Показатель ещё не сдавали.</Small>
            </Card>
          )}
          {[...points].reverse().map(({ m, v }) => (
            <Card key={m.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[font.title, { fontSize: 14 }]}>{m.name}</Text>
                <Small style={{ fontSize: 11 }}>до {formatDayMonth(m.deadline)}</Small>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: STATUS_COLOR[v.status], fontSize: 18, fontWeight: '700' }}>
                  {v.comparator === '=' ? '' : `${v.comparator} `}
                  {fmt(v.value)}
                </Text>
                <Small style={{ fontSize: 11 }} color={STATUS_COLOR[v.status]}>
                  {STATUS_LABEL[v.status]}
                </Small>
              </View>
            </Card>
          ))}
          <Small style={{ fontSize: 11 }}>{DISCLAIMER}</Small>
        </>
      ) : null}
    </Screen>
  );
}
