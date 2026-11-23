import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { EmptyState, ErrorState, Skeleton } from '@/components/Bits';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { PlayerCard } from '@/components/PlayerCard';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { addPlayersToSquad, fetchClubPlayers } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

/**
 * Port of captain_show_all_players_available_for_squad.py: players from
 * lower teams (or not in a team), with partial, case-insensitive search.
 */
export default function AddPlayers() {
  const { activeSquad, isAdmin } = useSignedIn();
  const refresh = useRefreshAll();
  const q = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((p) => p.squad_id !== activeSquad?.id)
      .filter((p) => isAdmin || p.squad_ranking == null || (activeSquad && p.squad_ranking > activeSquad.ranking))
      .filter((p) => !term || `${p.first_name} ${p.surname}`.toLowerCase().includes(term));
  }, [q.data, search, activeSquad, isAdmin]);

  const add = useMutation({
    mutationFn: () => addPlayersToSquad(activeSquad!.id, [...picked]),
    onSuccess: async (n) => {
      await refresh();
      Alert.alert('Squad updated', `${n} player${n === 1 ? '' : 's'} added to ${activeSquad?.name}.`);
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t add players', errorMessage(e)),
  });

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <Screen
      footer={
        <Button
          title={picked.size ? `Add ${picked.size} to ${activeSquad?.name}` : 'Select players to add'}
          disabled={picked.size === 0}
          loading={add.isPending}
          onPress={() => add.mutate()}
        />
      }>
      <TextField label="Search" value={search} onChangeText={setSearch} placeholder="Name" autoCorrect={false} clearButtonMode="while-editing" />
      <Text variant="small" color="textMuted">
        Showing players from lower teams and players not yet in a team.
      </Text>
      {q.isPending ? (
        <Skeleton count={4} height={86} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : candidates.length === 0 ? (
        <EmptyState icon="search-outline" title={search ? 'No matches' : 'No players available'} message={search ? `Nobody matches “${search}”.` : 'Everyone in the club is already in this team or a higher one.'} />
      ) : (
        <View style={{ gap: space.md }}>
          {candidates.map((p) => (
            <PlayerCard key={p.user_id} p={p} showSquad selected={picked.has(p.user_id)} onPress={() => toggle(p.user_id)} />
          ))}
        </View>
      )}
    </Screen>
  );
}
