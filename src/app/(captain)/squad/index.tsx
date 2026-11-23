import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Alert, View } from 'react-native';

import { EmptyState, ErrorState, SectionHeader, Skeleton } from '@/components/Bits';
import { Button, IconButton } from '@/components/Button';
import { PlayerCard } from '@/components/PlayerCard';
import { Screen } from '@/components/Screen';
import { SquadSwitcher } from '@/components/SquadSwitcher';
import { fetchClubPlayers, movePlayerDown } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { confirm, useRefreshAll } from '@/lib/hooks';
import type { ClubPlayer } from '@/lib/types';
import { space } from '@/theme';

/** Port of captain_main_screen.py: squad list with stats; long-press to move a player down. */
export default function Squad() {
  const { activeSquad, userId, me } = useSignedIn();
  const refresh = useRefreshAll();
  const q = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });

  const players = (q.data ?? []).filter((p) => p.squad_id === activeSquad?.id);
  const lower = me.squads.filter((s) => activeSquad && s.ranking > activeSquad.ranking).sort((a, b) => a.ranking - b.ranking)[0];

  async function moveDown(p: ClubPlayer) {
    if (p.user_id === userId) {
      Alert.alert('That’s you', 'You can’t move yourself out of your own squad.');
      return;
    }
    const where = lower ? `to ${lower.name}` : 'out of the squad (there’s no lower team)';
    if (!(await confirm(`Move ${fullName(p)}?`, `They’ll be moved ${where}.`, 'Move', false))) return;
    try {
      await movePlayerDown(p.user_id);
      await refresh();
    } catch (e) {
      Alert.alert('Couldn’t move player', errorMessage(e));
    }
  }

  return (
    <Screen onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: activeSquad?.name ?? 'Squad',
          headerRight: () => <IconButton icon="person-add-outline" label="Add players" onPress={() => router.push('/add-players')} />,
        }}
      />
      <SquadSwitcher />

      {q.isPending ? (
        <Skeleton count={5} height={86} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : players.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No players yet"
          message="Share your club code so players can join, then add them to this squad."
          action={{ title: 'Add players', onPress: () => router.push('/add-players') }}
        />
      ) : (
        <>
          <SectionHeader title={`${players.length} player${players.length === 1 ? '' : 's'} · hold to move down`} />
          <View style={{ gap: space.md }}>
            {[...players]
              .sort((a, b) => (b.form ?? -1) - (a.form ?? -1))
              .map((p) => (
                <PlayerCard
                  key={p.user_id}
                  p={p}
                  onPress={() => router.push({ pathname: '/player/[id]', params: { id: p.user_id } })}
                  onLongPress={() => moveDown(p)}
                />
              ))}
          </View>
          <Button title="Add players from other teams" icon="person-add-outline" variant="secondary" onPress={() => router.push('/add-players')} />
        </>
      )}
    </Screen>
  );
}
