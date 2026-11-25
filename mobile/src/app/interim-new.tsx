import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useApp } from '@/data/store';
import { Horizon, HORIZONS } from '@/data/types';
import { Button, Caption, Chip, Field, Header, Screen, Small, ui } from '@/ui';

export default function NewInterimScreen() {
  const { state, actions } = useApp();
  const params = useLocalSearchParams<{ horizon?: Horizon }>();
  const [horizon, setHorizon] = useState<Horizon>(params.horizon ?? 'week');
  const [goalId, setGoalId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('');

  return (
    <Screen
      header={<Header title="Цель на срок" backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        <Button
          title="Поставить цель"
          disabled={!goalId || !text.trim()}
          onPress={() => {
            actions.addInterim({
              goalId: goalId!,
              horizon,
              text: text.trim(),
              target: target ? Number(target) : undefined,
              unit: unit.trim() || undefined,
            });
            router.back();
          }}
        />
      }>
      <Caption>Срок</Caption>
      <View style={ui.wrap}>
        {HORIZONS.map((h) => (
          <Chip key={h.value} label={h.label} selected={horizon === h.value} onPress={() => setHorizon(h.value)} />
        ))}
      </View>
      <Caption>Цель</Caption>
      <View style={ui.wrap}>
        {state.goals.map((g) => (
          <Chip key={g.id} label={g.title} selected={goalId === g.id} onPress={() => setGoalId(g.id)} />
        ))}
      </View>
      <Field label="Формулировка" value={text} onChangeText={setText} placeholder="Например: ложиться до 23:00" />
      <View style={ui.row}>
        <View style={{ flex: 1 }}>
          <Field value={target} onChangeText={(v) => setTarget(v.replace(/\D/g, ''))} placeholder="Сколько (необязательно)" keyboardType="number-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field value={unit} onChangeText={setUnit} placeholder="дней, шагов…" />
        </View>
      </View>
      <Small style={{ fontSize: 12 }}>Срок отсчитывается с сегодняшнего дня.</Small>
    </Screen>
  );
}
