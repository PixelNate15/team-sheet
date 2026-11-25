import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';

import { Avatar, Chip, EmptyState, ErrorState, Skeleton } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { borrowPlayer, fetchBorrowablePlayers, PLAY_UP_LIMIT } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatForm } from '@/lib/format';
import { space } from '@/theme';

/**
 * Borrow a player from a lower team for one fixture, when the team is short.
 * Each player can play up at most twice a season; the database enforces it.
 */
export default function BorrowPlayer() {
  const { fixtureId } = useLocalSearchParams<{ fixtureId: string }>();
  const id = Number(fixtureId);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['borrowable', id], queryFn: () => fetchBorrowablePlayers(id) });

  const borrow = useMutation({
    mutationFn: (userId: string) => borrowPlayer(id, userId),
    onSuccess: async () => {
      await qc.invalidateQueries();
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t borrow this player', errorMessage(e)),
  });

  const rows = list.data ?? [];
  const groups = [...new Set(rows.map((r) => r.squad_name))];

  return (
    <Screen>
      <Text variant="body" color="textMuted">
        Short of players? Borrow someone from a lower team for this fixture only. Check they can play first: they’ll be
        marked available and told. Each player can play up {PLAY_UP_LIMIT} times a season.
      </Text>

      {list.isPending ? (
        <Skeleton count={4} height={64} />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="people-outline" title="Nobody to borrow" message="There are no players in lower teams." />
      ) : (
        groups.map((g) => (
          <View key={g} style={{ gap: space.sm }}>
            <Text variant="caption" color="textMuted">
              {g.toUpperCase()}
            </Text>
            <Card>
              <View style={{ gap: space.md }}>
                {rows
                  .filter((r) => r.squad_name === g)
                  .map((r) => {
                    const blocked = r.limit_reached || r.injured;
                    return (
                      <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                        <Avatar userId={r.user_id} first={r.first_name} surname={r.surname} size={40} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="bodyBold">
                            {r.first_name} {r.surname}
                          </Text>
                          <Text variant="small" color="textMuted">
                            Form {formatForm(r.form)} · played up {r.times_played_up} of {PLAY_UP_LIMIT}
                          </Text>
                        </View>
                        {r.borrowed ? (
                          <Chip label="Borrowed" tone="success" icon="checkmark" />
                        ) : r.injured ? (
                          <Chip label="Injured" tone="danger" />
                        ) : r.limit_reached ? (
                          <Chip label="Limit reached" tone="neutral" />
                        ) : (
                          <Button
                            title="Borrow"
                            size="sm"
                            variant="secondary"
                            full={false}
                            disabled={blocked || borrow.isPending}
                            loading={borrow.isPending && borrow.variables === r.user_id}
                            onPress={() => borrow.mutate(r.user_id)}
                          />
                        )}
                      </View>
                    );
                  })}
              </View>
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}
