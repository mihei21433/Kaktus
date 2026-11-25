import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useApp } from '@/data/store';
import { Criterion } from '@/data/types';
import { Button, Caption, Card, Checkbox, Field, Header, LinkButton, Screen, Small, Toggle, ui } from '@/ui';
import { colors, font } from '@/theme';

const uid = () => Math.random().toString(36).slice(2, 8);

export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, actions } = useApp();
  const goal = state.goals.find((g) => g.id === id);
  const stream = state.membership.stream!;
  const [result, setResult] = useState(goal?.result ?? '');
  const [criteria, setCriteria] = useState<Criterion[]>(goal?.criteria ?? []);
  const [split, setSplit] = useState(goal?.splitWeekly ?? false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  if (!goal) {
    return (
      <Screen header={<Header onBack={() => router.back()} />}>
        <Text style={font.title}>Такой цели нет</Text>
      </Screen>
    );
  }

  const addCriterion = () => {
    if (draft.trim()) setCriteria([...criteria, { id: uid(), text: draft.trim(), done: false }]);
    setDraft('');
    setAdding(false);
  };

  return (
    <Screen
      header={<Header title={goal.title} backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        <Button
          title="Сохранить результат"
          disabled={!result.trim()}
          onPress={() => {
            actions.saveGoal(goal.id, { result: result.trim(), criteria, splitWeekly: split });
            router.back();
          }}
        />
      }>
      <Card background={colors.greenDim} borderColor="#2C5A3C">
        <Text style={[font.title, { fontSize: 14 }]}>{goal.custom ? 'Своя цель' : 'Цель включена модератором'}</Text>
        <Small style={{ fontSize: 12 }}>до {stream.goalDeadline}</Small>
      </Card>
      <Field
        label="Что хочу получить"
        value={result}
        onChangeText={setResult}
        multiline
        maxLength={300}
        counter
        placeholder="Например: снизить вес с 72 до 66 кг"
      />
      {goal.hint ? (
        <Card background="#14243A" borderColor="#1E3A5C">
          <Caption color={colors.blue}>Подсказка модератора</Caption>
          <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{goal.hint}</Text>
        </Card>
      ) : null}
      <Caption>Как пойму, что достиг</Caption>
      <Card style={{ gap: 12 }}>
        {criteria.map((c) => (
          <View key={c.id} style={ui.row}>
            <View style={{ flex: 1 }}>
              <Checkbox
                checked={c.done}
                onChange={(v) => setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, done: v } : x)))}
                label={c.text}
              />
            </View>
            <LinkButton title="Удалить" color={colors.red} onPress={() => setCriteria(criteria.filter((x) => x.id !== c.id))} />
          </View>
        ))}
        {adding ? (
          <View style={{ gap: 8 }}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={addCriterion}
              placeholder="Например: сдал анализы"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, borderWidth: 1, borderColor: colors.text, borderRadius: 10, padding: 10 }}
            />
            <Button title="Сохранить" small variant="secondary" onPress={addCriterion} />
          </View>
        ) : (
          <Pressable onPress={() => setAdding(true)}>
            <Text style={{ color: colors.textSecondary }}>
              <Text style={{ color: colors.green }}>+ </Text>Добавить критерий
            </Text>
          </Pressable>
        )}
      </Card>
      <Card style={{ gap: 6 }}>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Разбить на задачи недели</Text>
          <Toggle value={split} onChange={setSplit} />
        </View>
        <Small style={{ fontSize: 11 }}>
          {criteria.length ? 'Цель на срок «Неделя» из невыполненных критериев.' : 'Сначала добавьте критерии — цель недели строится из невыполненных.'}
        </Small>
      </Card>
      <Small style={{ fontSize: 12 }}>Цель и результат видит модератор.</Small>
    </Screen>
  );
}
