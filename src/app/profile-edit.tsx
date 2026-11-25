import { router } from 'expo-router';

import { ProfileForm } from '@/components/profile-form';
import { Header } from '@/ui';

export default function ProfileEdit() {
  return (
    <ProfileForm
      header={<Header title="Редактировать профиль" backLabel="Отмена" onBack={() => router.back()} />}
      submitLabel="Сохранить"
      onDone={() => router.back()}
    />
  );
}
