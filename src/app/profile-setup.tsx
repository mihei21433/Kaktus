import { router } from 'expo-router';

import { ProfileForm } from '@/components/profile-form';
import { useApp } from '@/data/store';
import { Header } from '@/ui';

export default function ProfileSetup() {
  const { actions } = useApp();
  return (
    <ProfileForm
      header={
        <Header
          title="Ваш профиль"
          rightLabel="Позже"
          rightColor="#9AA6B2"
          onRight={() => {
            actions.skipProfile();
            router.replace('/');
          }}
        />
      }
      submitLabel="Начать"
      requireAccept
      onDone={() => router.replace('/')}
    />
  );
}
