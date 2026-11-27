import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar, LoadState } from '@/components/mod-ui';
import { api, ApiError } from '@/data/api';
import { RequestItem, timeAgo, useQuery } from '@/data/mod';
import { useApp } from '@/data/store';
import { Button, Card, ConfirmDialog, Header, Screen, Segmented, Small } from '@/ui';
import { font } from '@/theme';

type Tab = 'pending' | 'approved' | 'rejected';

export default function RequestsScreen() {
  const [tab, setTab] = useState<Tab>('pending');
  const { data, error, loading, reload } = useQuery<RequestItem[]>(`/v1/mod/requests?status=${tab}`);
  const pending = useQuery<RequestItem[]>('/v1/mod/requests?status=pending');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<RequestItem | null>(null);
  const { showError } = useApp();

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await api('POST', `/v1/mod/memberships/${id}/${decision}`);
    } catch (e) {
      showError(e instanceof ApiError ? e.message : 'Не удалось сохранить решение');
    } finally {
      setBusy(null);
      await Promise.all([reload(), pending.reload()]);
    }
  };

  const count = pending.data?.length ?? 0;

  return (
    <Screen inTabs header={<Header title={count ? `Заявки · ${count}` : 'Заявки'} />}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'pending', label: 'Ожидают' },
          { value: 'approved', label: 'Одобрены' },
          { value: 'rejected', label: 'Отклонены' },
        ]}
      />
      {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : null}
      {data?.length === 0 ? (
        <Small style={{ textAlign: 'center', marginTop: 12 }}>
          {tab === 'pending' ? 'Новых заявок нет' : tab === 'approved' ? 'Одобренных заявок пока нет' : 'Отклонённых заявок нет'}
        </Small>
      ) : null}
      {data?.map((r) => (
        <Card key={r.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={r.name} uri={r.avatarUrl} />
            <View style={{ flex: 1 }}>
              <Text style={font.title}>{r.name}</Text>
              <Small style={{ fontSize: 12 }}>
                {r.streamName} · код {r.streamCode} · {timeAgo(r.decidedAt ?? r.requestedAt)}
              </Small>
              {r.contact && r.contact !== r.name ? <Small style={{ fontSize: 12 }}>{r.contact}</Small> : null}
            </View>
          </View>
          {tab === 'pending' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Принять" variant="blue" small style={{ flex: 1 }} disabled={busy === r.id} onPress={() => decide(r.id, 'approve')} />
              <Button title="Отклонить" variant="secondary" small style={{ flex: 1 }} disabled={busy === r.id} onPress={() => setRejecting(r)} />
            </View>
          ) : null}
        </Card>
      ))}
      <Small style={{ fontSize: 12 }}>После подтверждения участник попадает в поток и получает уведомление.</Small>
      <ConfirmDialog
        visible={!!rejecting}
        title={`Отклонить заявку: ${rejecting?.name ?? ''}?`}
        message={`Человек не попадёт в ${rejecting?.streamName ?? 'поток'} и получит уведомление об отказе. Вернуть заявку нельзя — вступить можно будет только по новой заявке.`}
        confirmLabel="Отклонить"
        onCancel={() => setRejecting(null)}
        onConfirm={() => {
          const r = rejecting!;
          setRejecting(null);
          void decide(r.id, 'reject');
        }}
      />
    </Screen>
  );
}
