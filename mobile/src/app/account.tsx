/** Аккаунт: фото, имя, фамилия, телефон для связи — у участника и у модератора. */
import { router } from 'expo-router';
import { useState } from 'react';

import { AvatarPicker } from '@/components/avatar-picker';
import { api, ApiError } from '@/data/api';
import { useApp } from '@/data/store';
import { Button, Field, Header, Screen, Small } from '@/ui';

export default function AccountScreen() {
  const { state, actions, showError } = useApp();
  const p = state.profile;
  // старые данные без разделения: «Имя Фамилия» → фамилия — последнее слово
  const parts = p.name.trim().split(/\s+/);
  const [first, setFirst] = useState(p.firstName || (parts.length > 1 ? parts.slice(0, -1).join(' ') : p.name));
  const [last, setLast] = useState(p.firstName ? (p.lastName ?? '') : parts.length > 1 ? parts[parts.length - 1] : '');
  const [phone, setPhone] = useState(p.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const moderator = !!state.account?.isModerator;
  const digits = phone.replace(/\D/g, '');
  const phoneOk = !digits || digits.length === 10 || (digits.length === 11 && /^[78]/.test(digits));
  const ready = !!first.trim() && (moderator || !!last.trim()) && phoneOk;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', '/v1/me/account', { firstName: first.trim(), lastName: last.trim(), phone: phone.trim() || undefined });
      await actions.refresh();
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Header title="Аккаунт" backLabel="Отмена" onBack={() => router.back()} />}
      footer={<Button title={busy ? 'Сохраняем…' : 'Сохранить'} variant={moderator ? 'blue' : 'primary'} disabled={!ready || busy || state.demo} onPress={save} />}>
      <AvatarPicker name={`${first} ${last}`.trim()} />
      <Field label="Имя" value={first} onChangeText={(v) => setFirst(v.slice(0, 40))} placeholder="Анна" autoComplete="given-name" />
      <Field label="Фамилия" value={last} onChangeText={(v) => setLast(v.slice(0, 40))} placeholder="Смирнова" autoComplete="family-name" />
      <Field
        label="Телефон для связи"
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/[^\d+\s()-]/g, '').slice(0, 20))}
        placeholder="+7 777 123 45 67"
        keyboardType="phone-pad"
        autoComplete="tel"
        hint={phoneOk ? undefined : 'Номер вида +7 777 123 45 67'}
      />
      {error ? <Small color="#F26D6D">{error}</Small> : null}
      <Small style={{ fontSize: 12 }}>
        {moderator
          ? 'Имя, фамилию, фото и телефон видят модераторы вашей команды; имя владельца потока видят и участники.'
          : 'Имя, фамилию, фото и телефон видит модератор потока — чтобы отличать участников и связываться с ними. Вход в приложение — по личному коду, SMS не приходят.'}
      </Small>
      {state.demo ? <Small>В демо-режиме аккаунт не меняется.</Small> : null}
    </Screen>
  );
}
