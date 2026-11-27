/** Вход в существующий аккаунт по личному коду входа (новый телефон, после выхода). Без SMS. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { useApp } from '@/data/store';
import { Button, Caption, Header, LinkButton, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

/** «k7f3q9qx2m» → «K7F3Q-9QX2M» */
function formatCode(v: string) {
  const s = v.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g, '').slice(0, 10);
  return s.length > 5 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
}

export default function LoginScreen() {
  const { actions } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = code.replace('-', '').length === 10;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await actions.loginWithCode(code);
      if (router.canDismiss()) router.dismissAll();
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/start'))} />}>
      <Text style={font.h1}>Вход по коду</Text>
      <Small>Введите личный код входа — 10 знаков. Он есть в профиле на старом телефоне (участник: «Профиль», модератор: «Настройки»).</Small>
      <Caption>Личный код входа</Caption>
      <TextInput
        value={code}
        onChangeText={(v) => {
          setCode(formatCode(v));
          setError(null);
        }}
        placeholder="K7F3Q-9QX2M"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={() => ready && submit()}
        style={{
          height: 56,
          color: colors.text,
          backgroundColor: colors.input,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? colors.red : colors.border,
          paddingHorizontal: 16,
          fontSize: 24,
          fontWeight: '700',
          letterSpacing: 3,
          textAlign: 'center',
        }}
      />
      {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
      <Button title={busy ? 'Входим…' : 'Войти'} disabled={!ready || busy} onPress={submit} />
      <Small style={{ fontSize: 12 }}>Потеряли код? Попросите модератора потока выдать новый — старый при этом перестанет работать.</Small>
      <LinkButton title="Ещё нет аккаунта — вступить по коду потока" color={colors.blue} onPress={() => router.replace('/join')} />
    </Screen>
  );
}
