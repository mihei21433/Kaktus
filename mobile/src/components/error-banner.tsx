import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '@/data/store';
import { colors } from '@/theme';

/** Сообщение об ошибке поверх экрана; скрывается само через 5 секунд или по нажатию. */
export function ErrorBanner() {
  const { error, clearError } = useApp();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 5000);
    return () => clearTimeout(t);
  }, [error, clearError]);
  if (!error) return null;
  return (
    <Pressable onPress={clearError} style={[styles.banner, { top: insets.top + 8 }]} accessibilityRole="alert">
      <Text style={styles.text}>{error}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: colors.redDim,
    borderColor: colors.red,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    zIndex: 100,
  },
  text: { color: colors.text, fontSize: 14 },
});
