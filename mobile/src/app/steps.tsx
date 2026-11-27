import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { errorText, recognizeSteps } from '@/data/analyses';
import { useApp } from '@/data/store';
import { formatNumber, todayKey } from '@/lib/date';
import { Button, Caption, Card, Chip, Header, LinkButton, ProgressBar, Screen, Small, ui } from '@/ui';
import { colors, font } from '@/theme';

const PRESETS = [6000, 8000, 10000, 12000];

export default function StepsScreen() {
  const { state, actions, showError } = useApp();
  const stream = state.membership.stream!;
  const today = todayKey();
  const saved = state.steps[today];
  const [value, setValue] = useState(saved ? String(saved) : '');
  const [fit, setFit] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [recognized, setRecognized] = useState<string | null>(null);

  const fromScreenshot = async () => {
    setReading(true);
    try {
      const r = await recognizeSteps();
      if (!r) return;
      if (r.steps) {
        setValue(String(r.steps));
        setRecognized(`Распознано со скриншота: ${formatNumber(r.steps)}. Проверьте число и нажмите «Отправить шаги».`);
      } else setRecognized('На скриншоте не нашли число шагов. Попробуйте скриншот главного экрана шагомера или введите вручную.');
    } catch (e) {
      showError(errorText(e, 'Не получилось распознать скриншот'));
    } finally {
      setReading(false);
    }
  };
  const n = Number(value) || 0;
  const threshold = stream.stepsThreshold;

  if (!stream.modules.steps) {
    return (
      <Screen header={<Header title="Шаги" onBack={() => router.back()} />}>
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Text style={font.title}>Раздел выключен модератором потока</Text>
          <Small style={{ textAlign: 'center' }}>Всё, что вы уже внесли, сохранено — раздел появится, когда его включат.</Small>
          <Button title="К сегодняшнему дню" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      header={<Header title="Шаги за сегодня" onBack={() => router.back()} />}
      footer={
        <Button
          title={saved ? 'Обновить вручную' : 'Отправить шаги'}
          disabled={!n || n === saved}
          onPress={() => actions.setSteps(n)}
        />
      }>
      <Small color={colors.green}>● Норматив цели «Здоровье»</Small>
      {saved ? (
        <Card>
          <Text style={font.title}>Сегодня отправлено: {formatNumber(saved)} шагов</Text>
          <Small style={{ fontSize: 12 }}>вручную</Small>
        </Card>
      ) : null}
      <Caption>Количество шагов</Caption>
      <View style={[ui.row, { backgroundColor: colors.input, borderRadius: 12, borderWidth: 1, borderColor: colors.green, paddingHorizontal: 14 }]}>
        <TextInput
          value={value}
          onChangeText={(v) => setValue(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 26, fontWeight: '700', paddingVertical: 12 }}
        />
        <Small>шагов</Small>
      </View>
      {!state.demo ? (
        <Button title={reading ? 'Читаем скриншот…' : 'Распознать со скриншота'} variant="secondary" small disabled={reading} onPress={fromScreenshot} />
      ) : null}
      {recognized ? <Small style={{ fontSize: 12 }} color={colors.green}>{recognized}</Small> : null}
      <View style={ui.row}>
        {PRESETS.map((p) => (
          <View key={p} style={{ flex: 1 }}>
            <Chip label={formatNumber(p)} selected={n === p} onPress={() => setValue(String(p))} />
          </View>
        ))}
      </View>
      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Small>Порог на день</Small>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{formatNumber(threshold)} шагов</Text>
        </View>
        <ProgressBar value={n / threshold} color={colors.orange} />
        <Text style={{ color: colors.orange, fontSize: 12 }}>
          {n >= threshold ? 'Порог на сегодня выполнен' : `Не хватает ${formatNumber(threshold - n)} шагов до порога`}
        </Text>
      </Card>

      <Caption>Физнормативы</Caption>
      {stream.norms.map((norm) => {
        const cur = state.fitness[today]?.[norm.id];
        const input = fit[norm.id] ?? '';
        return (
          <Card key={norm.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={font.title}>{norm.name}</Text>
              <Small>
                Норма {norm.norm} {norm.unit}
              </Small>
            </View>
            {cur !== undefined ? (
              <>
                <ProgressBar value={cur / norm.norm} />
                <Small style={{ fontSize: 12 }} color={colors.text}>
                  Сегодня: {cur} из {norm.norm} {norm.unit}
                </Small>
              </>
            ) : (
              <Small style={{ fontSize: 12 }}>Сегодня ещё не вводили</Small>
            )}
            <View style={ui.row}>
              <TextInput
                value={input}
                onChangeText={(v) => setFit({ ...fit, [norm.id]: v.replace(/\D/g, '') })}
                keyboardType="number-pad"
                placeholder={cur !== undefined ? 'Исправить' : 'Сколько сегодня'}
                placeholderTextColor={colors.textMuted}
                style={{ flex: 1, color: colors.text, backgroundColor: colors.input, borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border }}
              />
              <LinkButton
                title="Сохранить"
                color={input ? colors.text : colors.textMuted}
                onPress={() => {
                  if (!input) return;
                  actions.setFitness(norm.id, Number(input));
                  setFit({ ...fit, [norm.id]: '' });
                }}
              />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
