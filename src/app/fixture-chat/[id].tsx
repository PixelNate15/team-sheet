import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Chat } from '@/components/Chat';
import { fetchFixture } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';

/** Chat and captain's notices for one fixture. */
export default function FixtureChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fixtureId = Number(id);
  const { managedSquads } = useSignedIn();
  const fixture = useQuery({ queryKey: ['fixture', fixtureId], queryFn: () => fetchFixture(fixtureId) });
  const f = fixture.data;
  const canManage = !!f && managedSquads.some((s) => s.id === f.squad_id);

  return (
    <>
      <Stack.Screen options={{ title: f ? `${f.is_home ? 'vs' : '@'} ${f.opponent_name}` : 'Chat' }} />
      <Chat fixtureId={fixtureId} canPostNotice={canManage} />
    </>
  );
}
