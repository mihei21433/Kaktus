import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useApp } from '@/data/store';
import { formatDayMonth, formatNumber, plural } from '@/lib/date';
import { avgSteps, dayStatus, DayStatus, lastDays, streak, taskRate } from '@/lib/progress';
import { Button, Card, Screen, Small, Stat } from '@/ui';
import { colors, font } from '@/theme';

const STATUS_COLOR: Record<DayStatus, string> = {
  done: colors.green,
  partial: colors.orange,
  miss: colors.borderStrong,
  none: colors.cardAlt,
};

export default function ProgressScreen() {
  const { state } = useApp();
  const stream = state.membership.stream!;
  const days = lastDays(14);
  const s = streak(state);
  const rate = taskRate(state, days);
  const avg = avgSteps(state, days);
  const max = Math.max(stream.stepsThreshold * 1.3, ...days.map((d) => state.steps[d] ?? 0));
  const hasSteps = avg !== null;

  return (
    <Screen inTabs>
      <Text style={[font.title, { textAlign: 'center' }]}>Прогресс</Text>
      {!hasSteps && stream.modules.steps ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Text style={[font.title, { textAlign: 'center', fontSize: 14 }]}>
            Здесь появятся шаги и выполнение задач — после первой отправки.
          </Text>
          <Button title="Отправить шаги" onPress={() => router.push('/steps')} style={{ alignSelf: 'stretch' }} />
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Серия" value={`${s} ${plural(s, ['дн.', 'дн.', 'дн.'])}`} />
        <Stat label="Задачи" value={rate === null ? '0%' : `${Math.round(rate * 100)}%`} />
        <Stat label="Шаги в среднем" value={avg === null ? '—' : formatNumber(avg)} />
      </View>

      {stream.modules.steps ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={font.title}>Шаги за 14 дней</Text>
            <Small style={{ fontSize: 11 }}>порог {formatNumber(stream.stepsThreshold)}</Small>
          </View>
          <View style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
            {days.map((d) => {
              const v = state.steps[d] ?? 0;
              const ok = v >= stream.stepsThreshold;
              return (
                <View
                  key={d}
                  style={{
                    flex: 1,
                    height: Math.max(v ? 6 : 0, (v / max) * 120),
                    backgroundColor: ok ? colors.green : colors.borderStrong,
                    borderRadius: 3,
                  }}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Small style={{ fontSize: 10 }}>{formatDayMonth(days[0])}</Small>
            <Small style={{ fontSize: 10 }}>сегодня</Small>
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Text style={font.title}>Календарь выполнения</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {days.map((d) => (
            <View
              key={d}
              accessibilityLabel={`${formatDayMonth(d)}: ${dayStatus(state, d)}`}
              style={{ width: '12.4%', aspectRatio: 1, borderRadius: 6, backgroundColor: STATUS_COLOR[dayStatus(state, d)] }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Small style={{ fontSize: 11 }} color={colors.green}>● выполнено</Small>
          <Small style={{ fontSize: 11 }} color={colors.orange}>● частично</Small>
          <Small style={{ fontSize: 11 }}>● пропуск</Small>
        </View>
      </Card>
    </Screen>
  );
}
