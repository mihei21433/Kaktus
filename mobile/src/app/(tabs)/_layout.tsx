import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TabBar, TabDef } from '@/components/tab-bar';
import { useApp } from '@/data/store';
import { colors } from '@/theme';

const TABS: TabDef[] = [
  { name: 'today', label: 'Сегодня', icon: 'checkbox-outline' },
  { name: 'goals', label: 'Цели', icon: 'locate-outline' },
  { name: 'progress', label: 'Прогресс', icon: 'stats-chart-outline' },
  { name: 'profile', label: 'Профиль', icon: 'person-outline' },
];

export default function TabsLayout() {
  const { state } = useApp();
  // Вне потока (вышел, удалил аккаунт, заблокирован) вкладки не рендерим — экраны рассчитывают на поток.
  if (state.membership.status !== 'approved' || !state.membership.stream) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={(p) => <TabBar {...p} tabs={TABS} accent={colors.green} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
    </Tabs>
  );
}
