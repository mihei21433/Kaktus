/** Новый срок целей потока: название и длина цикла. */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { api, ApiError } from '@/data/api';
import { plural } from '@/lib/date';
import { Button, Caption, Card, Chip, Field, Header, Screen, Small, ui } from '@/ui';
import { colors } from '@/theme';

const PRESETS = [1, 3, 7, 21];

export default function HorizonNewScreen() {
  const { stream } = useLocalSearchParams<{ stream: string }>();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<number | 'own'>(21);
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = preset === 'own' ? Number(own) : preset;
  const valid = name.trim().length > 0 && days >= 1 && days <= 365;

  const create = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/v1/mod/streams/${stream}/horizons`, { name: name.trim(), days, enabled });
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось создать срок');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Header title="Новый срок" backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        <View style={{ gap: 8 }}>
          <Button title={busy ? 'Создаём…' : 'Создать и включить'} variant="blue" disabled={!valid || busy} onPress={() => create(true)} />
          <Button title="Сохранить выключенным" variant="secondary" disabled={!valid || busy} onPress={() => create(false)} />
        </View>
      }>
      <Field label="Название" value={name} onChangeText={(v) => setName(v.slice(0, 30))} placeholder="Например: Спринт 21 день" focusColor={colors.blue} autoFocus />
      <Caption>Длительность</Caption>
      <View style={ui.wrap}>
        {PRESETS.map((d) => (
          <Chip key={d} label={`${d} ${plural(d, ['день', 'дня', 'дней'])}`} color={colors.blue} selected={preset === d} onPress={() => setPreset(d)} />
        ))}
        <Chip label="Своя" color={colors.blue} selected={preset === 'own'} onPress={() => setPreset('own')} />
      </View>
      {preset === 'own' ? (
        <Field
          value={own}
          onChangeText={(v) => setOwn(v.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          placeholder="Сколько дней, от 1 до 365"
          focusColor={colors.blue}
        />
      ) : null}
      <Card style={[ui.row, { justifyContent: 'space-between' }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>Длина цикла</Text>
        <Text style={{ color: valid || !name ? colors.green : colors.textMuted, fontSize: 17, fontWeight: '700' }}>
          {days >= 1 ? `${days} ${plural(days, ['день', 'дня', 'дней'])}` : '—'}
        </Text>
      </Card>
      {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
      <Small style={{ fontSize: 12 }}>
        Участник увидит срок в строке сроков на экране «Цели» и сможет поставить на него цель. Выключенный срок участникам не виден — его
        можно включить позже.
      </Small>
    </Screen>
  );
}
