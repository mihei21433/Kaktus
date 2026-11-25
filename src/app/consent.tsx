import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { ConsentBody } from '@/components/consent-body';
import { CONSENT_EDITION, CONSENT_TITLE } from '@/data/consent-text';
import { useApp } from '@/data/store';
import { Button, Checkbox, Header, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function ConsentScreen() {
  const { actions } = useApp();
  const [checked, setChecked] = useState(false);

  return (
    <Screen header={<Header title="Согласие" />}>
      <Text style={[font.h1, { fontSize: 24 }]}>{CONSENT_TITLE}</Text>
      <ConsentBody />
      <Small>{CONSENT_EDITION}</Small>
      <Checkbox
        checked={checked}
        onChange={setChecked}
        label="Согласен на обработку моих персональных данных и данных о здоровье, в том числе на их передачу внешней модели ИИ, как описано выше"
      />
      <Small style={{ fontSize: 12, marginLeft: 32 }}>
        Если вы раньше выключали передачу данных модели ИИ, она останется выключенной. Включить или выключить её можно в любой
        момент в профиле — «Согласие на обработку данных».
      </Small>
      {!checked ? <Small style={{ color: colors.textMuted }}>Отметьте согласие на обработку данных, чтобы продолжить</Small> : null}
      <Button
        title="Принимаю"
        disabled={!checked}
        onPress={() => {
          actions.acceptConsent();
          router.replace('/');
        }}
      />
    </Screen>
  );
}
