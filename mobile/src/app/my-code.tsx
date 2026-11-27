/**
 * Личный код входа. После вступления — показываем выданный код и просим сохранить.
 * Из профиля / настроек — можно выпустить новый (старый перестанет работать).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { CodeBox } from '@/components/code-box';
import { api, ApiError } from '@/data/api';
import { takeFreshCode } from '@/data/fresh-code';
import { useApp } from '@/data/store';
import { formatDayMonth } from '@/lib/date';
import { Button, ConfirmDialog, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function MyCodeScreen() {
  const { fresh } = useLocalSearchParams<{ fresh?: string }>();
  const { state, actions, showError } = useApp();
  const [code, setCode] = useState<string | null>(() => (fresh ? takeFreshCode() : null));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const setAt = state.account?.loginCodeSetAt;

  const regenerate = async () => {
    setBusy(true);
    try {
      const r = await api<{ loginCode: string }>('POST', '/v1/me/login-code');
      setCode(r.loginCode);
      await actions.refresh();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось выпустить код');
    } finally {
      setBusy(false);
    }
  };

  if (fresh) {
    return (
      <Screen footer={<Button title="Я сохранил(а) код" disabled={!code} onPress={() => router.replace('/')} />}>
        <Text style={[font.h1, { marginTop: 24 }]}>Вы в потоке!</Text>
        <Small color={colors.text}>
          Это ваш личный код входа. Сохраните его: сделайте скриншот или отправьте себе. По нему вы войдёте на новом телефоне — SMS не
          нужны.
        </Small>
        {code ? <CodeBox code={code} /> : <Small>Код уже показан. Новый можно выпустить в профиле.</Small>}
        <Small style={{ fontSize: 12 }}>Потеряете — выпустите новый в «Профиль → Код входа» или попросите модератора. Не пересылайте код другим людям: по нему входят в ваш аккаунт.</Small>
      </Screen>
    );
  }

  return (
    <Screen header={<Header title="Код входа" onBack={() => router.back()} />}>
      <Small color={colors.text}>
        Личный код входа нужен, чтобы войти на другом телефоне или после выхода из аккаунта: «Уже есть аккаунт — войти».
      </Small>
      <Small style={{ fontSize: 12 }}>
        Сервер хранит только отпечаток кода, поэтому старый показать нельзя — можно выпустить новый.
        {setAt ? ` Текущий выпущен ${formatDayMonth(setAt.slice(0, 10))}.` : ' Кода ещё нет.'}
      </Small>
      {code ? (
        <>
          <CodeBox code={code} />
          <Small style={{ fontSize: 12 }} color={colors.orange}>
            Сохраните код — после выхода с экрана его не будет видно. Старый код больше не работает.
          </Small>
        </>
      ) : (
        <Button title={busy ? 'Выпускаем…' : setAt ? 'Выпустить новый код' : 'Получить код входа'} disabled={busy} onPress={() => (setAt ? setConfirm(true) : void regenerate())} />
      )}
      <ConfirmDialog
        visible={confirm}
        title="Выпустить новый код?"
        message="Старый код перестанет работать. На этом телефоне вы останетесь в аккаунте."
        confirmLabel="Выпустить"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void regenerate();
        }}
      />
    </Screen>
  );
}
