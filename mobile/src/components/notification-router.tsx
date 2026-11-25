/**
 * Нажатие на пуш-уведомление: обновить данные и открыть нужный экран.
 * Работает и когда приложение было закрыто — уведомление, которое его запустило, тоже обрабатывается.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { type PushData, screenFor } from '@/data/push';
import { useApp } from '@/data/store';

export function NotificationRouter() {
  return Platform.OS === 'web' ? null : <Handler />;
}

function Handler() {
  const { actions, hydrated, loggedIn, state } = useApp();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || !hydrated) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    Notifications.clearLastNotificationResponse();
    if (!loggedIn || state.demo) return;
    const target = screenFor((response.notification.request.content.data ?? {}) as PushData);
    void actions.refresh().then(() => {
      if (target) router.push(target);
    });
  }, [response, hydrated, loggedIn, state.demo, actions]);

  return null;
}
