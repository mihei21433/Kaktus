import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Goal, Task } from '@/data/types';
import { Checkbox, Tag } from '@/ui';
import { colors, radius } from '@/theme';

export function TaskRow({
  task,
  goal,
  done,
  onToggle,
  showGoal = true,
  accent,
}: {
  task: Task;
  goal?: Goal;
  done: boolean;
  onToggle: () => void;
  showGoal?: boolean;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        accent && goal ? { borderLeftWidth: 3, borderLeftColor: goal.color } : null,
        pressed && { opacity: 0.8 },
      ]}>
      <Checkbox checked={done} onChange={onToggle} />
      <View style={{ flex: 1, gap: 4 }}>
        {showGoal && goal ? <Tag label={goal.title} color={goal.color} /> : null}
        <Text style={[styles.text, done && styles.done]}>{task.text}</Text>
        {task.comment ? <Text style={styles.comment}>Модератор: {task.comment}</Text> : null}
      </View>
      {task.minValue ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {task.minValue} {task.unit}
        </Text>
      ) : null}
      {task.fromModerator ? <Tag label="от модератора" color={colors.blue} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  text: { color: colors.text, fontSize: 15 },
  done: { color: colors.textMuted, textDecorationLine: 'line-through' },
  comment: { color: colors.blue, fontSize: 12 },
});
