import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { TaskRow } from '@/components/task-row';
import { tasksForDate, useApp } from '@/data/store';
import { todayKey } from '@/lib/date';
import { Chip, Header, Screen, Small, ui } from '@/ui';
import { colors } from '@/theme';

/** «Задачи внутри целей» — задачи на сегодня, сгруппированные по целям. */
export default function TasksScreen() {
  const { state, actions } = useApp();
  const today = todayKey();
  const [filter, setFilter] = useState<string | null>(null);
  const tasks = tasksForDate(state.tasks, today);
  const goals = state.goals.filter((g) => !filter || g.id === filter);
  const countFor = (goalId: string) => tasks.filter((t) => t.goalId === goalId).length;

  return (
    <Screen
      header={<Header title="Задачи внутри целей" onBack={() => router.back()} rightIcon="add" onRight={() => router.push('/task-new')} />}>
      <View style={ui.wrap}>
        <Chip label={`Все цели · ${tasks.length}`} selected={!filter} color={colors.text} onPress={() => setFilter(null)} />
        {state.goals.map((g) => (
          <Chip key={g.id} label={`${g.title} ${countFor(g.id)}`} color={g.color} selected={filter === g.id} onPress={() => setFilter(g.id)} />
        ))}
      </View>
      {tasks.length === 0 ? <Small>На сегодня задач нет. Нажмите +, чтобы добавить.</Small> : null}
      {tasks.length > 0 &&
        goals.map((g) => {
          const list = tasks.filter((t) => t.goalId === g.id);
          const done = list.filter((t) => t.completions[today]).length;
          return (
            <View key={g.id} style={{ gap: 8 }}>
              <View style={ui.row}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.color }} />
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                  ЦЕЛЬ «{g.title.toUpperCase()}» · {done} ИЗ {list.length} ЗАДАЧ
                </Text>
              </View>
              {list.length === 0 ? <Small style={{ fontSize: 12 }}>Задач нет</Small> : null}
              {list.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  goal={g}
                  showGoal={false}
                  accent
                  done={!!t.completions[today]}
                  onToggle={() => actions.toggleTask(t.id, today)}
                />
              ))}
            </View>
          );
        })}
    </Screen>
  );
}
