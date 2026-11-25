import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';

import { LoadState } from '@/components/mod-ui';
import { api, ApiError } from '@/data/api';
import { useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { Stream } from '@/data/types';
import { Button, Caption, Card, ConfirmDialog, Header, Screen, Small, Toggle, ui } from '@/ui';
import { colors, font } from '@/theme';

type Settings = Stream & { requireApproval: boolean };
type ModuleKey = keyof Stream['modules'];

const MODULES: { key: ModuleKey; title: string; sub: string }[] = [
  { key: 'statements', title: 'Утренние заявления', sub: 'текстом · ежедневно' },
  { key: 'steps', title: 'Шаги и физнормативы', sub: 'порог и нормативы потока' },
  { key: 'goals', title: 'Цели по срокам', sub: 'день, неделя, 1 и 3 месяца' },
  { key: 'analyses', title: 'Анализы и индекс здоровья', sub: 'появятся на следующем этапе' },
];

export default function StreamSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showError } = useApp();
  const { data, error, loading, reload } = useQuery<Settings>(`/v1/mod/streams/${id}`);
  const [threshold, setThreshold] = useState<string | null>(null);
  const [turningOff, setTurningOff] = useState<ModuleKey | null>(null);
  const [newCode, setNewCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const patch = async (body: object) => {
    try {
      await api('PATCH', `/v1/mod/streams/${id}`, body);
      await reload();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    }
  };

  return (
    <Screen header={<Header title="Настройки потока" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <Text style={font.h2}>{data.name}</Text>
          <Card style={{ gap: 10 }}>
            <Caption color={colors.blue}>Код-приглашение</Caption>
            <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: 4 }}>{data.code}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title={copied ? 'Скопировано' : 'Скопировать'}
                variant="secondary"
                small
                style={{ flex: 1 }}
                onPress={async () => {
                  await Clipboard.setStringAsync(data.code);
                  setCopied(true);
                }}
              />
              <Button
                title="Поделиться"
                variant="secondary"
                small
                style={{ flex: 1 }}
                onPress={() =>
                  Share.share({
                    message: `Приглашаю в ${data.name} в приложении «Кактус». Нажмите «Вступить по коду» и введите код: ${data.code}`,
                  })
                }
              />
              <Button title="Новый код" variant="secondary" small style={{ flex: 1 }} onPress={() => setNewCode(true)} />
            </View>
          </Card>

          <Caption>Правила потока</Caption>
          <Card style={{ gap: 14 }}>
            <View style={[ui.row, { justifyContent: 'space-between' }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15 }}>Подтверждение заявок</Text>
                <Small style={{ fontSize: 12 }}>{data.requireApproval ? 'Вы одобряете каждого' : 'Вступают сразу по коду'}</Small>
              </View>
              <Toggle value={data.requireApproval} onChange={(v) => patch({ requireApproval: v })} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Порог шагов в день</Text>
              <View style={ui.row}>
                <TextInput
                  value={threshold ?? String(data.stepsThreshold)}
                  onChangeText={(v) => setThreshold(v.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  style={{ flex: 1, height: 42, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border }}
                />
                <Button
                  title="Сохранить"
                  variant="blue"
                  small
                  disabled={threshold === null || threshold === String(data.stepsThreshold) || !threshold}
                  onPress={async () => {
                    await patch({ stepsThreshold: Number(threshold) });
                    setThreshold(null);
                  }}
                />
              </View>
            </View>
            <Small style={{ fontSize: 12 }}>
              Срок потока: {data.durationDays} дней, цели — до {data.goalDeadline}
            </Small>
          </Card>

          <Caption>Модули программы</Caption>
          <Card style={{ gap: 14 }}>
            {MODULES.map((m) => (
              <View key={m.key} style={[ui.row, { justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 15 }}>{m.title}</Text>
                  <Small style={{ fontSize: 12 }}>{m.sub}</Small>
                </View>
                <Toggle
                  value={data.modules[m.key]}
                  onChange={(v) => (v ? patch({ modules: { [m.key]: true } }) : setTurningOff(m.key))}
                />
              </View>
            ))}
          </Card>
          <Card borderColor="#5A4520" background={colors.orangeDim}>
            <Small color={colors.text}>Выключенный модуль исчезает у участников. Данные сохраняются.</Small>
          </Card>
          <Text style={[font.body, { color: colors.textMuted, fontSize: 12 }]}>
            Расписание напоминаний, физнормативы, сроки целей и шаблоны настроек — в следующих версиях.
          </Text>

          <ConfirmDialog
            visible={!!turningOff}
            title={`Выключить «${MODULES.find((m) => m.key === turningOff)?.title}»?`}
            message="Выключенный модуль исчезает у участников. Данные сохраняются."
            confirmLabel="Выключить"
            onCancel={() => setTurningOff(null)}
            onConfirm={() => {
              const k = turningOff!;
              setTurningOff(null);
              void patch({ modules: { [k]: false } });
            }}
          />
          <ConfirmDialog
            visible={newCode}
            title="Выпустить новый код?"
            message="Старый код перестанет работать. Участники, которые уже в потоке, останутся в нём."
            confirmLabel="Новый код"
            onCancel={() => setNewCode(false)}
            onConfirm={async () => {
              setNewCode(false);
              try {
                await api('POST', `/v1/mod/streams/${id}/new-code`);
                setCopied(false);
                await reload();
              } catch (e) {
                showError(e instanceof ApiError ? e.message : 'Не удалось выпустить код');
              }
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
