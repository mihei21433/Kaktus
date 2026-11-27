/** Фото профиля: показать, выбрать из галереи или снять, удалить. Фото обрезается сервером до квадрата. */
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { Avatar } from '@/components/mod-ui';
import { api, ApiError, upload } from '@/data/api';
import { useApp } from '@/data/store';
import { LinkButton, Small } from '@/ui';
import { colors } from '@/theme';

export function AvatarPicker({ name, size = 88 }: { name: string; size?: number }) {
  const { state, actions, showError } = useApp();
  const [busy, setBusy] = useState(false);
  const uri = state.profile.avatarUrl;

  const pick = async (from: 'library' | 'camera') => {
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return showError('Нет доступа к камере. Разрешите его в настройках телефона или выберите фото.');
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 };
      const r = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets[0]) return;
      setBusy(true);
      const a = r.assets[0];
      const blob = await (await fetch(a.uri)).blob();
      const type = a.mimeType === 'image/png' ? 'image/png' : a.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
      await upload('/v1/me/avatar', blob, type, { method: 'POST' });
      await actions.refresh();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось загрузить фото');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api('DELETE', '/v1/me/avatar');
      await actions.refresh();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось удалить фото');
    } finally {
      setBusy(false);
    }
  };

  if (state.demo) return <Avatar name={name || '?'} size={size} />;

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable onPress={() => pick('library')} accessibilityLabel="Выбрать фото профиля" disabled={busy}>
        <Avatar name={name || '?'} size={size} uri={uri} />
        {busy ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: size / 2 }}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <LinkButton title={uri ? 'Сменить фото' : 'Выбрать фото'} color={colors.blue} onPress={() => pick('library')} />
        {Platform.OS !== 'web' ? <LinkButton title="Снять" color={colors.blue} onPress={() => pick('camera')} /> : null}
        {uri ? <LinkButton title="Удалить" color={colors.red} onPress={remove} /> : null}
      </View>
      <Small style={{ fontSize: 11 }}>Фото увидят модераторы вашего потока</Small>
    </View>
  );
}
