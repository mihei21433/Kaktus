import { ReactNode, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useApp } from '@/data/store';
import { Button, Caption, Card, Checkbox, Field, Ionicons, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

const CONTRACT_MIN = 10;

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
  const [phone, setPhone] = useState(p.phone ?? '');
  const [about, setAbout] = useState(p.about);
  const [contract, setContract] = useState(p.contract);
  const [accepted, setAccepted] = useState(!!p.contractAcceptedAt);
  const locked = !!p.contractAcceptedAt;
  const contractOk = locked || contract.trim().length >= CONTRACT_MIN;
  const canSubmit = !!name.trim() && (!requireAccept || (accepted && contractOk));

  return (
    <Screen
      header={header}
      footer={
        <>
          {requireAccept && !canSubmit ? (
            <Small style={{ textAlign: 'center', fontSize: 12 }}>
              {!contractOk ? 'Напишите свой личный контракт' : 'Отметьте «Принимаю обязательства»'}
            </Small>
          ) : null}
          <Button
            title={submitLabel}
            disabled={!canSubmit}
            onPress={() => {
              actions.saveProfile({ name: name.trim() || p.name, phone: phone.trim() || undefined, about, contract: contract.trim(), accepted });
              onDone();
            }}
          />
        </>
      }>
      <Small>Модератор увидит это.</Small>
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
            placeholder="Имя и фамилия"
            placeholderTextColor={colors.textMuted}
            style={[font.title, { padding: 0 }]}
          />
          <Text style={{ color: colors.blue, fontSize: 13 }}>Фото профиля — скоро</Text>
        </View>
      </View>
      <Field
        label="Телефон для связи"
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/[^\d+\s()-]/g, '').slice(0, 20))}
        placeholder="+7 777 123 45 67"
        keyboardType="phone-pad"
      />
      <Field label="О себе" value={about} onChangeText={setAbout} placeholder="Пара слов о себе и своей цели" multiline maxLength={300} />
      <Caption>Личный контракт</Caption>
      {!locked ? (
        <Small style={{ fontSize: 12 }}>
          Своими словами: что вы обещаете себе на время потока. Например: «Каждый день прохожу 10 000 шагов, ложусь до 23:00 и не ем
          сладкое после шести».
        </Small>
      ) : null}
      <Card style={{ gap: 12 }}>
        <TextInput
          value={contract}
          onChangeText={setContract}
          multiline
          editable={!locked}
          maxLength={1000}
          placeholder="Я обязуюсь…"
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 15, minHeight: 100, textAlignVertical: 'top', padding: 0 }}
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
