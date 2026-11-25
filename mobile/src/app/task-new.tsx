import { router, useLocalSearchParams, usePreventRemove, useNavigation } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useApp } from '@/data/store';
import { addDays, todayKey } from '@/lib/date';
import { Button, Caption, Card, Chip, ConfirmDialog, Field, Header, Screen, Toggle, ui } from '@/ui';
import { colors } from '@/theme';

const UNITS = ['шагов', 'минут', 'раз', 'км', 'страниц'];

export default function NewTaskScreen() {
  const { state, actions } = useApp();
  const params = useLocalSearchParams<{ date?: string; goalId?: string }>();
  const navigation = useNavigation();
  const [goalId, setGoalId] = useState<string | null>(params.goalId ?? null);
  const [text, setText] = useState('');
  const [min, setMin] = useState('');
  const [unit, setUnit] = useState<string | null>(null);
  const [date, setDate] = useState(params.date ?? todayKey());
  const [repeat, setRepeat] = useState(false);
  const [leaving, setLeaving] = useState<null | (() => void)>(null);
  const [saved, setSaved] = useState(false);

  const dirty = !saved && (!!text || !!min || !!goalId);
  usePreventRemove(dirty, ({ data }) => setLeaving(() => () => navigation.dispatch(data.action)));

  const canSave = !!goalId && text.trim().length > 0;
  const tomorrow = addDays(todayKey(), 1);

  return (
    <Screen
      header={<Header title="Новая задача" backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        <Button
          title="Добавить в цель"
          disabled={!canSave}
          onPress={() => {
            actions.addTask({
              goalId: goalId!,
              text: text.trim(),
              date,
              repeatDaily: repeat,
              minValue: min ? Number(min) : undefined,
              unit: min ? unit ?? undefined : undefined,
            });
            setSaved(true);
            setTimeout(() => router.back(), 0);
          }}
        />
      }>
      <Caption>К какой цели относится</Caption>
      <View style={ui.wrap}>
        {state.goals.map((g) => (
          <Chip key={g.id} label={g.title} selected={goalId === g.id} onPress={() => setGoalId(g.id)} />
        ))}
      </View>
      <Field label="Задача" value={text} onChangeText={setText} placeholder="Например: ежедневно 10 000 шагов без пропусков" multiline />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Caption>Минимум, который засчитать</Caption>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>необязательно</Text>
      </View>
      <Field value={min} onChangeText={(v) => setMin(v.replace(/\D/g, ''))} placeholder="Например: 10 000" keyboardType="number-pad" />
      {min ? (
        <View style={ui.wrap}>
          {UNITS.map((u) => (
            <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
          ))}
        </View>
      ) : null}
      <Caption>Срок</Caption>
      <View style={ui.wrap}>
        <Chip label="Сегодня" selected={date === todayKey()} onPress={() => setDate(todayKey())} />
        <Chip label="Завтра" selected={date === tomorrow} onPress={() => setDate(tomorrow)} />
      </View>
      <Card style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>Повторять каждый день</Text>
        <Toggle value={repeat} onChange={setRepeat} />
      </Card>
      <ConfirmDialog
        visible={!!leaving}
        title="Уйти без сохранения?"
        message="Набранное не сохранится."
        cancelLabel="Остаться"
        confirmLabel="Уйти"
        onCancel={() => setLeaving(null)}
        onConfirm={() => {
          const go = leaving;
          setLeaving(null);
          go?.();
        }}
      />
    </Screen>
  );
}
