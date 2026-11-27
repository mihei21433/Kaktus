import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppVersionRow } from '@/components/app-updates';
import { Avatar } from '@/components/mod-ui';
import { useApp } from '@/data/store';
import { Caption, Card, ConfirmDialog, Header, RowLink, Screen } from '@/ui';
import { colors, font } from '@/theme';

export default function ProfileScreen() {
  const { state, actions } = useApp();
  const [logout, setLogout] = useState(false);
  const account = state.account;
  const { profile } = state;
  const stream = state.membership.stream!;
  const [leave, setLeave] = useState(false);

  return (
    <Screen inTabs header={<Header title="Профиль" rightLabel="Изменить" onRight={() => router.push('/profile-edit')} />}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Avatar name={profile.name || '?'} size={56} uri={profile.avatarUrl} />
        <View style={{ flex: 1 }}>
          <Text style={font.h2}>{profile.name || 'Без имени'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            {stream.name}
            {state.demo ? ' · демо' : profile.phone ? ` · ${profile.phone}` : account?.phone ? ` · ${account.phone}` : ''}
          </Text>
        </View>
      </View>
      {!state.demo ? (
        <Card style={{ paddingVertical: 0 }}>
          <RowLink title="Аккаунт" subtitle="фото, имя, фамилия, телефон" onPress={() => router.push('/account')} />
        </Card>
      ) : null}
      <Card style={{ gap: 6 }}>
        <Caption color={colors.green}>Личный контракт</Caption>
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{profile.contract || 'Не заполнен'}</Text>
      </Card>
      <Card style={{ gap: 6 }}>
        <Caption>О себе</Caption>
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>{profile.about || 'Не заполнено'}</Text>
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink
          title="Мои анализы и индекс здоровья"
          value={state.demo ? 'на сервере' : state.analyses?.index != null ? `${state.analyses.index} %` : '—'}
          onPress={() => router.push('/analyses')}
        />
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink title="Экспорт моих данных" value="скоро" />
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <AppVersionRow />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <RowLink title="Журнал доступа к моим данным" subtitle="когда модератор открывал данные о здоровье" onPress={() => router.push('/access-log')} />
      </Card>
      {!state.demo ? (
        <Card style={{ paddingVertical: 0 }}>
          <RowLink title="Код входа на другом телефоне" subtitle="личный код вместо SMS" onPress={() => router.push('/my-code')} />
        </Card>
      ) : null}
      <Card style={{ paddingVertical: 0 }}>
        <RowLink title="Согласие на обработку данных" onPress={() => router.push('/consent-settings')} />
      </Card>
      <Card style={{ paddingVertical: 0 }}>
        <RowLink
          title="Напоминания"
          subtitle="время задаёт модератор"
          value={state.reminders.enabled === false ? 'выключены' : `${state.reminders.morning}, ${state.reminders.evening}`}
        />
        <View style={{ height: 1, backgroundColor: colors.border }} />
        <RowLink title="Мой поток" value={stream.name} onPress={() => router.push('/my-stream')} />
      </Card>
      <RowLink title={state.demo ? 'Выйти из демо' : 'Выйти из аккаунта'} color={colors.blue} onPress={() => setLogout(true)} />
      {!state.demo ? <RowLink title="Выйти из потока" color={colors.red} onPress={() => setLeave(true)} /> : null}
      <RowLink title="Удалить аккаунт" color={colors.red} onPress={() => router.push('/delete-account')} />
      <ConfirmDialog
        visible={leave}
        title="Выйти из потока?"
        message="Вы перестанете видеть задачи и цели этого потока. Вступить в другой поток можно сразу после выхода."
        confirmLabel="Выйти"
        onCancel={() => setLeave(false)}
        onConfirm={async () => {
          setLeave(false);
          await actions.leaveStream();
          router.replace('/');
        }}
      />
      <ConfirmDialog
        visible={logout}
        title={state.demo ? 'Выйти из демо?' : 'Выйти из аккаунта?'}
        message={state.demo ? 'Демо-данные удалятся с телефона.' : 'Данные останутся на сервере. Войти снова — по личному коду входа: сохраните его заранее («Код входа на другом телефоне» выше).'}
        confirmLabel="Выйти"
        onCancel={() => setLogout(false)}
        onConfirm={async () => {
          setLogout(false);
          await actions.logout();
          router.replace('/');
        }}
      />
    </Screen>
  );
}
