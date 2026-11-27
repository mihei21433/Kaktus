import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { TEMPLATE_INCLUDES, TemplateInfo } from '@/components/stream-template';
import { api, ApiError } from '@/data/api';
import { useQuery } from '@/data/mod';
import { Stream } from '@/data/types';
import { useApp } from '@/data/store';
import { Button, Caption, Card, Field, Header, Screen, Small, Toggle, ui } from '@/ui';
import { colors } from '@/theme';

export default function StreamNewScreen() {
  const { showError } = useApp();
  const [name, setName] = useState('');
  const [approval, setApproval] = useState(true);
  const [days, setDays] = useState('90');
  const [busy, setBusy] = useState(false);
  const tpl = useQuery<TemplateInfo>('/v1/mod/template').data?.template;

  const create = async () => {
    setBusy(true);
    try {
      const s = await api<Stream>('POST', '/v1/mod/streams', {
        name: name.trim(),
        requireApproval: approval,
        durationDays: Number(days) || 90,
      });
      router.replace({ pathname: '/mod/stream-created', params: { id: s.id, name: s.name, code: s.code } });
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось создать поток');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<Header title="Новый поток" backLabel="Отмена" onBack={() => router.back()} />}
      footer={<Button title={busy ? 'Создаём…' : 'Создать поток'} variant="blue" disabled={!name.trim() || busy} onPress={create} />}>
      <Field label="Название" value={name} onChangeText={setName} placeholder="Например: Поток «Лето»" focusColor={colors.blue} autoFocus />
      <Caption>Правила потока по умолчанию</Caption>
      <Card style={[ui.row, { justifyContent: 'space-between' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Подтверждение заявок</Text>
          <Small style={{ fontSize: 12 }}>{approval ? 'Вы одобряете каждого участника' : 'Участник попадает в поток сразу по коду'}</Small>
        </View>
        <Toggle value={approval} onChange={setApproval} />
      </Card>
      <Card style={{ gap: 6 }}>
        <Field
          label="Длительность потока, дней"
          value={days}
          onChangeText={(v) => setDays(v.replace(/\D/g, '').slice(0, 3))}
          keyboardType="number-pad"
          focusColor={colors.blue}
        />
        <Small style={{ fontSize: 12 }}>Отсчёт — с сегодняшнего дня. От длительности зависит срок глобальных целей.</Small>
      </Card>
      {tpl ? (
        <Card borderColor="#1E3A5F" style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Настройки — из вашего шаблона</Text>
          <Small style={{ fontSize: 12 }}>
            Шаблон сохранён из «{tpl.sourceStream}». {TEMPLATE_INCLUDES}
          </Small>
        </Card>
      ) : null}
    </Screen>
  );
}
