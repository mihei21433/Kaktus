import { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { LABELS, MemberLabel } from '@/data/mod';
import { Card, Small, Tag } from '@/ui';
import { colors, font } from '@/theme';

export const LABEL_COLOR: Record<MemberLabel, string> = {
  on_plan: colors.green,
  behind: colors.orange,
  no_reports: colors.red,
  new: colors.textSecondary,
};

export function LabelTag({ label, blocked }: { label: MemberLabel; blocked?: boolean }) {
  if (blocked) return <Tag label="Заблокирован" color={colors.red} />;
  return <Tag label={LABELS[label]} color={LABEL_COLOR[label]} />;
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.cardAlt,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: size * 0.36 }}>{initials(name)}</Text>
    </View>
  );
}

export function ScreenTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={font.h2}>{children}</Text>
      {right}
    </View>
  );
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (error) {
    return (
      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.red, fontSize: 14 }}>{error}</Text>
        <Text onPress={onRetry} style={{ color: colors.blue, fontWeight: '600' }}>
          Повторить
        </Text>
      </Card>
    );
  }
  if (loading) return <Small>Загрузка…</Small>;
  return null;
}
