import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@/ui';
import { colors } from '@/theme';

export type TabDef = { name: string; label: string; icon: keyof typeof Ionicons.glyphMap; badge?: number };

/** Нижняя панель вкладок в стиле макетов. */
export function TabBar({ state, navigateToTab, tabs, accent }: Pick<BottomTabBarProps, 'state' | 'navigateToTab'> & { tabs: TabDef[]; accent: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const tab = tabs.find((t) => t.name === route.name);
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? accent : colors.textSecondary;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            style={styles.item}
            onPress={() => {
              if (!focused) navigateToTab(route.key);
            }}>
            <View>
              <Ionicons name={tab.icon} size={22} color={color} />
              {tab.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tab.badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
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
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: colors.red,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
