import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { useQuery } from '@/data/mod';
import { formatDayMonth, formatTime, dateKey } from '@/lib/date';
import { Card, EmptyState, Header, Screen, Small } from '@/ui';
import { font } from '@/theme';

const KIND: Record<string, string> = {
  dossier: 'досье: задачи, шаги, нормативы',
  analyses: 'анализы и индекс здоровья',
  blank: 'бланк анализов',
  audio: 'голосовое заявление',
};

/** Журнал: когда модератор открывал ваши данные о здоровье (обещано в согласии). */
export default function AccessLog() {
  const { data, error, loading, reload } = useQuery<{ at: string; kind: string; moderator: string }[]>('/v1/me/access-log');
  return (
    <Screen header={<Header title="Журнал доступа" onBack={() => router.back()} />}>
      <Small>Каждое обращение модератора к вашим данным о здоровье записывается сюда.</Small>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && !data.length ? <EmptyState title="Обращений пока не было" /> : null}
      {data?.map((r, i) => (
        <Card key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[font.title, { fontSize: 14 }]}>{r.moderator}</Text>
            <Small style={{ fontSize: 12 }}>{KIND[r.kind] ?? r.kind}</Small>
          </View>
          <Small style={{ fontSize: 12 }}>
            {formatDayMonth(dateKey(new Date(r.at)))}, {formatTime(r.at)}
          </Small>
        </Card>
      ))}
    </Screen>
  );
}
