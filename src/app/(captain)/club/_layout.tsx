import { Stack } from 'expo-router';

import { useTabHeader } from '@/components/TabStack';

export default function ClubLayout() {
  const options = useTabHeader();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Club' }} />
      <Stack.Screen name="members" options={{ title: 'Members', headerLargeTitle: false }} />
      <Stack.Screen name="squads" options={{ title: 'Teams', headerLargeTitle: false }} />
      <Stack.Screen name="seasons" options={{ title: 'Seasons & divisions', headerLargeTitle: false }} />
      <Stack.Screen name="fees" options={{ title: 'Match fees', headerLargeTitle: false }} />
      <Stack.Screen name="report" options={{ title: 'Season report', headerLargeTitle: false }} />
      <Stack.Screen name="invites" options={{ title: 'Import players', headerLargeTitle: false }} />
      <Stack.Screen name="balance" options={{ title: 'Selection balance', headerLargeTitle: false }} />
      <Stack.Screen name="venues" options={{ title: 'Venues', headerLargeTitle: false }} />
    </Stack>
  );
}
