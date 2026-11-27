/**
 * «Проверка распознанного»: сервер прочитал бланки, участник сверяет каждое значение с бланком
 * и сохраняет только отмеченные. Без проверки ничего не записывается.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { errorText, fmt, recognizeBlanks, type Recognition, saveValues } from '@/data/analyses';
import { useApp } from '@/data/store';
import { Button, Card, Checkbox, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

type Row = { value: string; on: boolean };

const parseNum = (s: string) => {
  const t = s.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

export default function RecognizeScreen() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const { showError } = useApp();
  const [data, setData] = useState<Recognition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    recognizeBlanks(mid)
      .then((r) => {
        if (!alive) return;
        setData(r);
        setError(null);
        // уже введённое вручную другое значение не перезаписываем без явной отметки
        setRows(
          Object.fromEntries(
            r.found.map((f) => [f.indicatorId, { value: fmt(f.value), on: !f.current || (f.current.value === f.value && f.current.comparator === f.comparator) }]),
          ),
        );
      })
      .catch((e) => alive && setError(errorText(e, 'Не получилось распознать бланки')));
    return () => {
      alive = false;
    };
  }, [mid, attempt]);

  const chosen = data?.found.filter((f) => rows[f.indicatorId]?.on) ?? [];
  const invalid = chosen.some((f) => !(parseNum(rows[f.indicatorId].value) >= 0));

  const save = async () => {
    setBusy(true);
    try {
      await saveValues(
        mid,
        chosen.map((f) => ({ indicatorId: f.indicatorId, value: parseNum(rows[f.indicatorId].value), comparator: f.comparator })),
      );
      router.replace({ pathname: '/analyses/entry', params: { mid } });
    } catch (e) {
      showError(errorText(e, 'Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const flagged = data?.found.filter((f) => f.check).length ?? 0;

  return (
    <Screen
      header={<Header title="Проверка значений" backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        data?.found.length ? (
          <Button
            title={busy ? 'Сохраняем…' : invalid ? 'Проверьте числа' : `Сохранить ${chosen.length} знач.`}
            disabled={busy || !chosen.length || invalid}
            onPress={save}
          />
        ) : undefined
      }>
      {!data && !error ? (
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
          <ActivityIndicator color={colors.green} />
          <Text style={font.title}>Читаем бланки…</Text>
          <Small style={{ textAlign: 'center' }}>Обычно это занимает до минуты. Текст читается на сервере программы, никуда не передаётся.</Small>
        </Card>
      ) : null}

      {error ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: colors.red, fontSize: 14 }}>{error}</Text>
          <Text onPress={() => (setError(null), setAttempt((a) => a + 1))} style={{ color: colors.green, fontWeight: '600' }}>
            Повторить
          </Text>
        </Card>
      ) : null}

      {data ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text style={font.title}>
              Найдено {data.found.length} из {data.total} показателей
            </Text>
            <Small style={{ fontSize: 12 }}>
              Сверьте каждое число с бланком — распознавание может ошибиться. Сохранятся только отмеченные значения.
              {flagged ? ` Оранжевым отмечены ${flagged}, которые стоит проверить особенно внимательно.` : ''}
            </Small>
          </Card>

          {data.blanks
            .filter((b) => b.error || !b.found)
            .map((b) => (
              <Card key={b.id} borderColor="#5A4520" background={colors.orangeDim}>
                <Small color={colors.text}>
                  «{b.fileName}»: {b.error ?? 'ничего не нашли. Попробуйте сфотографировать ровнее и при хорошем свете или загрузить PDF из лаборатории.'}
                </Small>
              </Card>
            ))}

          {data.found.map((f) => {
            const row = rows[f.indicatorId];
            if (!row) return null;
            const bad = row.on && !(parseNum(row.value) >= 0);
            return (
              <Card key={f.indicatorId} borderColor={f.check ? '#5A4520' : undefined} style={{ gap: 8, opacity: row.on ? 1 : 0.6 }}>
                <Checkbox checked={row.on} onChange={(v) => set(f.indicatorId, { on: v })} label={<Text style={font.body}>{f.name}</Text>} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {f.comparator !== '=' ? <Text style={{ color: colors.text, fontSize: 18 }}>{f.comparator}</Text> : null}
                  <TextInput
                    value={row.value}
                    onChangeText={(v) => set(f.indicatorId, { value: v.replace(/[^\d.,]/g, '').slice(0, 10), on: true })}
                    keyboardType="decimal-pad"
                    style={{
                      width: 110,
                      height: 42,
                      color: bad ? colors.red : colors.text,
                      backgroundColor: colors.input,
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: f.check ? colors.orange : colors.border,
                      fontSize: 17,
                      fontWeight: '600',
                    }}
                  />
                  <Small style={{ flex: 1 }}>{f.unit}</Small>
                </View>
                {f.note ? <Small style={{ fontSize: 12 }} color={colors.orange}>{f.note}</Small> : null}
                {f.current && !(f.current.value === f.value && f.current.comparator === f.comparator) ? (
                  <Small style={{ fontSize: 12 }}>
                    Сейчас введено: {f.current.comparator !== '=' ? f.current.comparator : ''}
                    {fmt(f.current.value)} — отметьте, чтобы заменить
                  </Small>
                ) : null}
                <Small style={{ fontSize: 11 }} color={colors.textMuted}>
                  В бланке: «{f.line}»
                </Small>
              </Card>
            );
          })}

          {data.found.length < data.total ? (
            <Small style={{ fontSize: 12 }}>
              Остальные показатели можно ввести вручную на следующем экране — после сохранения он откроется сам.
            </Small>
          ) : null}
          {!data.found.length ? (
            <Button title="Ввести вручную" variant="secondary" onPress={() => router.replace({ pathname: '/analyses/entry', params: { mid } })} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
