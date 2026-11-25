import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { IndexCard } from '@/components/analyses-ui';
import { LoadState } from '@/components/mod-ui';
import type { Analyses } from '@/data/analyses';
import { useQuery } from '@/data/mod';
import { Caption, Card, Header, ProgressBar, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function HealthIndex() {
  const { data, error, loading, reload } = useQuery<Analyses>('/v1/me/analyses');
  const m = data ? ([...data.measurements].reverse().find((x) => x.index) ?? null) : null;
  const blocks = data && m?.index
    ? [
        { label: 'Анализы', value: m.index.analyses, weight: data.weights.analyses, note: `${m.summary.filled} из ${m.summary.total} показателей` },
        { label: 'Физнормативы', value: m.index.fitness, weight: data.weights.fitness, note: 'последние значения к нормам потока' },
        { label: 'Регулярность', value: m.index.regularity, weight: data.weights.regularity, note: 'задачи и утренние заявления' },
      ]
    : [];
  return (
    <Screen header={<Header title="Индекс здоровья" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <IndexCard m={m} target={data.targetIndex} />
          {blocks.length ? <Caption>Из чего складывается</Caption> : null}
          {blocks.map((b) => (
            <Card key={b.label} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[font.title, { fontSize: 14 }]}>
                  {b.label} <Text style={{ color: colors.textSecondary, fontWeight: '400' }}>· вес {Math.round(b.weight * 100)}%</Text>
                </Text>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{b.value === null ? '—' : `${b.value}%`}</Text>
              </View>
              <ProgressBar value={(b.value ?? 0) / 100} />
              <Small style={{ fontSize: 11 }}>{b.value === null ? 'не учитывается: раздел выключен' : b.note}</Small>
            </Card>
          ))}
          <Small style={{ fontSize: 11 }}>
            Индекс — расчёт по формуле потока, не диагноз. Балл показателя снижается плавно по мере отклонения от нормы; несданный показатель даёт ноль
            баллов; показатели с нормой по фазе цикла оценивает модератор и в индекс не входят.
          </Small>
        </>
      ) : null}
    </Screen>
  );
}
