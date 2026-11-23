import { useMutation, useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, Platform, View } from 'react-native';

import { Avatar, Chip, EmptyState, ErrorState, InfoRow, Loading, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TeamSheet } from '@/components/TeamSheet';
import { Text } from '@/components/Text';
import { chaseAvailability, fetchFixture, fetchFixtureAvailability, fetchFixtureTeam, removeFixture } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { addFixtureToCalendar, calendarAvailable } from '@/lib/calendar';
import { errorMessage } from '@/lib/errors';
import { daysUntil, fullName, longDate, shortTime } from '@/lib/format';
import { confirm, useMyFixtures, useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

function openMaps(location: string) {
  const q = encodeURIComponent(location);
  Linking.openURL(Platform.OS === 'ios' ? `maps:?q=${q}` : `geo:0,0?q=${q}`).catch(() =>
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
  );
}

/** Fixture details + team sheet. Captains also get availability replies and edit/delete. */
export default function FixtureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fixtureId = Number(id);
  const { userId, managedSquads } = useSignedIn();
  const refresh = useRefreshAll();

  const fixture = useQuery({ queryKey: ['fixture', fixtureId], queryFn: () => fetchFixture(fixtureId) });
  const team = useQuery({ queryKey: ['fixtureTeam', fixtureId], queryFn: () => fetchFixtureTeam(fixtureId) });
  const mine = useMyFixtures().data?.find((f) => f.id === fixtureId);

  const f = fixture.data;
  const canManage = !!f && managedSquads.some((s) => s.id === f.squad_id);

  const replies = useQuery({
    queryKey: ['availability', fixtureId],
    queryFn: () => fetchFixtureAvailability(fixtureId),
    enabled: canManage,
  });

  const chase = useMutation({
    mutationFn: () => chaseAvailability(fixtureId),
    onSuccess: (n) => Alert.alert('Reminder sent', n === 0 ? 'Everyone has already replied.' : `Sent to ${n} player${n === 1 ? '' : 's'}.`),
    onError: (e) => Alert.alert('Couldn’t send', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => removeFixture(fixtureId),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t delete', errorMessage(e)),
  });

  if (fixture.isPending) return <Loading />;
  if (fixture.error || !f) {
    return (
      <Screen>
        <ErrorState error={fixture.error ?? new Error('Fixture not found')} onRetry={() => fixture.refetch()} />
      </Screen>
    );
  }

  const isPast = daysUntil(f.fixture_date) < 0;
  const players = (team.data ?? []).map((p) => ({
    user_id: p.user_id,
    pair_number: p.pair_number,
    selection_order: p.selection_order,
    first_name: p.profiles?.first_name ?? '?',
    surname: p.profiles?.surname ?? '',
  }));

  const yes = replies.data?.filter((r) => r.is_available === true) ?? [];
  const no = replies.data?.filter((r) => r.is_available === false) ?? [];
  const none = replies.data?.filter((r) => r.is_available == null) ?? [];

  return (
    <Screen onRefresh={refresh}>
      <Stack.Screen options={{ title: f.opponent_name }} />

      <Card>
        <View style={{ flexDirection: 'row', gap: space.sm, marginBottom: space.sm }}>
          <Chip label={f.is_home ? 'Home' : 'Away'} tone={f.is_home ? 'success' : 'warning'} />
          {f.squads?.name ? <Chip label={f.squads.name} tone="accent" /> : null}
        </View>
        <Text variant="title">
          {f.is_home ? 'vs' : '@'} {f.opponent_name}
        </Text>
        <View style={{ marginTop: space.sm }}>
          <InfoRow icon="calendar-outline" label="Date" value={longDate(f.fixture_date)} />
          <InfoRow icon="time-outline" label="Start" value={shortTime(f.start_time)} />
          <InfoRow
            icon="location-outline"
            label="Venue"
            value={
              <Text variant="bodyBold" color="accent" onPress={() => openMaps(f.location)}>
                {f.location}
              </Text>
            }
          />
          {f.divisions?.name && f.division_id ? (
            <InfoRow
              icon="podium-outline"
              label="Division"
              value={
                <Text
                  variant="bodyBold"
                  color="accent"
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: '/league/[divisionId]', params: { divisionId: String(f.division_id) } })}>
                  {f.divisions.name} · table
                </Text>
              }
            />
          ) : null}
          {f.opponent_league_position ? (
            <InfoRow icon="stats-chart-outline" label="Their position" value={ordinal(f.opponent_league_position)} />
          ) : null}
          {f.notes ? <InfoRow icon="document-text-outline" label="Notes" value={f.notes} last /> : null}
        </View>
        {calendarAvailable && !isPast ? (
          <Button
            title="Add to calendar"
            icon="calendar-outline"
            variant="secondary"
            size="sm"
            style={{ marginTop: space.md }}
            onPress={() =>
              addFixtureToCalendar(f).catch((e) => Alert.alert('Couldn’t open your calendar', errorMessage(e)))
            }
          />
        ) : null}
      </Card>

      <SectionHeader title="Team" />
      {players.length ? (
        <TeamSheet players={players} highlight={userId} />
      ) : (
        <EmptyState icon="people-outline" title="Team not picked yet" message="You’ll get a notification when the captain picks the team." />
      )}

      {mine && !isPast ? (
        <>
          <SectionHeader title="Your availability" />
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Chip
                label={mine.is_available == null ? 'Not replied' : mine.is_available ? 'Available' : 'Unavailable'}
                tone={mine.is_available == null ? 'warning' : mine.is_available ? 'success' : 'danger'}
              />
              <View style={{ flex: 1 }} />
              <Button
                title={mine.is_available == null ? 'Reply' : 'Change'}
                size="sm"
                variant="secondary"
                full={false}
                onPress={() => router.push({ pathname: '/availability/[fixtureId]', params: { fixtureId: String(fixtureId) } })}
              />
            </View>
            {mine.reason ? (
              <Text variant="small" color="textMuted" style={{ marginTop: space.sm }}>
                “{mine.reason}”
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      {isPast ? (
        <Button
          title="View result"
          icon="trophy-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/result/[fixtureId]', params: { fixtureId: String(fixtureId) } })}
        />
      ) : null}

      {canManage ? (
        <>
          <SectionHeader title={`Replies · ${yes.length} in · ${no.length} out · ${none.length} waiting`} />
          <Card>
            <View style={{ gap: space.md }}>
              {[...yes, ...no, ...none].map((r) => (
                <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar first={r.first_name} surname={r.surname} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold">{fullName(r)}</Text>
                    {r.reason || r.injury ? (
                      <Text variant="small" color="textMuted" numberOfLines={1}>
                        {r.injury ? `Injured: ${r.injury}${r.injury_can_play ? ' (can play)' : ''}` : r.reason}
                      </Text>
                    ) : null}
                  </View>
                  <Chip
                    label={r.is_available == null ? 'Waiting' : r.is_available ? 'In' : 'Out'}
                    tone={r.is_available == null ? 'neutral' : r.is_available ? 'success' : 'danger'}
                  />
                </View>
              ))}
              {replies.data?.length === 0 ? (
                <Text variant="small" color="textMuted">
                  No players in this squad yet.
                </Text>
              ) : null}
            </View>
          </Card>
          {!isPast && none.length > 0 ? (
            <Button title={`Remind ${none.length} player${none.length === 1 ? '' : 's'}`} icon="notifications-outline" variant="secondary" loading={chase.isPending} onPress={() => chase.mutate()} />
          ) : null}
          {!isPast ? (
            <Button
              title="Edit fixture & pick team"
              icon="create-outline"
              onPress={() => router.push({ pathname: '/fixture-edit', params: { id: String(fixtureId) } })}
            />
          ) : (
            <Button
              title="Enter or edit result"
              icon="create-outline"
              onPress={() => router.push({ pathname: '/result-entry/[fixtureId]', params: { fixtureId: String(fixtureId) } })}
            />
          )}
          <Button
            title="Delete fixture"
            icon="trash-outline"
            variant="danger"
            loading={remove.isPending}
            onPress={async () => {
              const ok = await confirm(
                'Delete this fixture?',
                isPast
                  ? 'Its result, team and partner feedback will be deleted too. This can’t be undone.'
                  : 'Players will be told it’s cancelled. Availability and team selection will be deleted.',
              );
              if (ok) remove.mutate();
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
