/** Норма одного показателя для потока: границы (общие или для женщин и мужчин), учитывать ли показатель. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { api, ApiError } from '@/data/api';
import { IndicatorNorm, Range, rangeLabel, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { Button, Caption, Card, ConfirmDialog, Header, Screen, Small, Toggle, ui } from '@/ui';
import { colors, font } from '@/theme';

type Draft = { lo: string; hi: string };
type Key = 'norm' | 'female' | 'male';

const toDraft = (r: Range | null | undefined): Draft => ({
  lo: r?.lo !== undefined ? String(r.lo).replace('.', ',') : '',
  hi: r?.hi !== undefined ? String(r.hi).replace('.', ',') : '',
});
const parseNum = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));

/** null — пусто (норма не задана), 'bad' — ошибка ввода. */
function toRange(d: Draft): Range | null | 'bad' {
  const lo = parseNum(d.lo);
  const hi = parseNum(d.hi);
  if (lo === undefined && hi === undefined) return null;
  if ((lo !== undefined && !(lo >= 0)) || (hi !== undefined && !(hi >= 0))) return 'bad';
  if (lo !== undefined && hi !== undefined && lo >= hi) return 'bad';
  return { ...(lo !== undefined ? { lo } : {}), ...(hi !== undefined ? { hi } : {}) };
}
const same = (a: Range | null | undefined, b: Range | null | undefined) => (a?.lo ?? null) === (b?.lo ?? null) && (a?.hi ?? null) === (b?.hi ?? null);

export default function IndicatorEditScreen() {
  const { stream, ind } = useLocalSearchParams<{ stream: string; ind: string }>();
  const { data, error, loading, reload } = useQuery<IndicatorNorm[]>(`/v1/mod/streams/${stream}/indicators`);
  const item = data?.find((i) => i.id === ind);
  return (
    <Screen header={<Header title="Норма показателя" onBack={() => router.back()} />}>
      {!item ? <LoadState loading={loading} error={error ?? (data ? 'Показатель не найден' : null)} onRetry={reload} /> : null}
      {item ? <Editor key={JSON.stringify(item)} streamId={stream} item={item} /> : null}
    </Screen>
  );
}

function Editor({ streamId, item }: { streamId: string; item: IndicatorNorm }) {
  const { showError } = useApp();
  const keys: Key[] = item.bySex ? ['female', 'male'] : ['norm'];
  const [on, setOn] = useState(!item.off);
  const [draft, setDraft] = useState<Record<Key, Draft>>({
    norm: toDraft(item.current.norm),
    female: toDraft(item.current.female),
    male: toDraft(item.current.male),
  });
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  const ranges = Object.fromEntries(keys.map((k) => [k, toRange(draft[k])])) as Record<Key, Range | null | 'bad'>;
  // Общей норме нужна хотя бы одна граница; у женской нормы «по фазе цикла» поле можно оставить пустым
  const invalid = keys.some((k) => ranges[k] === 'bad' || (ranges[k] === null && !(k === 'female' && item.cycle)));

  const save = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { off: !on };
      for (const k of keys) {
        const r = ranges[k];
        if (r && r !== 'bad' && !same(r, item.default[k])) body[k] = r;
      }
      await api('PUT', `/v1/mod/streams/${streamId}/indicators/${item.id}`, body);
      router.back();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    try {
      await api('DELETE', `/v1/mod/streams/${streamId}/indicators/${item.id}`);
      router.back();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сбросить');
    }
  };

  const field = (k: Key, side: 'lo' | 'hi') => (
    <TextInput
      value={draft[k][side]}
      onChangeText={(v) => setDraft({ ...draft, [k]: { ...draft[k], [side]: v.replace(/[^\d.,]/g, '').slice(0, 9) } })}
      keyboardType="decimal-pad"
      placeholder={side === 'lo' ? 'от' : 'до'}
      placeholderTextColor={colors.textMuted}
      style={{
        flex: 1,
        minWidth: 0,
        height: 42,
        color: ranges[k] === 'bad' ? colors.red : colors.text,
        backgroundColor: colors.input,
        borderRadius: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: colors.border,
        fontSize: 16,
      }}
    />
  );

  const LABEL: Record<Key, string> = { norm: 'Норма', female: 'Норма для женщин', male: 'Норма для мужчин' };

  return (
    <>
      <Text style={font.h2}>{item.name}</Text>
      <Small>
        {item.group} · {item.unit}
      </Small>

      <Card style={[ui.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Учитывать показатель</Text>
          <Small style={{ fontSize: 12 }}>{on ? 'Есть в панели участника и в индексе' : 'Скрыт у участников, не снижает индекс'}</Small>
        </View>
        <Toggle value={on} onChange={setOn} />
      </Card>

      {on
        ? keys.map((k) => (
            <View key={k} style={{ gap: 6 }}>
              <Caption>{LABEL[k]}</Caption>
              <View style={ui.row}>
                {field(k, 'lo')}
                <Text style={{ color: colors.textMuted }}>–</Text>
                {field(k, 'hi')}
              </View>
              <Small style={{ fontSize: 12 }}>
                Общая: {rangeLabel(item.default[k])} {item.unit}
                {k === 'female' && item.cycle ? '. Пусто — норму по фазе цикла оценивает модератор, в индекс показатель не входит' : ''}
              </Small>
            </View>
          ))
        : null}
      <Small style={{ fontSize: 12 }}>Можно указать только одну границу: «до 5» — значит меньше 5, «от 1» — больше 1.</Small>

      <Button title={busy ? 'Сохраняем…' : invalid && on ? 'Проверьте границы' : 'Сохранить'} variant="blue" disabled={busy || (on && invalid)} onPress={save} />
      {item.changed || item.off ? <Button title="Вернуть общую норму" variant="secondary" onPress={() => setResetting(true)} /> : null}

      <ConfirmDialog
        visible={resetting}
        title="Вернуть общую норму?"
        message="Показатель снова будет учитываться с нормой по умолчанию. Статусы и индекс участников пересчитаются."
        confirmLabel="Вернуть"
        onCancel={() => setResetting(false)}
        onConfirm={() => {
          setResetting(false);
          void reset();
        }}
      />
    </>
  );
}
