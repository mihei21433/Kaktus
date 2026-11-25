import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { CodeCells } from '@/components/code-cells';
import { Channel } from '@/data/api';
import { useApp } from '@/data/store';
import { Button, Card, Header, LinkButton, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function LoginCodeScreen() {
  const { actions } = useApp();
  const p = useLocalSearchParams<{ channel: Channel; target: string; devCode?: string; next?: string }>();
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(p.devCode || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (value = code) => {
    if (value.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await actions.verifyCode(p.channel, p.target, value);
      // Экраны входа больше не нужны — «Назад» не должен на них возвращать
      if (router.canDismiss()) router.dismissAll();
      if (s.membership.status === 'none' && p.next === 'join' && !s.account?.isModerator) router.replace('/join');
      else router.replace('/');
    } catch (e) {
      setError((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      const r = await actions.requestCode(p.channel, p.target);
      setDevCode(r.devCode ?? '');
      setWait(60);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <Text style={font.h1}>Введите код</Text>
      <Small>
        {p.channel === 'sms' ? 'Отправили SMS на номер' : 'Отправили письмо на адрес'} <Text style={{ color: colors.text }}>{p.target}</Text>
      </Small>
      <CodeCells
        value={code}
        numeric
        onChange={(v) => {
          setCode(v);
          setError(null);
          if (v.length === 6) void submit(v);
        }}
      />
      {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
      {devCode ? (
        <Card borderColor="#5A4520" background={colors.orangeDim}>
          <Small color={colors.text}>
            Тестовый режим сервера: SMS не отправляются. Код — <Text style={{ fontWeight: '700' }}>{devCode}</Text>
          </Small>
        </Card>
      ) : null}
      <Button title={busy ? 'Проверяем…' : 'Войти'} disabled={code.length < 6 || busy} onPress={() => submit()} />
      <View style={{ alignItems: 'center', marginTop: 4 }}>
        {wait > 0 ? (
          <Small>Отправить код ещё раз через {wait} с</Small>
        ) : (
          <LinkButton title="Отправить код ещё раз" color={colors.blue} onPress={resend} />
        )}
      </View>
    </Screen>
  );
}
