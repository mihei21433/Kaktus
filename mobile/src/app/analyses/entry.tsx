import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DISCLAIMER } from '@/components/analyses-ui';
import { LoadState } from '@/components/mod-ui';
import { api } from '@/data/api';
import { type Analyses, type CatalogItem, errorText, fmt, type Measurement, STATUS_COLOR, STATUS_LABEL, unitOf } from '@/data/analyses';
import { useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { Button, Caption, Card, Chip, ConfirmDialog, Header, Screen, Segmented, Small, ui } from '@/ui';
import { colors, font, radius } from '@/theme';

type Filter = 'all' | 'filled' | 'empty';
type Cmp = '=' | '<' | '>';

export default function AnalysesEntry() {
  const { mid } = useLocalSearchParams<{ mid: string }>();
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Analyses>('/v1/me/analyses');
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const m = data?.measurements.find((x) => x.id === mid);

  const submit = async () => {
    setBusy(true);
    try {
      await api('POST', `/v1/me/measurements/${mid}/submit`);
      router.back();
    } catch (e) {
      showError(errorText(e, 'Не удалось залить'));
    } finally {
      setBusy(false);
    }
  };

  const filled = m?.summary.filled ?? 0;
  const total = m?.summary.total ?? 46;

  return (
    <Screen
      header={<Header title={m ? `Заполнено · ${filled} из ${total}` : 'Значения'} onBack={() => router.back()} />}
      footer={
        m ? (
          <Button
            title={busy ? 'Заливаем…' : m.submittedAt ? 'Залить изменения' : 'Залить в систему'}
            disabled={!filled || busy}
            onPress={() => (filled < total ? setConfirm(true) : submit())}
          />
        ) : undefined
      }>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data && !m ? <Small>Замер не найден</Small> : null}
      {data && m ? (
        <>
          {!data.sex ? <SexCard onDone={reload} /> : null}
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `Все · ${total}` },
              { value: 'filled', label: `Заполнено · ${filled}` },
              { value: 'empty', label: `Пусто · ${total - filled}` },
            ]}
          />
          {data.groups.map((g) => {
            const items = data.catalog.filter((c) => c.group === g && (filter === 'all' || (filter === 'filled') === !!m.values[c.id]));
            if (!items.length) return null;
            return (
              <View key={g} style={{ gap: 8 }}>
                <Caption>{g}</Caption>
                {items.map((c) => (
                  <ValueRow key={`${c.id}-${m.values[c.id]?.value ?? ''}`} c={c} m={m} onSaved={reload} onError={(e) => showError(errorText(e, 'Не удалось сохранить'))} />
                ))}
              </View>
            );
          })}
          <Small style={{ fontSize: 11 }}>{DISCLAIMER}</Small>
          <ConfirmDialog
            visible={confirm}
            title="Залить неполный набор?"
            message={`Будет залито ${filled} из ${total} — не хватает ${total - filled}. Остальные значения можно дозаполнить позже, пока замер открыт.`}
            confirmLabel="Залить"
            destructive={false}
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false);
              void submit();
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

/** Одно поле: значение сохраняется, когда человек уходит из поля. */
function ValueRow({ c, m, onSaved, onError }: { c: CatalogItem; m: Measurement; onSaved: () => void; onError: (e: unknown) => void }) {
  const saved = m.values[c.id];
  const [text, setText] = useState(saved ? fmt(saved.value) : '');
  const [cmp, setCmp] = useState<Cmp>(saved?.comparator ?? '=');
  const [focused, setFocused] = useState(false);

  const save = async (nextCmp: Cmp = cmp) => {
    const t = text.trim().replace(',', '.');
    try {
      if (!t) {
        if (saved) {
          await api('DELETE', `/v1/me/measurements/${m.id}/values/${c.id}`);
          onSaved();
        }
        return;
      }
      const value = Number(t);
      if (!Number.isFinite(value) || value < 0) return onError(new Error('bad'));
      if (saved && saved.value === value && saved.comparator === nextCmp) return;
      await api('PUT', `/v1/me/measurements/${m.id}/values/${c.id}`, { value, comparator: nextCmp });
      onSaved();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={[ui.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[font.title, { fontSize: 14 }]}>{c.name}</Text>
          <Small style={{ fontSize: 11 }}>{unitOf(c)}</Small>
        </View>
        <TextInput
          value={text}
          onChangeText={(v) => setText(v.replace(/[^\d.,]/g, '').slice(0, 10))}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            void save();
          }}
          onSubmitEditing={() => save()}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={c.name}
          style={{
            width: 96,
            height: 44,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: focused ? colors.text : colors.border,
            backgroundColor: colors.input,
            color: colors.text,
            textAlign: 'right',
            paddingHorizontal: 10,
            fontSize: 17,
            fontWeight: '700',
          }}
        />
      </View>
      <View style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: saved ? STATUS_COLOR[saved.status] : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
          {saved ? STATUS_LABEL[saved.status] : 'Не заполнено'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['=', '<', '>'] as Cmp[]).map((x) => (
            <Pressable
              key={x}
              onPress={() => {
                setCmp(x);
                if (text.trim()) void save(x);
              }}
              accessibilityLabel={`Знак ${x}`}
              style={{
                width: 34,
                height: 30,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: cmp === x ? colors.borderStrong : colors.cardAlt,
              }}>
              <Text style={{ color: cmp === x ? colors.text : colors.textSecondary, fontWeight: '700' }}>{x}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Card>
  );
}

function SexCard({ onDone }: { onDone: () => void }) {
  const { showError } = useApp();
  const set = async (sex: 'female' | 'male') => {
    try {
      await api('PUT', '/v1/me/sex', { sex });
      onDone();
    } catch (e) {
      showError(errorText(e, 'Не удалось сохранить'));
    }
  };
  return (
    <Card borderColor="#5A4520" background={colors.orangeDim} style={{ gap: 8 }}>
      <Text style={font.title}>Укажите пол</Text>
      <Small color={colors.text}>Нормы части показателей (тестостерон, креатинин, ЛПНП и др.) зависят от пола.</Small>
      <View style={ui.row}>
        <Chip label="Женский" onPress={() => set('female')} />
        <Chip label="Мужской" onPress={() => set('male')} />
      </View>
    </Card>
  );
}
