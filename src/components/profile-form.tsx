import { ReactNode, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useApp } from '@/data/store';
import { Button, Caption, Card, Checkbox, Field, Ionicons, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

const DEFAULT_CONTRACT =
  '«Я обязуюсь ежедневно закрывать задачи дня, проходить не менее 10 000 шагов в день и присылать утреннее заявление.»';

export function ProfileForm({
  header,
  submitLabel,
  requireAccept,
  onDone,
}: {
  header: ReactNode;
  submitLabel: string;
  requireAccept?: boolean;
  onDone: () => void;
}) {
  const { state, actions } = useApp();
  const p = state.profile;
  const [name, setName] = useState(p.name);
  const [about, setAbout] = useState(p.about);
  const [contract, setContract] = useState(p.contract || DEFAULT_CONTRACT);
  const [accepted, setAccepted] = useState(!!p.contractAcceptedAt);
  const locked = !!p.contractAcceptedAt;
  const canSubmit = !requireAccept || accepted;

  return (
    <Screen
      header={header}
      footer={
        <>
          {requireAccept && !accepted ? (
            <Small style={{ textAlign: 'center', fontSize: 12 }}>
              Отметьте «Принимаю обязательства» — или нажмите «Позже»
            </Small>
          ) : null}
          <Button
            title={submitLabel}
            disabled={!canSubmit}
            onPress={() => {
              actions.saveProfile({ name: name.trim() || p.name, about, contract, accepted });
              onDone();
            }}
          />
        </>
      }>
      <Small>Модератор увидит это. Можно заполнить позже.</Small>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="person-outline" size={24} color={colors.textMuted} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ваше имя"
            placeholderTextColor={colors.textMuted}
            style={[font.title, { padding: 0 }]}
          />
          <Text style={{ color: colors.blue, fontSize: 13 }}>Фото профиля — скоро</Text>
        </View>
      </View>
      <Field label="О себе" value={about} onChangeText={setAbout} placeholder="Пара слов о себе и своей цели" multiline maxLength={300} />
      <Caption>Личный контракт</Caption>
      <Card style={{ gap: 12 }}>
        <TextInput
          value={contract}
          onChangeText={setContract}
          multiline
          editable={!locked}
          style={{ color: colors.text, fontSize: 15, minHeight: 80, textAlignVertical: 'top', padding: 0 }}
        />
        {locked ? (
          <Text style={{ color: colors.green, fontSize: 13 }}>✓ Обязательства приняты</Text>
        ) : (
          <Checkbox checked={accepted} onChange={setAccepted} label="Принимаю обязательства" />
        )}
      </Card>
    </Screen>
  );
}
