import { router } from 'expo-router';
import { View } from 'react-native';

import { Chip, EmptyState, ErrorState, Skeleton } from '@/components/Bits';
import { Card } from '@/components/Card';
import { DateBlock } from '@/components/FixtureCard';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fullDate } from '@/lib/format';
import { useGroupedResults, useRefreshAll } from '@/lib/hooks';
import { scoreLine } from '@/lib/scoring';
import { space, useTheme } from '@/theme';

/** Last 6 months of results (port of member_show_recent_results_screen). */
export default function Results() {
  const { c } = useTheme();
  const q = useGroupedResults();
  const refresh = useRefreshAll();

  const played = q.data?.length ?? 0;
  const won = q.data?.filter((r) => r.did_win).length ?? 0;

  return (
    <Screen onRefresh={refresh}>
      {played > 0 ? (
        <Card tone="soft">
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <Summary label="Rubbers" value={String(played)} />
            <Summary label="Won" value={String(won)} tone="success" />
            <Summary label="Win rate" value={`${Math.round((won / played) * 100)}%`} tone="accent" />
          </View>
          <Text variant="small" color="textFaint" align="center" style={{ marginTop: space.sm }}>
            Last 6 months
          </Text>
        </Card>
      ) : null}

      {q.isPending ? (
        <Skeleton count={3} height={150} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.groups.length === 0 ? (
        <EmptyState icon="trophy-outline" title="No results yet" message="Results from the last 6 months will appear here once your captain enters them." />
      ) : (
        q.groups.map((g) => {
          const tone = g.teamSetsWon > g.teamSetsLost ? 'success' : g.teamSetsWon < g.teamSetsLost ? 'danger' : 'neutral';
          return (
            <Card
              key={g.fixtureId}
              accent={tone === 'neutral' ? 'textFaint' : tone}
              onPress={() => router.push({ pathname: '/result/[fixtureId]', params: { fixtureId: String(g.fixtureId) } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <DateBlock iso={g.date} tone={tone} />
                <View style={{ flex: 1 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {g.isHome ? 'vs' : '@'} {g.opponent}
                  </Text>
                  <Text variant="small" color="textMuted">
                    {fullDate(g.date)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="stat" color={tone === 'neutral' ? 'textMuted' : tone}>
                    {g.teamSetsWon}–{g.teamSetsLost}
                  </Text>
                  <Text variant="caption" color="textFaint">
                    TEAM SETS
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md }}>
                {g.rubbers.map((r) => (
                  <View key={r.match_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Chip label={r.did_win ? 'W' : 'L'} tone={r.did_win ? 'success' : 'danger'} />
                    <Text variant="small" style={{ flex: 1 }} numberOfLines={1}>
                      with {r.partner_name}
                    </Text>
                    <Text variant="smallBold" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
                      {scoreLine(r)}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'accent' }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="stat" color={tone ?? 'text'}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}
