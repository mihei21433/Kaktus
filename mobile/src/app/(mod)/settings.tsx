import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { Overview, useQuery } from '@/data/mod';
import { AppVersionRow } from '@/components/app-updates';
import { useApp } from '@/data/store';
import { Caption, Card, ConfirmDialog, Header, RowLink, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function ModSettingsScreen() {
  const { state, actions } = useApp();
  const { data, error, loading, reload } = useQuery<Overview>('/v1/mod/overview');
  const [logout, setLogout] = useState(false);
  const account = state.account;

  return (
    <Screen inTabs header={<Header title="Настройки" />}>
      <Card style={{ gap: 4 }}>
        <Caption>Аккаунт модератора</Caption>
        <Text style={font.title}>{state.profile.name || 'Без имени'}</Text>
        <Small>{account?.phone ?? account?.email}</Small>
      </Card>
      <Caption>Потоки</Caption>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data?.streams.map((s) => (
        <Card key={s.id} style={{ paddingVertical: 0 }}>
          <RowLink
            title={s.name}
            subtitle="правила, разделы, порог шагов, код"
            onPress={() => router.push({ pathname: '/mod/stream-settings/[id]', params: { id: s.id } })}
          />
        </Card>
      ))}
      <Small style={{ fontSize: 12 }}>
        Позже здесь появятся: команда модераторов, физнормативы, сроки целей и панель анализов.
      </Small>
      <Card style={{ paddingVertical: 0 }}>
        <AppVersionRow />
      </Card>
      <RowLink title="Выйти из аккаунта" color={colors.red} onPress={() => setLogout(true)} />
      <ConfirmDialog
        visible={logout}
        title="Выйти из аккаунта?"
        message="Данные потоков останутся на сервере — войти можно снова по номеру или почте."
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
