import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TaskRow } from '@/components/task-row';
import { goalProgress, tasksForDate, useApp } from '@/data/store';
import { HORIZONS } from '@/data/types';
import { diffDays, formatDayMonth, formatNumber, formatTime, todayKey } from '@/lib/date';
import { Caption, Card, Ionicons, LinkButton, ProgressBar, Screen, Small, Stat } from '@/ui';
import { colors, font } from '@/theme';

export default function TodayScreen() {
  const { state, actions } = useApp();
  const today = todayKey();
  const stream = state.membership.stream!;
  const day = Math.min(stream.durationDays, diffDays(today, stream.startDate) + 1);
  const tasks = tasksForDate(state.tasks, today);
  const doneCount = tasks.filter((t) => t.completions[today]).length;
  const goalById = (id: string) => state.goals.find((g) => g.id === id);
  const statement = state.statements[today];
  const steps = state.steps[today];

  const mainGoal = state.goals[0];
  const weekly = state.interim.find((i) => i.goalId === mainGoal?.id && i.horizon === 'week');

  return (
    <Screen inTabs>
      <View>
        <Text style={font.h1}>{formatDayMonth(today)}</Text>
        <Small>
          День {day} из {stream.durationDays} · {stream.name}
        </Small>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Text style={font.title}>Задачи дня</Text>
          <Small style={{ fontSize: 12 }}>
            {doneCount} из {tasks.length} выполнено
          </Small>
        </View>
        <LinkButton title="Все задачи ›" onPress={() => router.push('/tasks')} />
      </View>

      {tasks.length === 0 ? (
        <Small>Задач на сегодня нет</Small>
      ) : (
        tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            goal={goalById(t.goalId)}
            done={!!t.completions[today]}
            onToggle={() => actions.toggleTask(t.id, today)}
          />
        ))
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {stream.modules.statements ? (
          <Stat
            label="Заявление"
            value={statement ? 'Отправлено' : 'Не отправлено'}
            sub={statement ? `${statement.kind === 'voice' ? 'голос' : 'текст'} · в ${formatTime(statement.sentAt)}` : 'голосом, до 2 мин · в любое время'}
            onPress={() => router.push('/statement')}
          />
        ) : null}
        {stream.modules.steps ? (
          <Stat
            label="Шаги"
            value={steps ? formatNumber(steps) : '0'}
            sub={(steps ?? 0) >= stream.stepsThreshold ? 'порог выполнен' : `до порога ${formatNumber(stream.stepsThreshold)}`}
            subColor={colors.orange}
            onPress={() => router.push('/steps')}>
            <View style={{ marginTop: 6 }}>
              <ProgressBar value={(steps ?? 0) / stream.stepsThreshold} color={colors.orange} height={4} />
            </View>
          </Stat>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Задачи" value={`${doneCount} из ${tasks.length}`} onPress={() => router.push('/day-plan')} />
        <View style={{ flex: 1 }} />
      </View>

      {mainGoal ? (
        mainGoal.result ? (
          <Card
            background={colors.greenDim}
            borderColor="#2C5A3C"
            onPress={() => router.push({ pathname: '/goal/[id]', params: { id: mainGoal.id } })}
            style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Caption color={colors.green}>
                Главная цель · {mainGoal.title}
                {weekly ? ' · Неделя' : ''}
              </Caption>
              <Caption color={colors.text}>{Math.round(goalProgress(mainGoal) * 100)} %</Caption>
            </View>
            <Text style={[font.title, { fontSize: 17 }]}>{mainGoal.result}</Text>
            <ProgressBar value={goalProgress(mainGoal)} />
            {weekly ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Small style={{ fontSize: 12 }}>
                  {HORIZONS.find((h) => h.value === weekly.horizon)?.label}: {weekly.text}
                </Small>
                <Small style={{ fontSize: 12 }} color={colors.green}>
                  {weekly.progress}/{weekly.target}
                </Small>
              </View>
            ) : null}
          </Card>
        ) : (
          <Pressable onPress={() => router.push({ pathname: '/goal/[id]', params: { id: mainGoal.id } })}>
            <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[font.body, { flex: 1, fontSize: 14 }]}>
                <Text style={{ fontWeight: '700' }}>{mainGoal.title}</Text>
                <Text style={{ color: colors.textSecondary }}> · результат не заполнен</Text>
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Card>
          </Pressable>
        )
      ) : null}
    </Screen>
  );
}
