import { Stack } from 'expo-router';

import { Chat } from '@/components/Chat';
import { useSignedIn } from '@/lib/auth';

/** Chat for everyone in the club. Only club admins can post club notices, which notify everyone. */
export default function ClubChat() {
  const { club, isAdmin } = useSignedIn();
  return (
    <>
      <Stack.Screen options={{ title: club.name }} />
      <Chat canPostNotice={isAdmin} />
    </>
  );
}
