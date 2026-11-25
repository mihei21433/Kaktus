import { ComponentRef, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius } from '@/theme';

/** Ячейки для кода: буквы потока или цифры из SMS. Ввод идёт в скрытое поле. */
export function CodeCells({
  value,
  onChange,
  length = 6,
  numeric,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  numeric?: boolean;
  onSubmit?: () => void;
}) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const clean = (v: string) =>
    (numeric ? v.replace(/\D/g, '') : v.toUpperCase().replace(/[^A-Z0-9]/g, '')).slice(0, length);

  return (
    <View>
      <Pressable onPress={() => input.current?.focus()} style={styles.cells}>
        {Array.from({ length }).map((_, i) => {
          const ch = value[i];
          const active = i === Math.min(value.length, length - 1);
          return (
            <View key={i} style={[styles.cell, ch && styles.cellFilled, active && styles.cellActive]}>
              <Text style={styles.cellText}>{ch ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(clean(v))}
        autoFocus
        autoCapitalize={numeric ? 'none' : 'characters'}
        autoCorrect={false}
        keyboardType={numeric ? 'number-pad' : 'default'}
        textContentType={numeric ? 'oneTimeCode' : 'none'}
        autoComplete={numeric ? 'sms-otp' : 'off'}
        maxLength={length}
        style={styles.hidden}
        onSubmitEditing={() => value.length === length && onSubmit?.()}
      />
    </View>
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
