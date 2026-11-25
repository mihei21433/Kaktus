import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TabBar, TabDef } from '@/components/tab-bar';
import { useApp } from '@/data/store';
import { colors } from '@/theme';

const TABS: TabDef[] = [
  { name: 'streams', label: 'Потоки', icon: 'albums-outline' },
  { name: 'requests', label: 'Заявки', icon: 'person-add-outline' },
  { name: 'broadcasts', label: 'Рассылки', icon: 'paper-plane-outline' },
  { name: 'settings', label: 'Настройки', icon: 'settings-outline' },
];

export default function ModeratorLayout() {
  const { state, loggedIn } = useApp();
  if (!loggedIn || !state.account?.isModerator) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(p) => <TabBar {...p} tabs={TABS} accent={colors.blue} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
    </Tabs>
  );
}
