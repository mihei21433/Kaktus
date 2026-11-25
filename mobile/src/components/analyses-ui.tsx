import { Text, View } from 'react-native';

import { type CatalogItem, fmt, type Measurement, STATUS_COLOR, STATUS_LABEL, unitOf } from '@/data/analyses';
import { Card, Caption, ProgressBar, Small, Stat } from '@/ui';
import { colors, font } from '@/theme';

/** Плитки «В норме / У границы / Отклонения». */
export function SummaryTiles({ m }: { m: Measurement }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Stat label="В норме" value={String(m.summary.normal)} />
      <Stat label="У границы" value={String(m.summary.border)} />
      <Stat label="Отклонения" value={String(m.summary.deviation)} />
    </View>
  );
}

/** Строка показателя: название, норма, значение со статусом. */
export function IndicatorRow({ c, m, onPress }: { c: CatalogItem; m: Measurement; onPress?: () => void }) {
  const v = m.values[c.id];
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={[font.title, { fontSize: 14 }]} numberOfLines={2}>
          {c.name}
        </Text>
        <Small style={{ fontSize: 11 }}>{unitOf(c)}</Small>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: v ? STATUS_COLOR[v.status] : colors.textMuted, fontSize: 16, fontWeight: '700' }}>
          {v ? `${v.comparator === '=' ? '' : v.comparator + ' '}${fmt(v.value)}` : '—'}
        </Text>
        <Small style={{ fontSize: 11 }} color={v ? STATUS_COLOR[v.status] : undefined}>
          {v ? STATUS_LABEL[v.status] : 'не сдан'}
        </Small>
      </View>
    </Card>
  );
}

/** Карточка индекса здоровья. */
export function IndexCard({ m, target, onPress }: { m: Measurement | null; target: number; onPress?: () => void }) {
  const idx = m?.index ?? null;
  return (
    <Card onPress={onPress} background={colors.greenDim} borderColor="#2C5A3C" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Caption color={colors.green}>Индекс здоровья · цель {target}%</Caption>
        {m ? <Small style={{ fontSize: 11 }}>{m.name}</Small> : null}
      </View>
      {idx ? (
        <>
          <Text style={[font.h1, { fontSize: 34 }]}>{idx.total}%</Text>
          <ProgressBar value={idx.total / 100} />
          <Small style={{ fontSize: 12 }}>
            {idx.total >= target ? 'Цель достигнута' : `До цели ${target - idx.total} п.`}
          </Small>
        </>
      ) : (
        <Small color={colors.text}>Индекс появится после первой заливки анализов.</Small>
      )}
    </Card>
  );
}

export const DISCLAIMER = 'Кактус не ставит диагнозов — итоговую оценку по результатам даёт модератор. Показатель вне нормы — повод обратиться к врачу.';
