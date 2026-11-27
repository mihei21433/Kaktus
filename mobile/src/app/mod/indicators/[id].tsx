/** Нормы анализов потока: список показателей по группам, изменённые и выключенные отмечены. */
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { IndicatorNorm, normsLabel, useQuery } from '@/data/mod';
import { Caption, Card, Header, Ionicons, Screen, Small, Tag } from '@/ui';
import { colors } from '@/theme';

export default function IndicatorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useQuery<IndicatorNorm[]>(`/v1/mod/streams/${id}/indicators`);
  const groups = data ? [...new Set(data.map((i) => i.group))] : [];
  const changed = data?.filter((i) => i.changed).length ?? 0;
  const off = data?.filter((i) => i.off).length ?? 0;

  return (
    <Screen header={<Header title="Нормы анализов" onBack={() => router.back()} />}>
      <Card borderColor="#1E3A5F" style={{ gap: 6 }}>
        <Small color={colors.text}>
          По умолчанию стоят общие нормы. Поменяйте норму для своего потока, если так рекомендует ваш врач, или выключите показатель,
          который участники не сдают: он пропадёт из панели и не будет снижать индекс здоровья.
        </Small>
        <Small style={{ fontSize: 12 }}>
          Изменения сразу применяются ко всем замерам потока, в том числе прошлым: статусы и индекс пересчитываются.
        </Small>
      </Card>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <Small>
          Изменено: {changed} · выключено: {off} · учитывается: {data.length - off} из {data.length}
        </Small>
      ) : null}
      {groups.map((g) => (
        <View key={g} style={{ gap: 8 }}>
          <Caption>{g}</Caption>
          <Card style={{ paddingVertical: 4 }}>
            {data!
              .filter((i) => i.group === g)
              .map((i, n) => (
                <Pressable
                  key={i.id}
                  onPress={() => router.push({ pathname: '/mod/indicator-edit', params: { stream: id, ind: i.id } })}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 10,
                    borderTopWidth: n ? 1 : 0,
                    borderTopColor: colors.border,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: i.off ? colors.textMuted : colors.text, fontSize: 14 }}>{i.name}</Text>
                    <Small style={{ fontSize: 12 }}>
                      {normsLabel(i.current)} {i.unit}
                    </Small>
                  </View>
                  {i.off ? <Tag label="выкл" color={colors.textSecondary} /> : i.changed ? <Tag label="своя норма" color={colors.blue} /> : null}
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
