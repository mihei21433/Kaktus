import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { RequestCard, StatusIcon } from '@/components/request-card';
import { useApp } from '@/data/store';
import { Button, Screen, Small, Tag } from '@/ui';
import { colors, font } from '@/theme';

export default function RejectedScreen() {
  const { state, actions } = useApp();
  const stream = state.membership.stream;
  return (
    <Screen
      scroll={false}
      footer={
        <Button
          title="Ввести другой код"
          onPress={() => {
            actions.cancelRequest();
            router.replace('/join');
          }}
        />
      }>
      <View style={{ marginTop: 40, gap: 12, alignItems: 'center' }}>
        <StatusIcon icon="✕" color={colors.red} />
        <Tag label="Заявка отклонена" color={colors.red} center />
        <Text style={font.h2}>Заявку отклонили</Text>
        <Small style={{ textAlign: 'center', maxWidth: 300 }}>
          Модератор потока {stream?.name} отклонил заявку. Проверьте код или попросите новый у модератора.
        </Small>
      </View>
      {stream ? (
        <View style={{ marginTop: 24 }}>
          <RequestCard stream={stream} status="Отклонена" statusColor={colors.red} />
        </View>
      ) : null}
    </Screen>
  );
}
