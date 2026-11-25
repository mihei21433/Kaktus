import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { useApp } from '@/data/store';
import { Button, Caption, Card, Field, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

const REMOVED = [
  'Профиль: имя, фото, «О себе», личный контракт.',
  'Анализы, бланки и индекс здоровья.',
  'Задачи, цели и критерии, шаги, физнормативы, утренние заявления.',
  'Ваши выгрузки, а также выгрузки модераторов, в которые попали ваши данные.',
];
const KEPT = [
  'Журнал действий — без ваших данных: что и когда происходило.',
  'Отметка у модератора потока «участник удалил аккаунт» — без имени и данных.',
  'Общие числа потока: например, сколько человек получили рассылку.',
  'Резервные копии хранят данные ещё до 30 дней, потом удаляются.',
];

export default function DeleteAccount() {
  const { actions } = useApp();
  const [word, setWord] = useState('');
  const ok = word.trim().toLowerCase() === 'удалить';
  return (
    <Screen header={<Header title="Удаление аккаунта" onBack={() => router.back()} />}>
      <Small color={colors.text}>Удаление необратимо. Восстановить аккаунт и данные после него нельзя.</Small>
      <Card style={{ gap: 6 }}>
        <Caption color={colors.green}>Сначала выгрузите данные</Caption>
        <Small>Сохраните анализы, индекс, задачи и заявления себе — после удаления их не вернуть. Экспорт появится на следующем этапе.</Small>
      </Card>
      <Card style={{ gap: 6 }}>
        <Caption color={colors.red}>Удалится</Caption>
        {REMOVED.map((t) => (
          <Small key={t} color={colors.text}>•  {t}</Small>
        ))}
      </Card>
      <Card style={{ gap: 6 }}>
        <Caption>Останется без вашего имени</Caption>
        {KEPT.map((t) => (
          <Small key={t}>•  {t}</Small>
        ))}
      </Card>
      <Text style={font.title}>Чтобы подтвердить, введите слово «удалить»</Text>
      <Field value={word} onChangeText={setWord} autoCapitalize="none" />
      {!ok ? <Small style={{ fontSize: 12 }}>Кнопка заработает, когда слово «удалить» введено.</Small> : null}
      <Button
        title="Удалить аккаунт навсегда"
        variant="danger"
        disabled={!ok}
        onPress={async () => {
          if (await actions.deleteAccount()) router.replace('/');
        }}
      />
    </Screen>
  );
}
