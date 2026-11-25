import { Redirect } from 'expo-router';

import { useApp } from '@/data/store';

/** Точка входа: отправляет на нужный шаг онбординга или в приложение. */
export default function Index() {
  const { state, loggedIn } = useApp();
  const { consent, membership, profile } = state;
  if (!consent) return <Redirect href="/consent" />;
  if (loggedIn && state.account?.isModerator) return <Redirect href="/streams" />;
  switch (membership.status) {
    case 'none':
      return <Redirect href="/start" />;
    case 'pending':
      return <Redirect href="/pending" />;
    case 'rejected':
      return <Redirect href="/rejected" />;
    case 'blocked':
      return <Redirect href="/blocked" />;
  }
  if (!profile.completed) return <Redirect href="/profile-setup" />;
  return <Redirect href="/today" />;
}
