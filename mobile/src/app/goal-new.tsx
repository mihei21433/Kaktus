import { router } from 'expo-router';
import { useState } from 'react';

import { useApp } from '@/data/store';
import { Button, Field, Header, Screen, Small } from '@/ui';

export default function NewGoalScreen() {
  const { actions } = useApp();
  const [title, setTitle] = useState('');
  const [result, setResult] = useState('');
  return (
    <Screen
      header={<Header title="Своя цель" backLabel="Отмена" onBack={() => router.back()} />}
      footer={
        <Button
          title="Создать цель"
          disabled={!title.trim() || !result.trim()}
          onPress={() => {
            actions.createGoal(title.trim(), result.trim());
            router.back();
          }}
        />
      }>
      <Small>
        Цель сверх заданных модератором: дальше она живёт как любая глобальная цель — с критериями, задачами и прогрессом. Модератор
        видит её в вашем досье.
      </Small>
      <Field label="Название" value={title} onChangeText={setTitle} placeholder="Например: карьера, обучение, спорт" />
      <Field
        label="Что хочу получить"
        value={result}
        onChangeText={setResult}
        multiline
        maxLength={300}
        counter
        hint="Формулируйте измеримо: например, «пробежать 5 км без остановки»"
      />
    </Screen>
  );
}
