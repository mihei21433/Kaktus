import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { CodeCells } from '@/components/code-cells';
import { useApp } from '@/data/store';
import { Button, Caption, Header, LinkButton, Screen } from '@/ui';
import { colors, font } from '@/theme';

export default function JoinScreen() {
  const { actions, loggedIn } = useApp();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loggedIn) return <Redirect href="/login" />;

  const submit = async () => {
    setBusy(true);
    const res = await actions.joinByCode(code);
    setBusy(false);
    if (res.ok) router.replace('/');
    else setError(res.error);
  };

  return (
    <Screen header={<Header onBack={() => (router.canGoBack() ? router.back() : router.replace('/start'))} />}>
      <Text style={font.h1}>Вступить по коду</Text>
      <Caption style={{ textTransform: 'none', letterSpacing: 0 }}>Код потока</Caption>
      <CodeCells
        value={code}
        onChange={(v) => {
          setError(null);
          setCode(v);
        }}
        onSubmit={submit}
      />
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
      <Button title={busy ? 'Проверяем…' : 'Продолжить'} disabled={code.length < 6 || busy} onPress={submit} />
    </Screen>
  );
}
