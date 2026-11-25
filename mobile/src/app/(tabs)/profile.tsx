import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useApp } from '@/data/store';
import { Caption, Card, ConfirmDialog, Header, RowLink, Screen } from '@/ui';
import { colors, font } from '@/theme';

export default function ProfileScreen() {
  const { state, actions } = useApp();
  const { profile } = state;
  const stream = state.membership.stream!;
  const [leave, setLeave] = useState(false);
  const initial = (profile.name || '?')[0].toUpperCase();

  return (
    <Screen inTabs header={<Header title="Профиль" rightLabel="Изменить" onRight={() => router.push('/profile-edit')} />}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.greenText }}>{initial}</Text>
        </View>
        <View>
          <Text style={font.h2}>{profile.name || 'Без имени'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{stream.name}</Text>
        </View>
      </View>
      <Card style={{ gap: 6 }}>
        <Caption color={colors.green}>Личный контракт</Caption>
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{profile.contract || 'Не заполнен'}</Text>
      </Card>
      <Card style={{ gap: 6 }}>
        <Caption>О себе</Caption>
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{profile.about || 'Не заполнено'}</Text>
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink title="Мои анализы и индекс здоровья" value="скоро" />
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink title="Экспорт моих данных" value="скоро" />
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink title="Согласие на обработку данных" onPress={() => router.push('/consent-settings')} />
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink
          title="Напоминания"
          subtitle="время задаёт модератор"
          value={`${state.reminders.morning}, ${state.reminders.evening}`}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <RowLink title="Мой поток" value={stream.name} onPress={() => router.push('/my-stream')} />
      </Card>
      <RowLink title="Выйти из потока" color={colors.red} onPress={() => setLeave(true)} />
      <RowLink title="Удалить аккаунт" color={colors.red} onPress={() => router.push('/delete-account')} />
      <ConfirmDialog
        visible={leave}
        title="Выйти из потока?"
        message="Вы перестанете видеть задачи и цели этого потока. Вступить в другой поток можно сразу после выхода."
        confirmLabel="Выйти"
        onCancel={() => setLeave(false)}
        onConfirm={() => {
          setLeave(false);
          actions.leaveStream();
          router.replace('/');
        }}
      />
    </Screen>
  );
}
