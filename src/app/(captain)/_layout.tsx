import { useQuery } from '@tanstack/react-query';
import { NativeTabs } from 'expo-router/native-tabs';

import { fetchFixturesNeedingResults } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function CaptainTabs() {
  const { c } = useTheme();
  const { activeSquad } = useAuth();
  const needs = useQuery({
    queryKey: ['needsResults', activeSquad?.id],
    queryFn: () => fetchFixturesNeedingResults(activeSquad!.id),
    enabled: !!activeSquad,
  });
  const pending = needs.data?.length ?? 0;

  return (
    <NativeTabs tintColor={c.accent} backgroundColor={c.surface} indicatorColor={c.accentSoft} badgeBackgroundColor={c.danger}>
      <NativeTabs.Trigger name="squad">
        <NativeTabs.Trigger.Label>Squad</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="matchday">
        <NativeTabs.Trigger.Label>Fixtures</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar.badge.plus" md="event" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="scores">
        <NativeTabs.Trigger.Label>Results</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.number" md="scoreboard" />
        <NativeTabs.Trigger.Badge hidden={pending === 0}>{String(pending)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="club">
        <NativeTabs.Trigger.Label>Club</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'building.2', selected: 'building.2.fill' }} md="apartment" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
