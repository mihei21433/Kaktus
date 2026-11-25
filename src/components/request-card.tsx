import { Text, View } from 'react-native';

import { Stream } from '@/data/types';
import { Card, Small } from '@/ui';
import { colors } from '@/theme';

export function RequestCard({ stream, status, statusColor }: { stream: Stream; status: string; statusColor: string }) {
  const rows: [string, string, string?][] = [
    ['Поток', stream.name],
    ['Код', stream.code],
    ['Модератор', stream.moderator],
    ['Статус', status, statusColor],
  ];
  return (
    <Card style={{ gap: 10 }}>
      {rows.map(([k, v, c]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Small>{k}</Small>
          <Text style={{ color: c ?? colors.text, fontWeight: '600', fontSize: 14 }}>{v}</Text>
        </View>
      ))}
    </Card>
  );
}

export function StatusIcon({ icon, color }: { icon: string; color: string }) {
  return (
    <View
      style={{
        width: 72,
        height: 72,
        borderRadius: 36,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
      }}>
      <Text style={{ fontSize: 30, color }}>{icon}</Text>
    </View>
  );
}
