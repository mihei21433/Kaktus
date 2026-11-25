import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { useApp } from '@/data/store';
import { Button, Caption, Card, Screen, Small } from '@/ui';
import { font } from '@/theme';

export default function BlockedScreen() {
  const { state } = useApp();
  const stream = state.membership.stream;
  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center' }}>
      <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
        <Text style={font.title}>Доступ приостановлен</Text>
        <Small style={{ textAlign: 'center' }}>
          Модератор приостановил ваш доступ к потоку. Данные и история сохраняются полностью.
        </Small>
        <Caption style={{ marginTop: 8 }}>Поток</Caption>
        <Text style={font.title}>{stream?.name}</Text>
        <Caption style={{ marginTop: 8 }}>Модератор потока</Caption>
        <Text style={font.title}>{stream?.moderator}</Text>
      </Card>
      <View style={{ marginTop: 12 }}>
        <Button title="Обновить" variant="secondary" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
