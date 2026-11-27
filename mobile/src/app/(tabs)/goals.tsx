import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { goalProgress, tasksForDate, useApp } from '@/data/store';
import { Horizon, InterimGoal, StreamHorizon, streamHorizons } from '@/data/types';
import { addDays, diffDays, plural, todayKey } from '@/lib/date';
import { Button, Caption, Card, Chip, LinkButton, ProgressBar, Screen, Segmented, Small, Tag, ui } from '@/ui';
import { colors, font } from '@/theme';

type View_ = 'list' | 'overview';

export default function GoalsScreen() {
  const [view, setView] = useState<View_>('list');
  return (
    <Screen inTabs>
      <Text style={font.h2}>Цели</Text>
      <Segmented<View_>
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: 'Список' },
          { value: 'overview', label: 'Обзор' },
        ]}
      />
      {view === 'list' ? <GoalList /> : <Overview />}
    </Screen>
  );
}

function openGoal(id: string) {
  router.push({ pathname: '/goal/[id]', params: { id } });
}

function GoalList() {
  const { state } = useApp();
  const stream = state.membership.stream!;
  const today = todayKey();
  const tasks = tasksForDate(state.tasks, today);
  return (
    <>
      <Small>Цели программы — заполните, к чему придёте. Задачи ставятся внутри цели.</Small>
      {state.goals.map((g) => {
        const p = Math.round(goalProgress(g) * 100);
        const own = tasks.filter((t) => t.goalId === g.id);
        return (
          <Card key={g.id} style={{ gap: 8 }} onPress={() => openGoal(g.id)}>
            <View style={ui.row}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: g.color }} />
              <Text style={[font.title, { flex: 1 }]}>{g.title}</Text>
              {g.custom ? <Tag label="своя" color={colors.textSecondary} /> : null}
              {g.result ? (
                <Text style={{ color: colors.green, fontSize: 12, fontWeight: '600' }}>
                  до {stream.goalDeadline} · {p} %
                </Text>
              ) : (
                <Tag label="НЕ ЗАПОЛНЕНО" color={colors.orange} />
              )}
            </View>
            {g.result ? (
              <>
                <View style={{ backgroundColor: colors.input, borderRadius: 8, padding: 10 }}>
                  <Text style={{ color: colors.text, fontSize: 14 }}>{g.result}</Text>
                </View>
                <ProgressBar value={p / 100} />
                <Small style={{ fontSize: 11 }}>
                  {own.length} {plural(own.length, ['задача', 'задачи', 'задач'])} внутри цели · {own.filter((t) => t.completions[today]).length} сделано сегодня
                </Small>
              </>
            ) : (
              <View style={{ alignItems: 'center', gap: 4, paddingVertical: 8 }}>
                <Text style={font.title}>Результат ещё не заполнен</Text>
                <Small style={{ fontSize: 12 }}>Срок задан модератором: до {stream.goalDeadline}</Small>
                <Button title="Заполнить" small style={{ alignSelf: 'stretch', marginTop: 6 }} onPress={() => openGoal(g.id)} />
              </View>
            )}
          </Card>
        );
      })}
      <Pressable onPress={() => router.push('/goal-new')}>
        <Card borderColor={colors.green} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.green, fontWeight: '600' }}>+ Создать свою цель</Text>
          <Small style={{ fontSize: 11 }}>если разрешил модератор</Small>
        </Card>
      </Pressable>
    </>
  );
}

function daysLeft(i: InterimGoal, all: StreamHorizon[]): number {
  const days = all.find((x) => x.id === i.horizon)?.days ?? 7;
  return Math.max(0, diffDays(addDays(i.startDate, days), todayKey()));
}

function Overview() {
  const { state, actions } = useApp();
  const all = streamHorizons(state.membership.stream);
  const enabled = all.filter((h) => h.enabled);
  const [picked, setPicked] = useState<Horizon>('week');
  // выбранный срок мог выключить модератор — тогда показываем первый включённый
  const horizon = enabled.some((h) => h.id === picked) ? picked : (enabled[0]?.id ?? picked);
  const [open, setOpen] = useState<string | null>(null);
  const [delta, setDelta] = useState('');
  const filled = state.goals.filter((g) => g.result).length;
  const list = state.interim.filter((i) => i.horizon === horizon);
  const hLabel = all.find((h) => h.id === horizon)?.name ?? '';

  return (
    <>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={font.title}>Мои цели программы</Text>
          <Tag label={`${filled} / ${state.goals.length} заполнено`} color={colors.orange} />
        </View>
        {state.goals.map((g) => (
          <Pressable key={g.id} onPress={() => openGoal(g.id)} style={[ui.row, { paddingVertical: 4 }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.color }} />
            <Text style={{ color: colors.text, flex: 1 }}>{g.title}</Text>
            <Text style={{ color: g.result ? g.color : colors.orange, fontSize: 12, fontWeight: '600' }}>
              {g.result ? `${Math.round(goalProgress(g) * 100)} %` : 'не заполнено'}
            </Text>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <LinkButton title="+ Создать свою цель" onPress={() => router.push('/goal-new')} />
          <Small style={{ fontSize: 11 }}>если разрешил модератор</Small>
        </View>
      </Card>

      {enabled.length ? (
        <>
      <Caption>Задачи внутри целей · {hLabel}</Caption>
      <View style={ui.wrap}>
        {enabled.map((h) => (
          <Chip key={h.id} label={h.name} selected={horizon === h.id} color={colors.text} onPress={() => setPicked(h.id)} />
        ))}
      </View>
      {list.length === 0 ? <Small style={{ fontSize: 12 }}>На срок «{hLabel}» целей пока нет</Small> : null}
      {list.map((i) => {
        const g = state.goals.find((x) => x.id === i.goalId);
        const left = daysLeft(i, all);
        const expanded = open === i.id;
        return (
          <Card key={i.id} style={{ gap: 10 }} onPress={() => setOpen(expanded ? null : i.id)}>
            <View style={ui.row}>
              <View style={{ backgroundColor: colors.greenDim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8, minWidth: 44, alignItems: 'center' }}>
                <Text style={{ color: colors.green, fontSize: 11, fontWeight: '700' }}>
                  {i.progress}/{i.target ?? '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={font.title}>{i.text}</Text>
                <Small style={{ fontSize: 11 }}>
                  <Text style={{ color: g?.color }}>{g?.title}</Text> · осталось {left} {plural(left, ['день', 'дня', 'дней'])}
                </Small>
              </View>
            </View>
            {expanded ? (
              <View style={{ gap: 8 }}>
                <Caption>Отметить продвижение</Caption>
                <View style={ui.row}>
                  <TextInput
                    value={delta}
                    onChangeText={(v) => setDelta(v.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    placeholder={String(i.progress)}
                    placeholderTextColor={colors.textMuted}
                    style={{ flex: 1, height: 40, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
                  />
                  <Small>
                    из {i.target} {i.unit}
                  </Small>
                  <Chip label="+1" onPress={() => setDelta(String((Number(delta) || i.progress) + 1))} />
                </View>
                <Button
                  title="Сохранить"
                  small
                  disabled={!delta}
                  onPress={() => {
                    actions.setInterimProgress(i.id, Number(delta));
                    setDelta('');
                    setOpen(null);
                  }}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
      <Pressable
        onPress={() => router.push({ pathname: '/interim-new', params: { horizon } })}
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 }}>
        <Text style={{ color: colors.textSecondary }}>
          <Text style={{ color: colors.green }}>+ </Text>Поставить цель на срок
        </Text>
      </Pressable>
        </>
      ) : null}
    </>
  );
}
