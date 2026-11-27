/** Команда модераторов потока: владелец приглашает по номеру или почте и убирает, модератор может выйти сам. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/components/mod-ui';
import { api, ApiError } from '@/data/api';
import { Team, TeamMember, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { Button, Card, ConfirmDialog, Field, LinkButton, Small, Tag, ui } from '@/ui';
import { colors } from '@/theme';

export function TeamCard({ streamId }: { streamId: string }) {
  const { showError } = useApp();
  const { data, reload } = useQuery<Team>(`/v1/mod/streams/${streamId}/team`);
  const [contact, setContact] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const owner = data?.myRole === 'owner';

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('POST', `/v1/mod/streams/${streamId}/team`, { contact: contact.trim(), name: name.trim() || undefined });
      setContact('');
      setName('');
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: TeamMember) => {
    try {
      await api('DELETE', `/v1/mod/streams/${streamId}/team/${m.userId}`);
      if (m.isMe) router.replace('/streams');
      else await reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось убрать из команды');
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      {data?.members.map((m) => (
        <View key={m.userId} style={ui.row}>
          <Avatar name={m.name} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>
              {m.name}
              {m.isMe ? <Text style={{ color: colors.textMuted }}> (вы)</Text> : null}
            </Text>
            {m.contact && m.contact !== m.name ? <Small style={{ fontSize: 12 }}>{m.contact}</Small> : null}
          </View>
          {m.role === 'owner' ? (
            <Tag label="Владелец" color={colors.blue} />
          ) : (owner || m.isMe) ? (
            <LinkButton title={m.isMe ? 'Выйти' : 'Убрать'} color={colors.red} onPress={() => setRemoving(m)} />
          ) : (
            <Tag label="Модератор" color={colors.textSecondary} />
          )}
        </View>
      ))}

      {owner ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Добавить модератора</Text>
          <Field
            value={contact}
            onChangeText={(v) => {
              setContact(v);
              setError(null);
            }}
            placeholder="Телефон или почта"
            autoCapitalize="none"
            keyboardType="email-address"
            focusColor={colors.blue}
          />
          <Field value={name} onChangeText={setName} placeholder="Имя (необязательно)" focusColor={colors.blue} />
          {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
          <Button title={busy ? 'Добавляем…' : 'Добавить в команду'} variant="blue" small disabled={contact.trim().length < 5 || busy} onPress={invite} />
        </View>
      ) : null}

      <Small style={{ fontSize: 12 }}>
        Модератор команды входит в приложение по этому номеру или почте. Он одобряет заявки, видит участников и их данные — в том числе
        анализы, — ставит задачи и делает рассылки. Каждый его просмотр данных о здоровье попадает в журнал, который видит участник.
        Настройки, нормы, код и команду меняет только владелец.
      </Small>

      <ConfirmDialog
        visible={!!removing}
        title={removing?.isMe ? 'Выйти из команды потока?' : `Убрать ${removing?.name ?? ''} из команды?`}
        message={
          removing?.isMe
            ? 'Поток пропадёт из вашего кабинета. Вернуть вас может владелец потока.'
            : 'Модератор потеряет доступ к потоку и данным участников. Его прошлые задачи и рассылки останутся.'
        }
        confirmLabel={removing?.isMe ? 'Выйти' : 'Убрать'}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const m = removing!;
          setRemoving(null);
          void remove(m);
        }}
      />
    </Card>
  );
}
