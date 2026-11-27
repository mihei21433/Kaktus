/** Личный код входа крупно, с кнопками «Скопировать» и «Сохранить себе»; и окно для показа кода, выданного модератором. */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Modal, Share, Text, View } from 'react-native';

import { Button, Card, Small } from '@/ui';
import { colors, font } from '@/theme';

export function CodeBox({ code, shareText, shareLabel = 'Сохранить себе' }: { code: string; shareText?: string; shareLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 22 }}>
      <Text selectable style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 3 }}>
        {code}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
        <Button
          title={copied ? 'Скопировано' : 'Скопировать'}
          variant="secondary"
          small
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(code);
            setCopied(true);
          }}
        />
        <Button
          title={shareLabel}
          variant="secondary"
          small
          style={{ flex: 1 }}
          onPress={() => Share.share({ message: shareText ?? `Мой код входа в «Кактус»: ${code}` }).catch(() => {})}
        />
      </View>
    </Card>
  );
}


/** Окно с выданным кодом: модератор передаёт его участнику или модератору команды. */
export function CodeDialog({ code, title, text, shareText, onClose }: { code: string | null; title: string; text: string; shareText: string; onClose: () => void }) {
  return (
    <Modal visible={!!code} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: colors.bg, borderRadius: 16, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border }}>
          <Text style={font.title}>{title}</Text>
          <Small>{text}</Small>
          {code ? <CodeBox code={code} shareText={shareText} shareLabel="Отправить" /> : null}
          <Small style={{ fontSize: 12 }} color={colors.orange}>
            После закрытия окна код не будет виден — передайте его сейчас.
          </Small>
          <Button title="Готово" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
