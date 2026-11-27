import { router } from 'expo-router';

import { ProfileForm } from '@/components/profile-form';
import { Header } from '@/ui';

export default function ProfileSetup() {
  return (
    <ProfileForm
      header={
        <Header title="Ваш профиль" />
      }
      submitLabel="Начать"
      requireAccept
      onDone={() => router.replace('/')}
    />
  );
}
