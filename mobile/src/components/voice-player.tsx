import { useAudioPlayer, useAudioPlayerStatus, type AudioSource } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { api, API_URL } from '@/data/api';
import { mmss } from '@/lib/audio';
import { Ionicons, ProgressBar } from '@/ui';
import { colors } from '@/theme';

/**
 * Проигрыватель голосового заявления.
 * linkPath — адрес, по которому сервер выдаёт подписанную ссылку на запись (10 минут);
 * localUri — файл на телефоне (демо, прослушивание перед отправкой).
 * Ссылка, а не заголовок авторизации: браузерный плеер заголовки не передаёт.
 */
export function VoicePlayer({ linkPath, localUri, durationSec, accent = colors.green }: { linkPath?: string; localUri?: string; durationSec?: number; accent?: string }) {
  const [source, setSource] = useState<AudioSource | null>(localUri ? { uri: localUri } : null);
  useEffect(() => {
    if (localUri || !linkPath) return;
    let cancelled = false;
    api<{ url: string }>('GET', linkPath)
      .then((r) => {
        if (!cancelled) setSource({ uri: API_URL + r.url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [linkPath, localUri]);
  if (!source) return <Shell playing={false} position={0} duration={durationSec ?? 0} accent={accent} />;
  return <Loaded key={JSON.stringify(source)} source={source} durationSec={durationSec} accent={accent} />;
}

function Loaded({ source, durationSec, accent }: { source: AudioSource; durationSec?: number; accent: string }) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || durationSec || 0;
  const toggle = async () => {
    if (status.playing) return player.pause();
    if (status.didJustFinish || (duration && status.currentTime >= duration - 0.2)) await player.seekTo(0);
    player.play();
  };
  return <Shell playing={status.playing} position={status.currentTime} duration={duration} accent={accent} onPress={toggle} />;
}

function Shell({ playing, position, duration, accent, onPress }: { playing: boolean; position: number; duration: number; accent: string; onPress?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Пауза' : 'Слушать'}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', opacity: onPress ? 1 : 0.5 }}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={colors.greenText} />
      </Pressable>
      <View style={{ flex: 1, gap: 6 }}>
        <ProgressBar value={duration ? position / duration : 0} color={accent} height={4} />
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {mmss(position)} / {mmss(duration)}
        </Text>
      </View>
    </View>
  );
}
