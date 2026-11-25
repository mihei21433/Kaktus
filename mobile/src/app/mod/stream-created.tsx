import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, Text, View } from 'react-native';

import { Button, Caption, Card, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

function inviteText(name: string, code: string) {
  return `Приглашаю в ${name} в приложении «Кактус». Установите приложение, нажмите «Вступить по коду» и введите код: ${code}`;
}

export default function StreamCreatedScreen() {
  const { id, name, code } = useLocalSearchParams<{ id: string; name: string; code: string }>();
  const [copied, setCopied] = useState(false);
  return (
    <Screen
      header={<Header title="Поток создан" />}
      footer={<Button title="Перейти к потоку" variant="blue" onPress={() => router.replace({ pathname: '/mod/stream/[id]', params: { id } })} />}>
      <Text style={font.h2}>{name}</Text>
      <Card style={{ gap: 10 }}>
        <Caption color={colors.blue}>Код-приглашение</Caption>
        <Text style={{ color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: 4 }}>{code}</Text>
        <Small>Отправьте код участникам — по нему они подадут заявку.</Small>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title={copied ? 'Скопировано' : 'Скопировать'}
            variant="secondary"
            small
            style={{ flex: 1 }}
            onPress={async () => {
              await Clipboard.setStringAsync(code);
              setCopied(true);
            }}
          />
          <Button title="Поделиться" variant="secondary" small style={{ flex: 1 }} onPress={() => Share.share({ message: inviteText(name, code) })} />
        </View>
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <Text
          style={{ color: colors.text, paddingVertical: 14 }}
          onPress={() => router.replace({ pathname: '/mod/stream-settings/[id]', params: { id } })}>
          Правила и настройки потока ›
        </Text>
      </Card>
    </Screen>
  );
}
