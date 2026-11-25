import { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, radius, space } from '@/theme';

export { Ionicons };

/* ---------- Экран ---------- */

type ScreenProps = {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** В табах нижний отступ даёт таб-бар. */
  inTabs?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ children, header, footer, scroll = true, inTabs, contentStyle }: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={inTabs ? ['top'] : ['top', 'bottom']}>
      {header}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ---------- Шапка ---------- */

type HeaderProps = {
  title?: string;
  backLabel?: string;
  onBack?: () => void;
  rightLabel?: string;
  onRight?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  rightColor?: string;
};

export function Header({ title, backLabel = 'Назад', onBack, rightLabel, onRight, rightIcon, rightColor }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.headerLink}>{backLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
        {onRight ? (
          <Pressable onPress={onRight} hitSlop={12}>
            {rightIcon ? (
              <Ionicons name={rightIcon} size={24} color={rightColor ?? colors.green} />
            ) : (
              <Text style={[styles.headerLink, rightColor ? { color: rightColor } : null]}>{rightLabel}</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- Текст ---------- */

export function H1({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[font.h1, style]}>{children}</Text>;
}
export function Caption({ children, style, color }: { children: ReactNode; style?: object; color?: string }) {
  return <Text style={[font.caption, color ? { color } : null, style]}>{children}</Text>;
}
export function Small({ children, style, color }: { children: ReactNode; style?: object; color?: string }) {
  return <Text style={[font.small, color ? { color } : null, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[font.body, style]}>{children}</Text>;
}

/* ---------- Карточка ---------- */

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  borderColor?: string;
  background?: string;
};

export function Card({ children, style, onPress, borderColor, background }: CardProps) {
  const s = [
    styles.card,
    borderColor ? { borderColor } : null,
    background ? { backgroundColor: background } : null,
    style,
  ];
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [...s, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

/** Строка-ссылка внутри карточки: «Мой поток   Поток «Весна» ›» */
export function RowLink({
  title,
  subtitle,
  value,
  onPress,
  color,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.rowLink, pressed && styles.pressed]}>
      <View style={{ flex: 1 }}>
        <Text style={[font.body, color ? { color } : null]}>{title}</Text>
        {subtitle ? <Small style={{ fontSize: 12 }}>{subtitle}</Small> : null}
      </View>
      {value ? <Small>{value}</Small> : null}
      {onPress && !color ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

/* ---------- Кнопки ---------- */

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'blue';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, style, small }: ButtonProps) {
  const bg = disabled
    ? colors.cardAlt
    : { primary: colors.green, secondary: colors.cardAlt, danger: colors.red, blue: colors.blue }[variant];
  const fg = disabled ? colors.textMuted : variant === 'secondary' ? colors.text : variant === 'primary' ? colors.greenText : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg },
        pressed && styles.pressed,
        style,
      ]}>
      <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function LinkButton({ title, onPress, color = colors.green }: { title: string; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
      <Text style={{ color, fontSize: 14, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/* ---------- Чипы, теги, сегменты ---------- */

export function Chip({
  label,
  selected,
  onPress,
  color = colors.green,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { borderColor: color, backgroundColor: color + '22' },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.chipText, selected && { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Tag({ label, color = colors.green, center }: { label: string; color?: string; center?: boolean }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '26' }, center && { alignSelf: 'center' }]}>
      <Text style={[styles.tagText, { color }]}>{label}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && { color: colors.text }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Ввод ---------- */

type FieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  counter?: boolean;
  right?: ReactNode;
  focusColor?: string;
};

export function Field({ label, hint, counter, right, style, multiline, maxLength, value, focusColor, ...rest }: FieldProps) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Caption>{label}</Caption> : null}
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          multiline={multiline}
          maxLength={maxLength}
          value={value}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          selectionColor={focusColor ?? colors.green}
          {...rest}
        />
        {right}
      </View>
      {hint || counter ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Small style={{ fontSize: 12, flex: 1 }}>{hint ?? ''}</Small>
          {counter && maxLength ? (
            <Small style={{ fontSize: 12 }}>
              {(value ?? '').length} / {maxLength}
            </Small>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      style={styles.checkRow}
      hitSlop={6}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Ionicons name="checkmark" size={16} color={colors.greenText} /> : null}
      </View>
      {typeof label === 'string' ? <Text style={[font.body, { flex: 1, fontSize: 14 }]}>{label}</Text> : label}
    </Pressable>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.borderStrong, true: colors.green }}
      thumbColor="#fff"
      ios_backgroundColor={colors.borderStrong}
    />
  );
}

/* ---------- Прогресс ---------- */

export function ProgressBar({ value, color = colors.green, height = 6 }: { value: number; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={{ width: `${v * 100}%`, backgroundColor: color, height, borderRadius: height }} />
    </View>
  );
}

/* ---------- Диалог ---------- */

type DialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Отмена',
  destructive = true,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={font.title}>{title}</Text>
          {message ? <Small style={{ marginTop: 6 }}>{message}</Small> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <Button title={cancelLabel} variant="secondary" onPress={onCancel} style={{ flex: 1 }} small />
            <Button
              title={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              style={{ flex: 1 }}
              small
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- Пустые состояния, плитки ---------- */

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
      <Text style={[font.title, { textAlign: 'center' }]}>{title}</Text>
      {text ? <Small style={{ textAlign: 'center', marginTop: 6 }}>{text}</Small> : null}
    </Card>
  );
}

export function Stat({
  label,
  value,
  sub,
  subColor,
  onPress,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  return (
    <Card style={{ flex: 1, minHeight: 84 }} onPress={onPress}>
      <Caption style={{ fontSize: 10 }}>{label}</Caption>
      <Text style={[font.h2, { marginTop: 4 }]}>{value}</Text>
      {children}
      {sub ? <Small style={{ fontSize: 11, marginTop: 4 }} color={subColor}>{sub}</Small> : null}
    </Card>
  );
}

export const ui = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gap: { gap: space.md },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerSide: { width: 80 },
  headerTitle: { flex: 1, textAlign: 'center', ...font.title },
  headerLink: { color: colors.blue, fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLink: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  pressed: { opacity: 0.7 },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonSmall: { height: 40 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
  },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '700' },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.borderStrong },
  segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 12, paddingVertical: 12, minHeight: 46 },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.green, borderColor: colors.green },
  progressTrack: { backgroundColor: colors.cardAlt, borderRadius: 6, overflow: 'hidden' },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.border },
});
