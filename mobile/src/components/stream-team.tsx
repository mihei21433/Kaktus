/** Команда модераторов потока: владелец добавляет по имени (вход по личному коду), выдаёт новые коды и убирает; модератор может выйти сам. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { CodeDialog } from '@/components/code-box';
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
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null);
  const [reissue, setReissue] = useState<TeamMember | null>(null);
  const owner = data?.myRole === 'owner';

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ loginCode: string | null }>('POST', `/v1/mod/streams/${streamId}/team`, {
        name: name.trim() || undefined,
        contact: contact.trim() || undefined,
      });
      if (r.loginCode) setIssued({ name: name.trim() || contact.trim(), code: r.loginCode });
      setContact('');
      setName('');
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  const newCode = async (m: TeamMember) => {
    try {
      const r = await api<{ loginCode: string }>('POST', `/v1/mod/streams/${streamId}/team/${m.userId}/login-code`);
      setIssued({ name: m.name, code: r.loginCode });
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось выдать код');
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
          <Avatar name={m.name} size={34} uri={m.avatarUrl} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>
              {m.name}
              {m.isMe ? <Text style={{ color: colors.textMuted }}> (вы)</Text> : null}
            </Text>
            {m.contact && m.contact !== m.name ? <Small style={{ fontSize: 12 }}>{m.contact}</Small> : null}
          </View>
          {m.role === 'owner' ? (
            <Tag label="Владелец" color={colors.blue} />
          ) : owner ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <LinkButton title="Код" color={colors.blue} onPress={() => setReissue(m)} />
              <LinkButton title="Убрать" color={colors.red} onPress={() => setRemoving(m)} />
            </View>
          ) : m.isMe ? (
            <LinkButton title="Выйти" color={colors.red} onPress={() => setRemoving(m)} />
          ) : (
            <Tag label="Модератор" color={colors.textSecondary} />
          )}
        </View>
      ))}

      {owner ? (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Добавить модератора</Text>
          <Field
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder="Имя"
            focusColor={colors.blue}
          />
          <Field
            value={contact}
            onChangeText={(v) => {
              setContact(v);
              setError(null);
            }}
            placeholder="Телефон (если уже есть аккаунт) — необязательно"
            autoCapitalize="none"
            keyboardType="email-address"
            focusColor={colors.blue}
          />
          {error ? <Text style={{ color: colors.red, fontSize: 13 }}>{error}</Text> : null}
          <Button title={busy ? 'Добавляем…' : 'Добавить в команду'} variant="blue" small disabled={(!name.trim() && contact.trim().length < 5) || busy} onPress={invite} />
        </View>
      ) : null}

      <Small style={{ fontSize: 12 }}>
        Новый модератор получит личный код входа — передайте его. Он одобряет заявки, видит участников и их данные — в том числе
        анализы, — ставит задачи и делает рассылки. Каждый его просмотр данных о здоровье попадает в журнал, который видит участник.
        Настройки, нормы, код и команду меняет только владелец.
      </Small>

      <ConfirmDialog
        visible={!!reissue}
        title={`Новый код входа: ${reissue?.name ?? ''}?`}
        message="Старый код перестанет работать, а модератор выйдет из аккаунта на всех телефонах."
        confirmLabel="Выдать код"
        destructive={false}
        onCancel={() => setReissue(null)}
        onConfirm={() => {
          const m = reissue!;
          setReissue(null);
          void newCode(m);
        }}
      />
      <CodeDialog
        code={issued?.code ?? null}
        title={`Код входа: ${issued?.name ?? ''}`}
        text="Передайте код модератору. Он введёт его в приложении: «Уже есть аккаунт — войти по коду»."
        shareText={`Ваш код входа в «Кактус» (модератор): ${issued?.code}. Откройте приложение → «Уже есть аккаунт — войти по коду».`}
        onClose={() => setIssued(null)}
      />
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
