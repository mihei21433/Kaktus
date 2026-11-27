/**
 * Веб-версия в Safari на iPhone: подсказка, как добавить «Кактус» на экран «Домой» —
 * тогда он открывается как приложение, без адресной строки. Закрывается и больше не показывается.
 */
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { Ionicons } from '@/ui';
import { colors } from '@/theme';

const KEY = 'kaktus.installHint.closed';

function shouldShow(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
  try {
    if (localStorage.getItem(KEY)) return false;
  } catch {
    // приватный режим — просто показываем
  }
  return ios && !standalone;
}

export function InstallHint() {
  const [show, setShow] = useState(shouldShow);
  if (!show) return null;
  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {}
  };
  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 24,
        backgroundColor: colors.card,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 12,
      }}>
      <Ionicons name="share-outline" size={22} color={colors.blue} />
      <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, flex: 1 }}>
        Чтобы «Кактус» открывался как приложение: нажмите «Поделиться» внизу Safari, затем «На экран „Домой“».
      </Text>
      <Pressable onPress={close} hitSlop={10} accessibilityLabel="Закрыть подсказку">
        <Ionicons name="close" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
