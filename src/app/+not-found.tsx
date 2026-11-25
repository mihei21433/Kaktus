import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Button, Header, Screen, Small } from '@/ui';
import { font } from '@/theme';

export default function NotFound() {
  return (
    <Screen scroll={false} header={<Header onBack={() => router.replace('/')} />}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 }}>
        <Text style={font.title}>Такой страницы нет</Text>
        <Small style={{ textAlign: 'center' }}>Возможно, ссылка устарела или набрана с ошибкой.</Small>
        <Button title="На главную" onPress={() => router.replace('/')} style={{ alignSelf: 'stretch', marginTop: 8 }} />
      </View>
    </Screen>
  );
}
