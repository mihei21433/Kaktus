import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';

import { FitnessNormsCard } from '@/components/fitness-norms';
import { LoadState } from '@/components/mod-ui';
import { TeamCard } from '@/components/stream-team';
import { TemplateCard } from '@/components/stream-template';
import { api, ApiError } from '@/data/api';
import { StreamRole, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { Stream, streamHorizons } from '@/data/types';
import { Button, Caption, Card, Chip, ConfirmDialog, Header, RowLink, Screen, Small, Toggle, ui } from '@/ui';
import { addDays, formatDayMonth, plural, todayKey } from '@/lib/date';
import { colors, font } from '@/theme';

type Settings = Stream & { requireApproval: boolean; targetIndex: number; myRole: StreamRole };
type ModuleKey = keyof Stream['modules'];

const MODULES: { key: ModuleKey; title: string; sub: string }[] = [
  { key: 'statements', title: 'Утренние заявления', sub: 'текстом · ежедневно' },
  { key: 'steps', title: 'Шаги и физнормативы', sub: 'порог и нормативы потока' },
  { key: 'goals', title: 'Цели по срокам', sub: 'промежуточные цели · сроки ниже' },
  { key: 'analyses', title: 'Анализы и индекс здоровья', sub: 'замеры, нормы, индекс' },
];

export default function StreamSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Settings>(`/v1/mod/streams/${id}`);
  const [threshold, setThreshold] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState<ModuleKey | null>(null);
  const [newCode, setNewCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [times, setTimes] = useState<{ morning?: string; evening?: string }>({});

  const patch = async (body: object) => {
    try {
      await api('PATCH', `/v1/mod/streams/${id}`, body);
      await reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    }
  };

  return (
    <Screen header={<Header title="Настройки потока" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Text style={font.h2}>{data.name}</Text>
          <Card style={{ gap: 10 }}>
            <Caption color={colors.blue}>Код-приглашение</Caption>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 4 }}>{data.code}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title={copied ? 'Скопировано' : 'Скопировать'}
                variant="secondary"
                small
                style={{ flex: 1 }}
                onPress={async () => {
                  await Clipboard.setStringAsync(data.code);
                  setCopied(true);
                }}
              />
              <Button
                title="Поделиться"
                variant="secondary"
                small
                style={{ flex: 1 }}
                onPress={() =>
                  Share.share({
                    message: `Приглашаю в ${data.name} в приложении «Кактус». Нажмите «Вступить по коду» и введите код: ${data.code}`,
                  })
                }
              />
              {data.myRole === 'owner' ? (
                <Button title="Новый код" variant="secondary" small style={{ flex: 1 }} onPress={() => setNewCode(true)} />
              ) : null}
            </View>
          </Card>

          <Caption>Команда модераторов</Caption>
          <TeamCard streamId={id} />

          {data.myRole !== 'owner' ? (
            <Card borderColor="#5A4520" background={colors.orangeDim}>
              <Small color={colors.text}>Правила, нормы, замеры и напоминания потока меняет владелец — {data.moderator}.</Small>
            </Card>
          ) : (
          <>
          <Caption>Правила потока</Caption>
          <Card style={{ gap: 14 }}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15 }}>Подтверждение заявок</Text>
                <Small style={{ fontSize: 12 }}>{data.requireApproval ? 'Вы одобряете каждого' : 'Вступают сразу по коду'}</Small>
              </View>
              <Toggle value={data.requireApproval} onChange={(v) => patch({ requireApproval: v })} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Порог шагов в день</Text>
              <View style={ui.row}>
                <TextInput
                  value={threshold ?? String(data.stepsThreshold)}
                  onChangeText={(v) => setThreshold(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  style={{ flex: 1, height: 42, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
                />
                <Button
                  title="Сохранить"
                  variant="blue"
                  small
                  disabled={threshold === null || threshold === String(data.stepsThreshold) || !threshold}
                  onPress={async () => {
                    await patch({ stepsThreshold: Number(threshold) });
                    setThreshold(null);
                  }}
                />
              </View>
            </View>
            <Small style={{ fontSize: 12 }}>
              Срок потока: {data.durationDays} дней, цели — до {data.goalDeadline}
            </Small>
          </Card>

          <Caption>Цели</Caption>
          <Card style={{ paddingVertical: 0 }}>
            <RowLink
              title="Сроки целей"
              subtitle={(() => {
                const h = streamHorizons(data);
                return `включено ${h.filter((x) => x.enabled).length} из ${h.length}: ${h.filter((x) => x.enabled).map((x) => x.name).join(', ') || 'нет'}`;
              })()}
              onPress={() => router.push({ pathname: '/mod/horizons/[id]', params: { id } })}
            />
          </Card>

          <Caption>Физнормативы</Caption>
          <FitnessNormsCard streamId={id} norms={data.norms} onSaved={reload} />

          <Caption>Замеры анализов</Caption>
          <MeasurementsCard streamId={id} targetIndex={data.targetIndex} onTarget={(v) => patch({ targetIndex: v })} />
          <Card style={{ paddingVertical: 0 }}>
            <RowLink
              title="Нормы анализов"
              subtitle="свои границы для потока, выключить ненужные показатели"
              onPress={() => router.push({ pathname: '/mod/indicators/[id]', params: { id } })}
            />
          </Card>

          <Caption>Напоминания</Caption>
          <RemindersCard
            value={data.reminders ?? { enabled: true, morning: '09:00', evening: '21:00' }}
            draft={times}
            onDraft={setTimes}
            onSave={async (body) => {
              await patch({ reminders: body });
              setTimes({});
            }}
          />

          <Caption>Модули программы</Caption>
          <Card style={{ gap: 14 }}>
            {MODULES.map((m) => (
              <View key={m.key} style={[ui.row, { justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15 }}>{m.title}</Text>
                  <Small style={{ fontSize: 12 }}>{m.sub}</Small>
                </View>
                <Toggle
                  value={data.modules[m.key]}
                  onChange={(v) => (v ? patch({ modules: { [m.key]: true } }) : setTurningOff(m.key))}
                />
              </View>
            ))}
          </Card>
          <Card borderColor="#5A4520" background={colors.orangeDim}>
            <Small color={colors.text}>Выключенный модуль исчезает у участников. Данные сохраняются.</Small>
          </Card>
          <Caption>Шаблон</Caption>
          <TemplateCard streamId={id} streamName={data.name} onApplied={reload} />
          </>
          )}

          <ConfirmDialog
            visible={!!turningOff}
            title={`Выключить «${MODULES.find((m) => m.key === turningOff)?.title}»?`}
            message="Выключенный модуль исчезает у участников. Данные сохраняются."
            confirmLabel="Выключить"
            onCancel={() => setTurningOff(null)}
            onConfirm={() => {
              const k = turningOff!;
              setTurningOff(null);
              void patch({ modules: { [k]: false } });
            }}
          />
          <ConfirmDialog
            visible={newCode}
            title="Выпустить новый код?"
            message="Старый код перестанет работать. Участники, которые уже в потоке, останутся в нём."
            confirmLabel="Новый код"
            onCancel={() => setNewCode(false)}
            onConfirm={async () => {
              setNewCode(false);
              try {
                await api('POST', `/v1/mod/streams/${id}/new-code`);
                setCopied(false);
                await reload();
              } catch (e) {
                showError(e instanceof ApiError ? e.message : 'Не удалось выпустить код');
              }
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Время напоминаний по часовому поясу потока; пуш получает только тот, кто ещё не сделал нужное. */
function RemindersCard({
  value,
  draft,
  onDraft,
  onSave,
}: {
  value: { enabled?: boolean; morning: string; evening: string };
  draft: { morning?: string; evening?: string };
  onDraft: (d: { morning?: string; evening?: string }) => void;
  onSave: (body: { enabled?: boolean; morning?: string; evening?: string }) => Promise<void>;
}) {
  const enabled = value.enabled !== false;
  const morning = draft.morning ?? value.morning;
  const evening = draft.evening ?? value.evening;
  const changed = morning !== value.morning || evening !== value.evening;
  const valid = TIME_RE.test(morning) && TIME_RE.test(evening);
  const input = (v: string, set: (t: string) => void) => (
    <TextInput
      value={v}
      onChangeText={(t) => set(t.replace(/[^\d:]/g, '').slice(0, 5))}
      placeholder="09:00"
      placeholderTextColor={colors.textMuted}
      keyboardType="numbers-and-punctuation"
      style={{
        width: 80,
        height: 40,
        color: TIME_RE.test(v) ? colors.text : colors.red,
        backgroundColor: colors.input,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        textAlign: 'center',
        fontSize: 16,
      }}
    />
  );
  return (
    <Card style={{ gap: 12 }}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>Напоминания включены</Text>
        <Toggle value={enabled} onChange={(v) => void onSave({ enabled: v })} />
      </View>
      {enabled ? (
        <>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Утро</Text>
              <Small style={{ fontSize: 12 }}>заявление и шаги</Small>
            </View>
            {input(morning, (t) => onDraft({ ...draft, morning: t }))}
          </View>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Вечер</Text>
              <Small style={{ fontSize: 12 }}>закрыть задачи дня</Small>
            </View>
            {input(evening, (t) => onDraft({ ...draft, evening: t }))}
          </View>
          {changed ? (
            <Button title={valid ? 'Сохранить время' : 'Время в формате ЧЧ:ММ'} variant="blue" small disabled={!valid} onPress={() => onSave({ morning, evening })} />
          ) : null}
        </>
      ) : null}
      <Small style={{ fontSize: 12 }}>
        Время — по часовому поясу потока. Напоминание приходит только тем, кто ещё не прислал заявление и шаги (утром) или не
        закрыл задачи (вечером), не чаще раза в день.
      </Small>
    </Card>
  );
}

type MeasurementRow = { id: string; name: string; opensOn: string; deadline: string; closedAt: string | null; submitted: number };

/** Замеры: модератор открывает период сдачи анализов со сроком и закрывает его. */
function MeasurementsCard({ streamId, targetIndex, onTarget }: { streamId: string; targetIndex: number; onTarget: (v: number) => Promise<void> }) {
  const { showError } = useApp();
  const list = useQuery<MeasurementRow[]>(`/v1/mod/streams/${streamId}/measurements`);
  const [name, setName] = useState('');
  const [days, setDays] = useState(14);
  const [closing, setClosing] = useState<MeasurementRow | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const create = async () => {
    try {
      await api('POST', `/v1/mod/streams/${streamId}/measurements`, { name: name.trim(), deadline: addDays(todayKey(), days) });
      setName('');
      await list.reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось открыть замер');
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      {list.data?.length === 0 ? <Small>Замеров ещё не было. Откройте первый — участники увидят на «Сегодня» просьбу сдать анализы.</Small> : null}
      {list.data?.map((m) => (
        <View key={m.id} style={[ui.row, { justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{m.name}</Text>
            <Small style={{ fontSize: 12 }}>
              {m.closedAt ? 'закрыт' : `открыт до ${formatDayMonth(m.deadline)}`} · залили {m.submitted}
            </Small>
          </View>
          {!m.closedAt ? <Button title="Закрыть" variant="secondary" small onPress={() => setClosing(m)} /> : null}
        </View>
      ))}
      <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>Новый замер</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Например: Осенний замер"
          placeholderTextColor={colors.textMuted}
          style={{ height: 42, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
        />
        <Small style={{ fontSize: 12 }}>Срок сдачи — через</Small>
        <View style={ui.row}>
          {[7, 14, 30].map((d) => (
            <Chip key={d} label={`${d} ${plural(d, ['день', 'дня', 'дней'])}`} color={colors.blue} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </View>
        <Button title="Открыть замер" variant="blue" small disabled={!name.trim()} onPress={create} />
      </View>
      <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
        <Text style={{ color: colors.text, fontSize: 15 }}>Целевой индекс здоровья, %</Text>
        <View style={ui.row}>
          <TextInput
            value={target ?? String(targetIndex)}
            onChangeText={(v) => setTarget(v.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            style={{ flex: 1, height: 42, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
          />
          <Button
            title="Сохранить"
            variant="blue"
            small
            disabled={!target || target === String(targetIndex) || Number(target) < 10 || Number(target) > 100}
            onPress={async () => {
              await onTarget(Number(target));
              setTarget(null);
            }}
          />
        </View>
      </View>
      <ConfirmDialog
        visible={!!closing}
        title={`Закрыть замер «${closing?.name ?? ''}»?`}
        message="Участники больше не смогут загружать в него бланки и менять значения. Залитые результаты сохранятся."
        confirmLabel="Закрыть замер"
        onCancel={() => setClosing(null)}
        onConfirm={async () => {
          const m = closing!;
          setClosing(null);
          try {
            await api('POST', `/v1/mod/measurements/${m.id}/close`);
            await list.reload();
          } catch (e) {
            showError(e instanceof ApiError ? e.message : 'Не удалось закрыть');
          }
        }}
      />
    </Card>
  );
}
