/** Сроки целей потока: базовые можно выключить, свои — создать, выключить и удалить (если на них нет целей). */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { api, ApiError } from '@/data/api';
import { useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { StreamHorizon } from '@/data/types';
import { plural } from '@/lib/date';
import { Button, Caption, Card, ConfirmDialog, Header, LinkButton, Screen, Small, Tag, Toggle, ui } from '@/ui';
import { colors } from '@/theme';

type Row = StreamHorizon & { goals: number };

const goalsLabel = (n: number) => `${n} ${plural(n, ['цель', 'цели', 'целей'])}`;
const lengthLabel = (d: number) => `${d} ${plural(d, ['день', 'дня', 'дней'])}`;

export default function HorizonsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Row[]>(`/v1/mod/streams/${id}/horizons`);
  const [turningOff, setTurningOff] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const call = async (method: string, path: string, body?: object) => {
    try {
      await api(method, `/v1/mod/streams/${id}/horizons${path}`, body);
      await reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    }
  };
  const toggle = (h: Row, v: boolean) => (!v && h.goals ? setTurningOff(h) : void call('PATCH', `/${h.id}`, { enabled: v }));

  const card = (h: Row) => (
    <Card key={h.id} style={{ gap: 8 }}>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: h.enabled ? colors.text : colors.textMuted, fontSize: 15, fontWeight: '600' }}>{h.name}</Text>
          <Small style={{ fontSize: 12 }}>
            {lengthLabel(h.days)} · {h.enabled ? 'виден участникам' : 'скрыт от участников'}
          </Small>
        </View>
        <Toggle value={h.enabled} onChange={(v) => toggle(h, v)} />
      </View>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Tag label={goalsLabel(h.goals)} color={h.goals ? colors.green : colors.textSecondary} />
        {!h.base && !h.goals ? <LinkButton title="Удалить" color={colors.red} onPress={() => setDeleting(h)} /> : null}
      </View>
    </Card>
  );

  return (
    <Screen
      header={<Header title="Сроки целей" onBack={() => router.back()} rightIcon="add" rightColor={colors.blue} onRight={() => router.push({ pathname: '/mod/horizon-new', params: { stream: id } })} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Small>
            На эти сроки участник ставит промежуточные цели на экране «Цели». Срок отсчитывается с дня, когда участник поставил цель.
          </Small>
          <Caption>Базовые сроки</Caption>
          <Small style={{ fontSize: 12 }}>Базовый срок можно выключить, но не удалить — цели в нём сохраняются.</Small>
          {data.filter((h) => h.base).map(card)}
          <Caption>Свои сроки</Caption>
          {data.some((h) => !h.base) ? null : <Small style={{ fontSize: 12 }}>Например, «Спринт 21 день» или «Марафон 3 дня».</Small>}
          {data.filter((h) => !h.base).map(card)}
          <Button title="+ Создать срок" variant="blue" onPress={() => router.push({ pathname: '/mod/horizon-new', params: { stream: id } })} />
          <Small style={{ fontSize: 12 }}>Свой срок, на который уже поставили цели, удалить нельзя — только выключить.</Small>
        </>
      ) : null}

      <ConfirmDialog
        visible={!!turningOff}
        title={`Выключить срок «${turningOff?.name ?? ''}»?`}
        message={`Затронет ${goalsLabel(turningOff?.goals ?? 0)} участников. Выключенный срок исчезает у участников: пропадает из строки сроков, в нём нельзя ставить новые цели. Данные сохраняются — при обратном включении всё вернётся.`}
        confirmLabel="Выключить"
        onCancel={() => setTurningOff(null)}
        onConfirm={() => {
          const h = turningOff!;
          setTurningOff(null);
          void call('PATCH', `/${h.id}`, { enabled: false });
        }}
      />
      <ConfirmDialog
        visible={!!deleting}
        title={`Удалить срок «${deleting?.name ?? ''}»?`}
        message="Срок исчезнет из настроек потока. Целей на нём нет, поэтому участники ничего не потеряют."
        confirmLabel="Удалить"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const h = deleting!;
          setDeleting(null);
          void call('DELETE', `/${h.id}`);
        }}
      />
    </Screen>
  );
}
