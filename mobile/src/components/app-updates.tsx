/**
 * Обновления «по воздуху» (EAS Update): приложение само скачивает новую версию при запуске;
 * когда она готова — предлагаем перезапуститься. В Expo Go и браузере обновления выключены.
 */
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDayMonth, formatTime, dateKey } from '@/lib/date';
import { RowLink } from '@/ui';
import { colors } from '@/theme';

/** Обновления по воздуху есть только в установленном приложении (не в браузере и не в Expo Go). */
const ENABLED = Updates.isEnabled && Platform.OS !== 'web';

export function UpdateBanner() {
  const { isUpdatePending } = Updates.useUpdates();
  const insets = useSafeAreaInsets();
  if (!ENABLED || !isUpdatePending) return null;
  return (
    <Pressable onPress={() => Updates.reloadAsync()} style={[styles.banner, { bottom: insets.bottom + 72 }]} accessibilityRole="button">
      <Text style={styles.text}>Загружено обновление «Кактуса»</Text>
      <Text style={styles.action}>Перезапустить</Text>
    </Pressable>
  );
}

/** Строка «Версия приложения» в профиле: дата текущей версии и ручная проверка обновлений. */
export function AppVersionRow() {
  const [status, setStatus] = useState<string | null>(null);
  const version = !ENABLED
    ? 'режим разработки'
    : Updates.isEmbeddedLaunch || !Updates.createdAt
      ? 'из установленного APK'
      : `обновление от ${formatDayMonth(dateKey(Updates.createdAt))}, ${formatTime(Updates.createdAt.toISOString())}`;

  const check = async () => {
    if (!ENABLED) return setStatus('Обновления работают только в установленном приложении');
    try {
      setStatus('Проверяем…');
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) return setStatus('У вас последняя версия');
      setStatus('Скачиваем обновление…');
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      setStatus('Не удалось проверить — нет связи');
    }
  };

  return <RowLink title="Версия приложения" subtitle={status ?? version} value="проверить" onPress={check} />;
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: colors.greenDim,
    borderColor: colors.green,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 90,
  },
  text: { color: colors.text, fontSize: 14, flex: 1 },
  action: { color: colors.green, fontSize: 14, fontWeight: '700' },
});
