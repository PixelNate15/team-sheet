import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, ListRow, SectionHeader, Skeleton } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fetchOutstandingFees, setSquadDefaultFee } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { formatPence, mediumDate, parsePounds } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { space, useTheme } from '@/theme';

/** Match fees for the captain's team: who owes what, the usual fee, and recent fixtures to tick off. */
export default function FeesScreen() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { activeSquad, isAdmin, refreshMe } = useSignedIn();
  const squadId = activeSquad?.id ?? 0;
  const [fee, setFee] = useState(activeSquad?.default_match_fee_pence ? formatPence(activeSquad.default_match_fee_pence).slice(1) : '');
  const [feeError, setFeeError] = useState<string | null>(null);

  const owed = useQuery({ queryKey: ['outstandingFees', squadId], queryFn: () => fetchOutstandingFees(squadId), enabled: !!squadId });
  const fixtures = useQuery({
    queryKey: ['feeFixtures', squadId],
    enabled: !!squadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fixtures')
        .select('id, opponent_name, is_home, fixture_date, match_fee_pence')
        .eq('squad_id', squadId)
        .not('match_fee_pence', 'is', null)
        .order('fixture_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const saveDefault = useMutation({
    mutationFn: () => setSquadDefaultFee(squadId, parsePounds(fee)),
    onSuccess: async () => {
      await refreshMe();
      Alert.alert('Saved', 'New fixtures for this team will start with this fee.');
    },
    onError: (e) => Alert.alert('Couldn’t save', errorMessage(e)),
  });

  if (!activeSquad) {
    return (
      <Screen>
        <EmptyState icon="cash-outline" title="No team" message="You need to captain a team to track its match fees." />
      </Screen>
    );
  }

  const total = (owed.data ?? []).reduce((n, r) => n + r.amount_pence, 0);

  return (
    <Screen onRefresh={() => qc.invalidateQueries({ queryKey: ['outstandingFees'] })}>
      <Text variant="body" color="textMuted">
        {activeSquad.name}. Players in the team for a fixture with a fee owe it once the fixture has been played.
      </Text>

      <SectionHeader title={`Outstanding · ${formatPence(total)}`} />
      {owed.isPending ? (
        <Skeleton count={2} height={56} />
      ) : owed.error ? (
        <ErrorState error={owed.error} onRetry={() => owed.refetch()} />
      ) : (owed.data ?? []).length === 0 ? (
        <Card>
          <Text variant="body" color="textMuted">
            Nobody owes anything. 🎉
          </Text>
        </Card>
      ) : (
        <Card padded={false}>
          {(owed.data ?? []).map((r, i) => (
            <View key={r.user_id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
              <Pressable style={styles.row} onPress={() => router.push({ pathname: '/player/[id]', params: { id: r.user_id } })}>
                <ListRow
                  icon="person-outline"
                  title={r.name}
                  subtitle={`${r.fixtures_owed} fixture${r.fixtures_owed === 1 ? '' : 's'} unpaid`}
                  right={<Text variant="bodyBold" color="warning">{formatPence(r.amount_pence)}</Text>}
                />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="Fixtures with a fee" />
      {(fixtures.data ?? []).length === 0 ? (
        <Text variant="small" color="textMuted">
          {fixtures.isPending ? 'Loading…' : 'Set a match fee when you add or edit a fixture.'}
        </Text>
      ) : (
        <Card padded={false}>
          {(fixtures.data ?? []).map((f, i) => (
            <View key={f.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
              <Pressable style={styles.row} onPress={() => router.push({ pathname: '/fixture/[id]', params: { id: String(f.id) } })}>
                <ListRow
                  icon="tennisball-outline"
                  title={`${f.is_home ? 'vs' : '@'} ${f.opponent_name}`}
                  subtitle={`${mediumDate(f.fixture_date)} · ${formatPence(f.match_fee_pence)} each · tap to record payments`}
                />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="Usual match fee" />
      {isAdmin ? (
        <Card>
          <View style={{ gap: space.md }}>
            <TextField
              label="Fee per player in £"
              value={fee}
              onChangeText={setFee}
              keyboardType="decimal-pad"
              placeholder="e.g. 5"
              error={feeError}
              hint="New fixtures for this team start with this fee. Leave blank for none."
            />
            <Button
              title="Save usual fee"
              variant="secondary"
              loading={saveDefault.isPending}
              onPress={() => {
                const p = parsePounds(fee);
                if (p !== null && (!Number.isFinite(p) || p > 100000)) {
                  setFeeError('An amount like 5 or 5.50 (up to £1,000), or leave blank');
                  return;
                }
                setFeeError(null);
                saveDefault.mutate();
              }}
            />
          </View>
        </Card>
      ) : (
        <Text variant="small" color="textMuted">
          {activeSquad.default_match_fee_pence
            ? `New fixtures start at ${formatPence(activeSquad.default_match_fee_pence)}. Your club admin can change this.`
            : 'Your club admin can set a usual fee for this team.'}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
