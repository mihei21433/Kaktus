import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/data/store';
import { Ionicons } from '@/ui';
import { colors } from '@/theme';

const TABS: { name: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'today', label: 'Сегодня', icon: 'checkbox-outline' },
  { name: 'goals', label: 'Цели', icon: 'locate-outline' },
  { name: 'progress', label: 'Прогресс', icon: 'stats-chart-outline' },
  { name: 'profile', label: 'Профиль', icon: 'person-outline' },
];

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  // Вне потока (вышел, удалил аккаунт, заблокирован) вкладки не рендерим — экраны рассчитывают на поток.
  if (state.membership.status !== 'approved' || !state.membership.stream) return <Redirect href="/" />;
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, navigateToTab }) => (
        <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {state.routes.map((route, index) => {
            const tab = TABS.find((t) => t.name === route.name);
            if (!tab) return null;
            const focused = state.index === index;
            const color = focused ? colors.green : colors.textSecondary;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                style={styles.item}
                onPress={() => {
                  if (!focused) navigateToTab(route.key);
                }}>
                <Ionicons name={tab.icon} size={22} color={color} />
                <Text style={[styles.label, { color }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 2 },
  label: { fontSize: 11, fontWeight: '600' },
});
