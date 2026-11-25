import { router } from 'expo-router';
import { ComponentRef, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useApp } from '@/data/store';
import { Button, Caption, Header, LinkButton, Screen } from '@/ui';
import { colors, font, radius } from '@/theme';

const LEN = 6;

export default function JoinScreen() {
  const { actions } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const onChange = (v: string) => {
    setError(null);
    setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LEN));
  };

  const submit = async () => {
    setBusy(true);
    const res = await actions.joinByCode(code);
    setBusy(false);
    if (res.ok) router.replace('/pending');
    else setError(res.error);
  };

  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <Text style={font.h1}>Вступить по коду</Text>
      <Caption style={{ textTransform: 'none', letterSpacing: 0 }}>Код потока</Caption>
      <Pressable onPress={() => input.current?.focus()} style={styles.cells}>
        {Array.from({ length: LEN }).map((_, i) => {
          const ch = code[i];
          const active = i === Math.min(code.length, LEN - 1);
          return (
            <View key={i} style={[styles.cell, ch && styles.cellFilled, active && styles.cellActive]}>
              <Text style={styles.cellText}>{ch ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={code}
        onChangeText={onChange}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={LEN}
        style={styles.hidden}
        onSubmitEditing={() => code.length === LEN && submit()}
      />
      {error ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ color: colors.red, fontSize: 13, flex: 1 }}>{error}</Text>
          <LinkButton title="Очистить" color={colors.blue} onPress={() => onChange('')} />
        </View>
      ) : null}
      <Button title={busy ? 'Проверяем…' : 'Продолжить'} disabled={code.length < LEN || busy} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFilled: { borderColor: colors.borderStrong },
  cellActive: { borderColor: colors.text },
  cellText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
});
