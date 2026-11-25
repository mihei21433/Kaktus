import { Text, View } from 'react-native';

import { CONSENT_TEXT } from '@/data/consent-text';
import { Card } from '@/ui';
import { colors, font } from '@/theme';

export function ConsentBody() {
  return (
    <Card style={{ gap: 8 }}>
      {CONSENT_TEXT.map((b, i) => {
        if (b.type === 'h') return <Text key={i} style={[font.title, { marginTop: i ? 10 : 0 }]}>{b.text}</Text>;
        if (b.type === 'p') return <Text key={i} style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{b.text}</Text>;
        return (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((it, j) => (
              <Text key={j} style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                •  {it}
              </Text>
            ))}
          </View>
        );
      })}
    </Card>
  );
}
