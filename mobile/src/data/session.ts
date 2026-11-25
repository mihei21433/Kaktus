/** Токены входа: защищённое хранилище телефона (Keychain / Keystore), в браузере — localStorage. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type Session = { accessToken: string; refreshToken: string };

const KEY = 'kaktus.session';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = Platform.OS === 'web' ? await AsyncStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session | null): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
      else await AsyncStorage.removeItem(KEY);
    } else if (s) {
      await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    } else {
      await SecureStore.deleteItemAsync(KEY);
    }
  } catch {
    // хранилище недоступно — сессия проживёт до закрытия приложения
  }
}
