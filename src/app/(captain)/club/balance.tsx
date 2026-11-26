import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Chip, EmptyState, ErrorState, Skeleton } from '@/components/Bits';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fetchSelectionBalance } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { space, useTheme } from '@/theme';

/**
 * How fairly the team has been picked this season: for each player, the
 * fixtures they were available for against the times they were picked.
 */
export default function SelectionBalance() {
  const { c } = useTheme();
  const { activeSquad } = useSignedIn();
  const squadId = activeSquad?.id ?? 0;
  const q = useQuery({ queryKey: ['selectionBalance', squadId], queryFn: () => fetchSelectionBalance(squadId), enabled: !!squadId });

  if (!activeSquad) {
    return (
      <Screen>
        <EmptyState icon="people-outline" title="No team" message="You need to captain a team to see its selection balance." />
      </Screen>
    );
  }

  // Players who've been available most often without being picked come first.
  const rows = [...(q.data ?? [])].sort((a, b) => b.said_yes - b.picked - (a.said_yes - a.picked) || a.picked - b.picked);
  const fixtures = q.data?.[0]?.fixtures ?? 0;

  return (
    <Screen onRefresh={() => q.refetch()}>
      <Text variant="body" color="textMuted">
        {activeSquad.name} this season: {fixtures} fixture{fixtures === 1 ? '' : 's'} played so far. Players available
        often but picked less are at the top, so you can rotate fairly.
      </Text>
      {q.isPending ? (
        <Skeleton count={5} height={64} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="people-outline" title="No players yet" message="Add players to the team first." />
      ) : (
        <Card padded={false}>
          {rows.map((r, i) => {
            const [first, ...rest] = r.name.split(' ');
            const gap = r.said_yes - r.picked;
            return (
              <View key={r.user_id}>
                {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
                <Pressable style={styles.row} onPress={() => router.push({ pathname: '/player/[id]', params: { id: r.user_id } })}>
                  <Avatar userId={r.user_id} first={first} surname={rest.join(' ')} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyBold">{r.name}</Text>
                    <Text variant="small" color="textMuted">
                      Picked {r.picked} of {r.said_yes} available · {r.rubbers} rubber{r.rubbers === 1 ? '' : 's'}
                      {r.played_up ? ` · played up ${r.played_up}` : ''}
                    </Text>
                  </View>
                  {gap >= 2 ? <Chip label="Due a game" tone="warning" /> : null}
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
      <Text variant="small" color="textMuted">
        “Available” counts fixtures already played where the player said yes.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
});
