/**
 * Пуш-уведомления: разрешение, токен Expo, отправка токена на сервер.
 * Работают только в собранном приложении (EAS). В Expo Go и браузере — пропускаются.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

export function pushSupported(): boolean {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false; // Expo Go
  return !!projectId();
}

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Показывать уведомления и когда приложение открыто. */
export function configureForegroundNotifications() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Запрашивает разрешение и сообщает серверу токен устройства. Ошибки не мешают работе приложения. */
export async function registerForPush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Уведомления',
        importance: AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    await api('POST', '/v1/me/push-token', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  } catch {
    // нет связи или сервис уведомлений недоступен — попробуем при следующем входе
  }
}

/** Нажатие на уведомление: обновить данные. */
export function onNotificationTap(fn: () => void) {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener(() => fn());
  return () => sub.remove();
}
