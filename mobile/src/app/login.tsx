import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Channel } from '@/data/api';
import { useApp } from '@/data/store';
import { Button, Field, Header, Screen, Segmented, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function LoginScreen() {
  const { actions } = useApp();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [channel, setChannel] = useState<Channel>('sms');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = channel === 'sms' ? value.replace(/\D/g, '').length >= 10 : /\S+@\S+\.\S+/.test(value);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await actions.requestCode(channel, value);
      router.push({ pathname: '/login-code', params: { channel, target: r.target, devCode: r.devCode ?? '', next: next ?? '' } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header onBack={() => router.back()} />}>
      <Text style={font.h1}>Вход</Text>
      <Small>Пришлём код для входа. Аккаунт создастся автоматически при первом входе.</Small>
      <Segmented<Channel>
        value={channel}
        onChange={(c) => {
          setChannel(c);
          setValue('');
          setError(null);
        }}
        options={[
          { value: 'sms', label: 'Телефон' },
          { value: 'email', label: 'Почта' },
        ]}
      />
      {channel === 'sms' ? (
        <Field
          key="sms"
          label="Номер телефона"
          value={value}
          onChangeText={setValue}
          placeholder="+7 777 123 45 67"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus
        />
      ) : (
        <Field
          key="email"
          label="Электронная почта"
          value={value}
          onChangeText={setValue}
          placeholder="name@mail.kz"
          keyboardType="email-address"
          autoCapitalize="none"
          textContentType="emailAddress"
          autoComplete="email"
          autoFocus
        />
      )}
      {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
      <Button title={busy ? 'Отправляем…' : 'Получить код'} disabled={!ready || busy} onPress={submit} />
    </Screen>
  );
}
