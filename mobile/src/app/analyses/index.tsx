import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { DISCLAIMER, IndexCard } from '@/components/analyses-ui';
import { LoadState } from '@/components/mod-ui';
import { api } from '@/data/api';
import { type Analyses, errorText, latestWithValues, openBlank, pickFromCamera, pickFromFiles, uploadBlank } from '@/data/analyses';
import { useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { formatDayMonth } from '@/lib/date';
import { Button, Caption, Card, ConfirmDialog, Header, Ionicons, Screen, Small } from '@/ui';
import { colors, font } from '@/theme';

export default function AnalysesHub() {
  const { state, showError } = useApp();
  const { data, error, loading, reload } = useQuery<Analyses>(state.demo ? null : '/v1/me/analyses');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  if (state.demo) {
    return (
      <Screen header={<Header title="Анализы" onBack={() => router.back()} />}>
        <Card style={{ gap: 6 }}>
          <Text style={font.title}>Анализы работают с сервером</Text>
          <Small>В демо-режиме раздел недоступен: бланки и значения хранятся только на сервере программы.</Small>
        </Card>
      </Screen>
    );
  }

  const current = data?.measurements.find((m) => m.id === data.currentId) ?? null;
  const latest = data ? latestWithValues(data) : null;
  const indexed = data ? ([...data.measurements].reverse().find((m) => m.index) ?? null) : null;

  const add = async (from: 'camera' | 'files') => {
    if (!current) return;
    setBusy(true);
    try {
      const f = from === 'camera' ? await pickFromCamera() : await pickFromFiles();
      if (f === 'denied') showError('Нет доступа к камере. Разрешите его в настройках телефона или выберите файл.');
      else if (f) {
        await uploadBlank(current.id, f);
        await reload();
      }
    } catch (e) {
      showError(errorText(e, 'Не удалось загрузить бланк'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header title="Анализы" onBack={() => router.back()} />}>
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data ? (
        <>
          {current ? (
            <Card background="#14243A" borderColor="#1E3A5C" style={{ gap: 4 }}>
              <Text style={[font.title, { color: colors.blue }]}>
                {current.submittedAt ? 'Результаты залиты' : `Сдайте анализы до ${formatDayMonth(current.deadline)}`}
              </Text>
              <Small style={{ fontSize: 12 }}>
                Замер «{current.name}» открыт{current.submittedAt ? ' — можно дополнить до закрытия' : ''}
              </Small>
            </Card>
          ) : (
            <Card>
              <Small color={colors.text}>Сейчас нет открытого замера. Модератор откроет его, когда придёт время сдавать анализы.</Small>
            </Card>
          )}

          <IndexCard m={indexed} target={data.targetIndex} onPress={() => router.push('/analyses/health-index')} />

          <Card onPress={() => router.push('/analyses/mine')} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={font.title}>Мои анализы</Text>
              <Small style={{ fontSize: 12 }}>
                {latest ? `${latest.summary.filled} из ${latest.summary.total} показателей · ${latest.summary.deviation} откл.` : 'результаты и динамика по замерам'}
              </Small>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Card>

          {current ? (
            <>
              <Caption>Бланки замера «{current.name}»</Caption>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Камера" variant="secondary" small style={{ flex: 1 }} disabled={busy} onPress={() => add('camera')} />
                <Button title="Файлы" variant="secondary" small style={{ flex: 1 }} disabled={busy} onPress={() => add('files')} />
              </View>
              {busy ? <Small>Загружаем…</Small> : null}
              {current.blanks.length === 0 ? (
                <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 16 }}>
                  <Text style={font.title}>Бланков пока нет</Text>
                  <Small style={{ textAlign: 'center' }}>Сфотографируйте бланк или выберите файл (фото или PDF).</Small>
                </Card>
              ) : (
                current.blanks.map((b) => (
                  <Card key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ backgroundColor: colors.cardAlt, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 10, fontWeight: '700' }}>{b.mime === 'application/pdf' ? 'PDF' : 'ФОТО'}</Text>
                    </View>
                    <Pressable style={{ flex: 1 }} onPress={() => openBlank(`/v1/me/blanks/${b.id}/link`).catch((e) => showError(errorText(e, 'Не удалось открыть')))}>
                      <Text style={{ color: colors.text, fontSize: 14 }} numberOfLines={1}>
                        {b.fileName}
                      </Text>
                      <Small style={{ fontSize: 11 }}>{Math.max(1, Math.round(b.size / 1024))} КБ · открыть</Small>
                    </Pressable>
                    <Pressable onPress={() => setRemoving(b.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                    </Pressable>
                  </Card>
                ))
              )}
              {current.blanks.length ? (
                <>
                  <Button title="Распознать бланки" onPress={() => router.push({ pathname: '/analyses/recognize', params: { mid: current.id } })} />
                  <Small style={{ fontSize: 12 }}>
                    Программа прочитает значения с бланков, а вы проверите их перед сохранением. Текст читается на сервере программы в
                    Казахстане и никуда не передаётся.
                  </Small>
                </>
              ) : null}
              <Button
                title={current.submittedAt ? 'Изменить значения' : 'Ввести значения вручную'}
                variant={current.blanks.length ? 'secondary' : 'primary'}
                onPress={() => router.push({ pathname: '/analyses/entry', params: { mid: current.id } })}
              />
            </>
          ) : null}
          <Small style={{ fontSize: 11 }}>{DISCLAIMER}</Small>
          <ConfirmDialog
            visible={!!removing}
            title="Удалить бланк?"
            message="Файл удалится с сервера. Введённые значения останутся."
            confirmLabel="Удалить"
            onCancel={() => setRemoving(null)}
            onConfirm={async () => {
              const id = removing!;
              setRemoving(null);
              try {
                await api('DELETE', `/v1/me/blanks/${id}`);
                await reload();
              } catch (e) {
                showError(errorText(e, 'Не удалось удалить'));
              }
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
