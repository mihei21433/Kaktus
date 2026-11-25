import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { ConsentBody } from '@/components/consent-body';
import { useApp } from '@/data/store';
import { formatDayMonth, formatTime, dateKey } from '@/lib/date';
import { Card, Header, Screen, Small, Toggle, ui } from '@/ui';
import { colors } from '@/theme';

export default function ConsentSettings() {
  const { state, actions } = useApp();
  const c = state.consent!;
  const accepted = new Date(c.acceptedAt);
  return (
    <Screen header={<Header title="Согласие" onBack={() => router.back()} />}>
      <Card style={{ gap: 12 }}>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.text }}>Редакция</Text>
          <Small>от 1 ноября</Small>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.text }}>Принято</Text>
          <Small>
            {formatDayMonth(dateKey(accepted))} в {formatTime(c.acceptedAt)}
          </Small>
        </View>
        <View style={[ui.row, { justifyContent: 'space-between' }]}>
          <Text style={{ color: colors.text, flex: 1 }}>Передача данных внешней модели ИИ</Text>
          <Toggle value={c.aiTransfer} onChange={actions.setAiTransfer} />
        </View>
      </Card>
      <Small style={{ fontSize: 12 }}>
        {c.aiTransfer
          ? 'ИИ распознаёт бланки и шаги, расшифровывает голосовые заявления и пишет подсказки по вашим данным.'
          : 'ИИ выключен: значения анализов и шагов вводятся вручную, голосовые заявления остаются записью, подсказки ИИ по вашим данным не строятся.'}
      </Small>
      <Small style={{ fontSize: 12 }}>Чтобы отозвать согласие полностью, удалите аккаунт.</Small>
      <ConsentBody />
    </Screen>
  );
}
