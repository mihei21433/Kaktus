import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Avatar, LabelTag, LoadState } from '@/components/mod-ui';
import { VoicePlayer } from '@/components/voice-player';
import { DISCLAIMER, IndexCard, IndicatorRow, SummaryTiles } from '@/components/analyses-ui';
import { type Analyses, errorText, latestWithValues, openBlank } from '@/data/analyses';
import { api, ApiError } from '@/data/api';
import { DayView, Dossier, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { HORIZONS } from '@/data/types';
import { mmss } from '@/lib/audio';
import { formatDayMonth, formatNumber, formatTime, plural } from '@/lib/date';
import { Button, Caption, Card, Chip, ConfirmDialog, Header, Ionicons, ProgressBar, Screen, Small, Stat, Tag, ui } from '@/ui';
import { colors, font } from '@/theme';

type Tab = 'overview' | 'tasks' | 'goals' | 'steps' | 'statements' | 'analyses';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Обзор' },
  { value: 'tasks', label: 'Задачи' },
  { value: 'goals', label: 'Цели' },
  { value: 'steps', label: 'Шаги' },
  { value: 'statements', label: 'Заявления' },
  { value: 'analyses', label: 'Анализы' },
];

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);

export default function DossierScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Dossier>(`/v1/mod/members/${id}`);
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmBlock, setConfirmBlock] = useState(false);

  const toggleBlock = async () => {
    if (!data) return;
    try {
      await api('POST', `/v1/mod/memberships/${id}/${data.member.blocked ? 'unblock' : 'block'}`);
      await reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось изменить доступ');
    }
  };

  return (
    <Screen header={<Header title="Досье" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <View style={[ui.row, { gap: 12 }]}>
            <Avatar name={data.member.name} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={[ui.row, { gap: 6 }]}>
                <Text style={font.h2} numberOfLines={1}>
                  {data.member.name}
                </Text>
                <LabelTag label={data.stats.label} blocked={data.member.blocked} />
              </View>
              <Small style={{ fontSize: 12 }}>
                {data.stats.dayInStream === 1 ? 'первый день в потоке' : `${data.stats.dayInStream}-й день в потоке`} · {data.member.contact}
              </Small>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {TABS.map((t) => (
              <Chip key={t.value} label={t.label} color={colors.blue} selected={tab === t.value} onPress={() => setTab(t.value)} />
            ))}
          </ScrollView>

          {tab === 'overview' ? <OverviewTab d={data} /> : null}
          {tab === 'tasks' ? <TasksTab d={data} /> : null}
          {tab === 'goals' ? <GoalsTab d={data} /> : null}
          {tab === 'steps' ? <StepsTab d={data} /> : null}
          {tab === 'statements' ? <StatementsTab d={data} /> : null}
          {tab === 'analyses' ? <AnalysesTab memberId={id} /> : null}

          {!data.member.blocked ? (
            <Button title="Поставить задачу" variant="blue" onPress={() => router.push({ pathname: '/mod/assign/[id]', params: { id } })} />
          ) : null}
          <Button
            title={data.member.blocked ? 'Разблокировать участника' : 'Заблокировать участника'}
            variant="secondary"
            onPress={() => (data.member.blocked ? toggleBlock() : setConfirmBlock(true))}
          />
          <ConfirmDialog
            visible={confirmBlock}
            title="Заблокировать участника?"
            message={`${data.member.name} потеряет доступ к потоку: не сможет отмечать задачи, отправлять шаги и заявления. Данные сохранятся и вернутся после разблокировки.`}
            confirmLabel="Заблокировать"
            onCancel={() => setConfirmBlock(false)}
            onConfirm={() => {
              setConfirmBlock(false);
              void toggleBlock();
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

function OverviewTab({ d }: { d: Dossier }) {
  const s = d.stats;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Задачи" value={pct(s.taskRate)} />
        <Stat label="Заявления" value={`${s.statementsSent}/${s.statementDays}`} sub="за период" />
        <Stat label="Шаги в среднем" value={s.avgSteps === null ? '—' : `${(s.avgSteps / 1000).toFixed(1)} тыс.`} />
      </View>
      <Card style={{ gap: 10 }}>
        <Text style={font.title}>Цели и сроки</Text>
        {d.interim.length === 0 ? (
          <Small>У участника нет промежуточных целей. Они появятся, когда участник или модератор их поставит.</Small>
        ) : (
          d.interim.map((i) => (
            <View key={i.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                  {HORIZONS.find((h) => h.value === i.horizon)?.label} · {i.text}
                </Text>
                <Small style={{ fontSize: 12 }}>{i.target ? `${Math.round((i.progress / i.target) * 100)} %` : i.progress}</Small>
              </View>
              <ProgressBar value={i.target ? i.progress / i.target : 0} color={colors.blue} height={4} />
            </View>
          ))
        )}
      </Card>
      <Card style={{ gap: 10 }}>
        <Row label="Последняя активность" value={s.lastActivity ? formatDayMonth(s.lastActivity) : 'не было'} />
        <Row label="Серия активных дней" value={`${s.streak} ${plural(s.streak, ['день', 'дня', 'дней'])}`} />
        <Row label="Просрочено задач" value={String(s.overdue)} valueColor={s.overdue ? colors.red : undefined} />
        <Row label="Дней ниже порога шагов" value={String(s.stepsBelow)} />
      </Card>
      {d.member.contract || d.member.about ? (
        <Card style={{ gap: 6 }}>
          {d.member.contract ? (
            <>
              <Caption color={colors.green}>Личный контракт</Caption>
              <Text style={{ color: colors.text, fontSize: 13 }}>{d.member.contract}</Text>
            </>
          ) : null}
          {d.member.about ? (
            <>
              <Caption style={{ marginTop: 6 }}>О себе</Caption>
              <Text style={{ color: colors.text, fontSize: 13 }}>{d.member.about}</Text>
            </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Small>{label}</Small>
      <Text style={{ color: valueColor ?? colors.text, fontSize: 13, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}

type TaskFilter = 'all' | 'moderator' | 'undone';

function TasksTab({ d }: { d: Dossier }) {
  const [f, setF] = useState<TaskFilter>('all');
  const pick = (day: DayView) =>
    day.tasks.filter((t) => (f === 'all' ? true : f === 'moderator' ? t.fromModerator : !t.done));
  const days = d.days.filter((day) => pick(day).length);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Выполнение" value={pct(d.stats.taskRate)} />
        <Stat label="Серия" value={String(d.stats.streak)} />
        <Stat label="Просрочено" value={String(d.stats.overdue)} />
      </View>
      <View style={ui.wrap}>
        <Chip label="Все" color={colors.blue} selected={f === 'all'} onPress={() => setF('all')} />
        <Chip label="От модератора" color={colors.blue} selected={f === 'moderator'} onPress={() => setF('moderator')} />
        <Chip label="Не сделано" color={colors.blue} selected={f === 'undone'} onPress={() => setF('undone')} />
      </View>
      {days.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 20 }}>
          <Text style={font.title}>За этот период задач нет</Text>
          <Small style={{ textAlign: 'center' }}>Список появится, как только у участника будут задачи в выбранном окне.</Small>
        </Card>
      ) : null}
      {days.map((day, idx) => {
        const list = pick(day);
        const isToday = idx === 0 && day.date === d.days[0]?.date;
        return (
          <View key={day.date} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Caption>{formatDayMonth(day.date)}</Caption>
              <Small style={{ fontSize: 11 }}>
                {day.tasks.filter((t) => t.done).length} из {day.tasks.length}
              </Small>
            </View>
            <Card style={{ gap: 8 }}>
              {list.map((t) => (
                <View key={t.id} style={[ui.row, { gap: 8 }]}>
                  <Text style={{ color: t.done ? colors.green : colors.textMuted, width: 14 }}>{t.done ? '✓' : '○'}</Text>
                  <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{t.text}</Text>
                  {t.fromModerator ? <Tag label="модератор" color={colors.blue} /> : null}
                  {t.done && t.doneAt ? <Small style={{ fontSize: 11 }}>{formatTime(t.doneAt)}</Small> : null}
                  {!t.done && !isToday ? <Tag label="ПРОПУСК" color={colors.red} /> : null}
                </View>
              ))}
            </Card>
          </View>
        );
      })}
      <Small style={{ fontSize: 11 }}>История за последние 14 дней</Small>
    </>
  );
}

function GoalsTab({ d }: { d: Dossier }) {
  return (
    <>
      <Card style={{ gap: 12 }}>
        <Caption>Глобальные цели и результаты</Caption>
        {d.goals.map((g) => (
          <View key={g.id} style={{ gap: 4 }}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <View style={[ui.row, { gap: 6, flex: 1 }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.color }} />
                <Text style={font.title}>{g.title}</Text>
                {g.custom ? <Tag label="СВОЯ ЦЕЛЬ" color={colors.green} /> : null}
              </View>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{Math.round(g.progress * 100)} %</Text>
            </View>
            <Small style={{ fontSize: 12 }}>{g.result ? `«${g.result}»` : 'Результат ещё не заполнен'}</Small>
          </View>
        ))}
      </Card>
      <Card style={{ gap: 10 }}>
        <Caption>Задачи и цели по срокам</Caption>
        {HORIZONS.map((h) => {
          const list = d.interim.filter((i) => i.horizon === h.value);
          return (
            <View key={h.value} style={{ gap: 4 }}>
              <Small style={{ fontSize: 11 }}>{h.label.toUpperCase()}</Small>
              {list.length === 0 ? <Small style={{ fontSize: 12 }}>Целей на этот срок пока нет</Small> : null}
              {list.map((i) => (
                <View key={i.id} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{i.text}</Text>
                    <Small style={{ fontSize: 12 }}>
                      {i.progress}/{i.target ?? '—'} {i.unit ?? ''}
                    </Small>
                  </View>
                  <ProgressBar value={i.target ? i.progress / i.target : 0} color={colors.blue} height={4} />
                </View>
              ))}
            </View>
          );
        })}
      </Card>
    </>
  );
}

function StepsTab({ d }: { d: Dossier }) {
  const threshold = d.stream.stepsThreshold;
  const days = [...d.days].reverse();
  const max = Math.max(threshold * 1.3, ...days.map((x) => x.steps ?? 0));
  const reported = d.days.filter((x) => x.steps !== null);
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Среднее" value={d.stats.avgSteps === null ? '—' : `${(d.stats.avgSteps / 1000).toFixed(1)} тыс.`} />
        <Stat label="Порог взят" value={`${reported.filter((x) => (x.steps ?? 0) >= threshold).length}/${reported.length}`} />
        <Stat label="Не сдано" value={String(d.days.length - reported.length)} />
      </View>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={font.title}>{d.days.length} дн.</Text>
          <Small style={{ fontSize: 11 }}>порог {formatNumber(threshold)}</Small>
        </View>
        <View style={{ height: 110, flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
          {days.map((x) => (
            <View
              key={x.date}
              style={{
                flex: 1,
                height: Math.max(x.steps ? 6 : 2, ((x.steps ?? 0) / max) * 110),
                borderRadius: 3,
                backgroundColor: x.steps === null ? colors.cardAlt : x.steps >= threshold ? colors.green : colors.borderStrong,
              }}
            />
          ))}
        </View>
      </Card>
      <Caption>Отправки</Caption>
      {reported.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
          <Text style={font.title}>Отчётных дней пока нет</Text>
          <Small style={{ textAlign: 'center' }}>Шаги за день появятся здесь, как только участник их отправит.</Small>
        </Card>
      ) : (
        <Card style={{ gap: 8 }}>
          {reported.map((x) => (
            <Row key={x.date} label={formatDayMonth(x.date)} value={formatNumber(x.steps!)} valueColor={x.steps! >= threshold ? colors.green : colors.orange} />
          ))}
        </Card>
      )}
    </>
  );
}

function StatementsTab({ d }: { d: Dossier }) {
  const list = d.days.filter((x) => x.statement);
  const voice = list.filter((x) => x.statement!.kind === 'voice');
  const texts = list.filter((x) => x.statement!.kind !== 'voice');
  const avgLen = texts.length ? Math.round(texts.reduce((n, x) => n + x.statement!.text.length, 0) / texts.length) : null;
  const avgSec = voice.length ? voice.reduce((n, x) => n + (x.statement!.durationSec ?? 0), 0) / voice.length : null;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Заявлений" value={`${list.length}/${d.days.length}`} />
        <Stat label="Средняя длина" value={avgSec !== null ? mmss(avgSec) : avgLen === null ? '—' : `${avgLen} симв.`} sub={avgSec !== null ? 'голосом' : undefined} />
      </View>
      {list.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
          <Text style={font.title}>За этот период заявлений нет</Text>
          <Small style={{ textAlign: 'center' }}>Список появится, как только участник пришлёт утреннее заявление.</Small>
        </Card>
      ) : null}
      {list.map((x) => (
        <Card key={x.date} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[font.title, { fontSize: 14 }]}>{formatDayMonth(x.date)}</Text>
            <Small style={{ fontSize: 11 }}>
              {x.statement!.kind === 'voice' ? 'голосом · ' : ''}в {formatTime(x.statement!.sentAt)}
            </Small>
          </View>
          {x.statement!.kind === 'voice' ? (
            <VoicePlayer
              linkPath={`/v1/mod/members/${d.member.id}/statements/${x.date}/audio-link`}
              durationSec={x.statement!.durationSec ?? undefined}
              accent={colors.blue}
            />
          ) : (
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{x.statement!.text}</Text>
          )}
        </Card>
      ))}
    </>
  );
}

/** Анализы участника. Открытие вкладки записывается в журнал доступа участника. */
function AnalysesTab({ memberId }: { memberId: string }) {
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Analyses>(`/v1/mod/members/${memberId}/analyses`);
  const [all, setAll] = useState(false);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const m = latestWithValues(data);
  const indexed = [...data.measurements].reverse().find((x) => x.index) ?? null;
  const withBlanks = [...data.measurements].reverse().find((x) => x.blanks.length) ?? null;
  return (
    <>
      <IndexCard m={indexed} target={data.targetIndex} />
      {!m ? (
        <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
          <Text style={font.title}>Результатов пока нет</Text>
          <Small style={{ textAlign: 'center' }}>
            {data.measurements.length ? 'Участник ещё не ввёл значения.' : 'Откройте замер в настройках потока — участник получит просьбу сдать анализы.'}
          </Small>
        </Card>
      ) : (
        <>
          <Small style={{ fontSize: 12 }}>
            {m.name} · {m.summary.filled} из {m.summary.total} показателей{m.submittedAt ? ' · залито' : ' · ещё не залито'}
            {data.sex ? '' : ' · пол не указан'}
          </Small>
          <SummaryTiles m={m} />
          <Caption>{all ? 'Все показатели' : 'Отклонения и показатели у границы'}</Caption>
          {data.catalog
            .filter((c) => (all ? !!m.values[c.id] : ['low', 'high', 'border', 'unknown'].includes(m.values[c.id]?.status ?? '')))
            .map((c) => (
              <IndicatorRow key={c.id} c={c} m={m} />
            ))}
          <Button title={all ? 'Только отклонения' : 'Показать все показатели'} variant="secondary" small onPress={() => setAll(!all)} />
        </>
      )}
      {withBlanks ? (
        <>
          <Caption>Бланки · {withBlanks.name}</Caption>
          {withBlanks.blanks.map((b) => (
            <Card
              key={b.id}
              onPress={() => openBlank(`/v1/mod/members/${memberId}/blanks/${b.id}/link`).catch((e) => showError(errorText(e, 'Не удалось открыть')))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={b.mime === 'application/pdf' ? 'document-outline' : 'image-outline'} size={18} color={colors.blue} />
              <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                {b.fileName}
              </Text>
              <Text style={{ color: colors.blue, fontWeight: '600' }}>Открыть</Text>
            </Card>
          ))}
        </>
      ) : null}
      <Small style={{ fontSize: 11 }}>{DISCLAIMER}</Small>
    </>
  );
}
