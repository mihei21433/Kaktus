/** Шаблон настроек модератора: сохранить настройки потока-образца и применить их к другому потоку. */
import { useState } from 'react';
import { Text, View } from 'react-native';

import { api, ApiError } from '@/data/api';
import { useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { formatDayMonth } from '@/lib/date';
import { Button, Card, ConfirmDialog, Small, ui } from '@/ui';
import { colors, font } from '@/theme';

export type TemplateInfo = { template: { sourceStream: string; savedAt: string } | null };

export const TEMPLATE_INCLUDES =
  'Шаблон хранит модули, порог шагов, физнормативы, нормы анализов, целевой индекс, напоминания и сроки целей. Название, код, длительность, подтверждение заявок, участники и команда не переносятся.';

export function TemplateCard({ streamId, streamName, onApplied }: { streamId: string; streamName: string; onApplied: () => Promise<void> }) {
  const { showError } = useApp();
  const { data, reload } = useQuery<TemplateInfo>('/v1/mod/template');
  const [confirm, setConfirm] = useState<'save' | 'apply' | null>(null);
  const t = data?.template ?? null;

  const run = async (what: 'save' | 'apply') => {
    try {
      await api('POST', `/v1/mod/streams/${streamId}/${what === 'save' ? 'template' : 'apply-template'}`);
      await reload();
      if (what === 'apply') await onApplied();
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не получилось');
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <Text style={font.title}>Шаблон настроек</Text>
      <Small color={colors.text}>
        {t ? `Сохранён ${formatDayMonth(t.savedAt.slice(0, 10))} из «${t.sourceStream}».` : 'Шаблона пока нет. «Сохранить шаблон» запомнит настройки этого потока.'}
      </Small>
      <Small style={{ fontSize: 12 }}>{TEMPLATE_INCLUDES}</Small>
      <Small style={{ fontSize: 12 }}>Каждый новый поток получает шаблон при создании.</Small>
      <View style={ui.row}>
        <Button title="Применить к потоку" variant="blue" small style={{ flex: 1 }} disabled={!t} onPress={() => setConfirm('apply')} />
        <Button title="Сохранить шаблон" variant="secondary" small style={{ flex: 1 }} onPress={() => (t ? setConfirm('save') : void run('save'))} />
      </View>
      <ConfirmDialog
        visible={confirm === 'save'}
        title="Перезаписать шаблон?"
        message={`Сейчас в шаблоне настройки из «${t?.sourceStream ?? ''}». Их заменят настройки потока «${streamName}».`}
        confirmLabel="Перезаписать"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run('save');
        }}
      />
      <ConfirmDialog
        visible={confirm === 'apply'}
        title={`Применить шаблон к «${streamName}»?`}
        message="Настройки потока заменятся настройками из шаблона. Участники и их данные не пострадают: свои сроки, на которые уже поставлены цели, останутся выключенными."
        confirmLabel="Применить"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void run('apply');
        }}
      />
    </Card>
  );
}
