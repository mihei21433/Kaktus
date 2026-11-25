import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { TaskRow } from '@/components/task-row';
import { tasksForDate, useApp } from '@/data/store';
import { addDays, formatDayMonth, todayKey } from '@/lib/date';
import { Caption, Header, Screen, Segmented, Small } from '@/ui';
import { colors } from '@/theme';

type Tab = 'yesterday' | 'today' | 'tomorrow';

export default function DayPlanScreen() {
  const { state, actions } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const today = todayKey();
  const date = tab === 'today' ? today : addDays(today, tab === 'yesterday' ? -1 : 1);
  const tasks = tasksForDate(state.tasks, date);
  const done = tasks.filter((t) => t.completions[date]).length;
  const goalIds = [...new Set(tasks.map((t) => t.goalId))];
  const goalNames = goalIds.map((id) => state.goals.find((g) => g.id === id)?.title).filter(Boolean);
  const label = { yesterday: 'Вчера', today: 'Сегодня', tomorrow: 'Завтра' }[tab];

  return (
    <Screen header={<Header title="Задачи" onBack={() => router.back()} />}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'yesterday', label: 'Вчера' },
          { value: 'today', label: 'Сегодня' },
          { value: 'tomorrow', label: 'Завтра' },
        ]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Caption>
          {label} · {formatDayMonth(date)}
        </Caption>
        <Small style={{ fontSize: 12 }}>
          {done} из {tasks.length} выполнено
        </Small>
      </View>
      {goalNames.length ? <Text style={{ color: colors.green, fontSize: 12 }}>Цели: {goalNames.join(', ')}</Text> : null}
      {tasks.length === 0 ? <Small>Задач нет</Small> : null}
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          goal={state.goals.find((g) => g.id === t.goalId)}
          showGoal={false}
          done={!!t.completions[date]}
          onToggle={() => tab !== 'tomorrow' && actions.toggleTask(t.id, date)}
        />
      ))}
      {tab !== 'yesterday' ? (
        <Pressable
          onPress={() => router.push({ pathname: '/task-new', params: { date } })}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: colors.textSecondary }}>
            <Text style={{ color: colors.green }}>+ </Text>Добавить задачу в цель
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
