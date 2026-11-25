import { router } from 'expo-router';
import { Text } from 'react-native';

import { useApp } from '@/data/store';
import { Caption, Card, Header, Screen } from '@/ui';
import { colors, font } from '@/theme';

export default function MyStream() {
  const { state } = useApp();
  const s = state.membership.stream!;
  const sections = [
    [s.modules.statements, 'Утренние заявления'],
    [true, 'Отчёты по задачам'],
    [s.modules.analyses, 'Анализы и индекс здоровья'],
    [s.modules.goals, 'Цели по срокам'],
    [s.modules.steps, 'Шаги и физнормативы'],
    [s.modules.ai, 'ИИ-сводки и рекомендации'],
  ] as const;
  return (
    <Screen header={<Header title="Мой поток" onBack={() => router.back()} />}>
      <Text style={font.h2}>{s.name}</Text>
      <Card style={{ gap: 4 }}>
        <Caption>Модератор</Caption>
        <Text style={font.title}>{s.moderator}</Text>
      </Card>
      <Card style={{ gap: 6 }}>
        <Caption>Разделы потока</Caption>
        {sections
          .filter(([on]) => on)
          .map(([, label]) => (
            <Text key={label} style={{ color: colors.text, fontSize: 14 }}>
              ✓ {label}
            </Text>
          ))}
      </Card>
    </Screen>
  );
}
