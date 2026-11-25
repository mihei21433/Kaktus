import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useApp } from '@/data/store';
import { todayKey } from '@/lib/date';
import { Button, Card, Field, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function StatementScreen() {
  const { state, actions } = useApp();
  const sent = state.statements[todayKey()];
  const [text, setText] = useState('');

  return (
    <Screen header={<Header title="Утреннее заявление" onBack={() => router.back()} />}>
      <Small>Проговорите настрой и планы на день. Формат и длительность задаёт модератор.</Small>
      <Small style={{ fontSize: 12 }}>Текстом · Ежедневно, в любое время</Small>
      {sent ? (
        <Card style={{ gap: 8 }}>
          <Text style={font.title}>Заявление отправлено</Text>
          <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{sent.text}</Text>
          <Button
            title="Переписать"
            variant="secondary"
            onPress={() => {
              setText(sent.text);
              actions.clearStatement();
            }}
          />
        </Card>
      ) : (
        <>
          <Field
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            placeholder="Например: сегодня я спокойна и собрана. Пробегаю 3 км, пью воду и ложусь до 23:00."
          />
          <Button title="Записать голосом — скоро" variant="secondary" disabled />
          <Button
            title="Отправить заявление"
            disabled={!text.trim()}
            onPress={() => {
              actions.sendStatement(text.trim());
              setText('');
            }}
          />
        </>
      )}
    </Screen>
  );
}
