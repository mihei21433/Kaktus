/** Физнормативы потока: название, единица и норма; у старых нормативов сохраняется id, чтобы не терять результаты. */
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { api, ApiError } from '@/data/api';
import { FitnessNorm } from '@/data/types';
import { useApp } from '@/data/store';
import { Button, Card, LinkButton, Small, ui } from '@/ui';
import { colors } from '@/theme';

type Row = { id?: string; name: string; unit: string; norm: string };
const MAX = 8;

const toRows = (norms: FitnessNorm[]): Row[] => norms.map((n) => ({ id: n.id, name: n.name, unit: n.unit, norm: String(n.norm) }));

const input = {
  height: 40,
  color: colors.text,
  backgroundColor: colors.input,
  borderRadius: 10,
  paddingHorizontal: 10,
  borderWidth: 1,
  borderColor: colors.border,
} as const;

export function FitnessNormsCard({ streamId, norms, onSaved }: { streamId: string; norms: FitnessNorm[]; onSaved: () => Promise<void> }) {
  const { showError } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const list = rows ?? toRows(norms);
  const dirty = rows !== null && JSON.stringify(rows) !== JSON.stringify(toRows(norms));
  const valid = list.every((r) => r.name.trim() && Number(r.norm.replace(',', '.')) > 0);

  const set = (i: number, patch: Partial<Row>) => setRows(list.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true);
    try {
      await api('PUT', `/v1/mod/streams/${streamId}/norms`, {
        norms: list.map((r) => ({ id: r.id, name: r.name.trim(), unit: r.unit.trim(), norm: Number(r.norm.replace(',', '.')) })),
      });
      await onSaved();
      setRows(null);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить нормативы');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      {list.length === 0 ? <Small>Нормативов нет — блок «Физнормативы» не входит в индекс здоровья.</Small> : null}
      {list.map((r, i) => (
        <View key={r.id ?? `new-${i}`} style={{ gap: 6 }}>
          <View style={ui.row}>
            <TextInput
              value={r.name}
              onChangeText={(v) => set(i, { name: v.slice(0, 40) })}
              placeholder="Название, например «Отжимания»"
              placeholderTextColor={colors.textMuted}
              style={[input, { flex: 1, minWidth: 0 }]}
            />
            <LinkButton title="Удалить" color={colors.red} onPress={() => setRows(list.filter((_, j) => j !== i))} />
          </View>
          <View style={ui.row}>
            <Small style={{ fontSize: 12 }}>Норма</Small>
            <TextInput
              value={r.norm}
              onChangeText={(v) => set(i, { norm: v.replace(/[^\d.,]/g, '').slice(0, 7) })}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={[input, { width: 90, color: Number(r.norm.replace(',', '.')) > 0 ? colors.text : colors.red }]}
            />
            <TextInput
              value={r.unit}
              onChangeText={(v) => set(i, { unit: v.slice(0, 12) })}
              placeholder="раз, сек, км"
              placeholderTextColor={colors.textMuted}
              style={[input, { flex: 1, minWidth: 0 }]}
            />
          </View>
        </View>
      ))}
      {list.length < MAX ? (
        <LinkButton title="+ Добавить норматив" color={colors.blue} onPress={() => setRows([...list, { name: '', unit: '', norm: '' }])} />
      ) : null}
      {dirty ? (
        <View style={ui.row}>
          <Button title="Отменить" variant="secondary" small style={{ flex: 1 }} onPress={() => setRows(null)} />
          <Button
            title={busy ? 'Сохраняем…' : valid ? 'Сохранить' : 'Заполните название и норму'}
            variant="blue"
            small
            style={{ flex: 2 }}
            disabled={!valid || busy}
            onPress={save}
          />
        </View>
      ) : null}
      <Small style={{ fontSize: 12 }}>
        Участник вносит результат на экране «Шаги». Балл норматива — результат к норме (не больше 100%), он входит в индекс здоровья.
        Если удалить норматив, уже внесённые результаты сохранятся, но в индексе он учитываться не будет.
      </Small>
    </Card>
  );
}
