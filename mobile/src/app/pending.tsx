import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { RequestCard, StatusIcon } from '@/components/request-card';
import { useApp } from '@/data/store';
import { Button, ConfirmDialog, Screen, Small, Tag } from '@/ui';
import { colors, font } from '@/theme';

export default function PendingScreen() {
  const { state, actions } = useApp();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stream = state.membership.stream;
  if (!stream) return null;

  const check = async () => {
    setBusy(true);
    const status = await actions.checkStatus();
    setBusy(false);
    if (status === 'pending') setNote('Заявка всё ещё на рассмотрении');
    else router.replace('/');
  };

  return (
    <Screen
      scroll={false}
      footer={
        <>
          <Button title={busy ? 'Проверяем…' : 'Проверить статус'} disabled={busy} onPress={check} />
          <Button title="Ввести другой код" variant="secondary" onPress={() => setConfirm(true)} />
        </>
      }>
      <View style={{ marginTop: 40, gap: 12, alignItems: 'center' }}>
        <StatusIcon icon="⏳" color={colors.orange} />
        <Tag label="Заявка на подтверждении" color={colors.orange} center />
        <Text style={font.h2}>Ждём подтверждения</Text>
        <Small style={{ textAlign: 'center', maxWidth: 300 }}>
          Модератор потока {stream.name} рассмотрит заявку. Мы пришлём уведомление, когда будет решение.
        </Small>
      </View>
      <View style={{ marginTop: 24 }}>
        <RequestCard stream={stream} status="На рассмотрении" statusColor={colors.orange} />
      </View>
      {note ? <Small style={{ textAlign: 'center', marginTop: 12 }}>{note}</Small> : null}
      <ConfirmDialog
        visible={confirm}
        title={`Отозвать заявку в ${stream.name}?`}
        message="Модератор её больше не увидит. Вступить в этот поток позже можно тем же кодом."
        cancelLabel="Остаться"
        confirmLabel="Отозвать"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          actions.cancelRequest();
          router.replace('/join');
        }}
      />
    </Screen>
  );
}
