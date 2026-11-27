import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { useApp } from '@/data/store';
import { Button, Card, LinkButton, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

const STEPS = [
  'Ставите цели на день, неделю и 1–3 месяца',
  'Каждый день отмечаете задачи и присылаете то, что просит модератор',
  'Модератор видит прогресс и корректирует план',
];

export default function StartScreen() {
  const { actions, loggedIn } = useApp();
  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Button
            title="Вступить по коду"
            onPress={() => router.push('/join')}
          />
          <Small style={{ textAlign: 'center', fontSize: 12 }}>Код или ссылку даёт модератор потока</Small>
          {!loggedIn ? (
            <View style={{ alignItems: 'center', marginTop: 4 }}>
              <LinkButton title="Уже есть аккаунт — войти по коду" color={colors.blue} onPress={() => router.push('/login')} />
            </View>
          ) : null}
          <View style={{ alignItems: 'center', marginTop: 4 }}>
            <LinkButton
              title="Посмотреть демо с примерами данных"
              color={colors.textMuted}
              onPress={() => {
                actions.loadDemo();
                router.replace('/');
              }}
            />
          </View>
        </>
      }>
      <View style={{ alignItems: 'center', marginTop: 48, gap: 10 }}>
        <Logo />
        <Text style={font.h1}>Кактус</Text>
        <Small style={{ textAlign: 'center', fontSize: 15, maxWidth: 280 }}>
          Цели, ежедневные задачи и прогресс под контролем модератора
        </Small>
      </View>
      <View style={{ gap: 8, marginTop: 32 }}>
        {STEPS.map((s, i) => (
          <Card key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: colors.greenDim, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.green, fontWeight: '700' }}>{i + 1}</Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>{s}</Text>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
