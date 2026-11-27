/**
 * Вступление по коду потока. Новый человек вводит код потока и имя — и сразу внутри (без SMS),
 * а затем видит свой личный код входа. Уже вошедший (например, после выхода из потока) — только код.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { CodeCells } from '@/components/code-cells';
import { setFreshCode } from '@/data/fresh-code';
import { useApp } from '@/data/store';
import { Button, Caption, Field, Header, LinkButton, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function JoinScreen() {
  const { actions, loggedIn } = useApp();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = code.length >= 6 && (loggedIn || name.trim().length > 0);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (loggedIn) {
        const res = await actions.joinByCode(code);
        if (res.ok) router.replace('/');
        else setError(res.error);
      } else {
        setFreshCode(await actions.joinWithStreamCode(code, name.trim()));
        if (router.canDismiss()) router.dismissAll();
        router.replace({ pathname: '/my-code', params: { fresh: '1' } });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/start'))} />}>
      <Text style={font.h1}>Вступить по коду</Text>
      <Caption style={{ textTransform: 'none', letterSpacing: 0 }}>Код потока — даёт модератор</Caption>
      <CodeCells
        value={code}
        onChange={(v) => {
          setError(null);
          setCode(v);
        }}
        onSubmit={submit}
      />
      {!loggedIn ? (
        <Field
          label="Как вас зовут"
          value={name}
          onChangeText={(v) => {
            setName(v.slice(0, 80));
            setError(null);
          }}
          placeholder="Имя и фамилия"
          autoComplete="name"
          onSubmitEditing={submit}
        />
      ) : null}
      {error ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ color: colors.red, fontSize: 13, flex: 1 }}>{error}</Text>
          <LinkButton
            title="Очистить"
            color={colors.blue}
            onPress={() => {
              setCode('');
              setError(null);
            }}
          />
        </View>
      ) : null}
      <Button title={busy ? 'Проверяем…' : 'Вступить'} disabled={!ready || busy} onPress={submit} />
      {!loggedIn ? (
        <>
          <Small style={{ fontSize: 12 }}>Имя увидит модератор потока. Телефон и почта не нужны.</Small>
          <LinkButton title="Уже есть аккаунт — войти по личному коду" color={colors.blue} onPress={() => router.replace('/login')} />
        </>
      ) : null}
    </Screen>
  );
}
