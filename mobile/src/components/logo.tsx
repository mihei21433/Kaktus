import { Text, View } from 'react-native';

import { colors } from '@/theme';

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        backgroundColor: colors.green,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: size * 0.5, fontWeight: '800', color: colors.greenText }}>К</Text>
    </View>
  );
}

