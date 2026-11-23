import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Chip, EmptyState, ErrorState, SectionHeader, Skeleton, Stat } from '@/components/Bits';
import { Card } from '@/components/Card';
import { DateBlock, FixtureCard } from '@/components/FixtureCard';
import { Screen } from '@/components/Screen';
import { SquadSwitcher } from '@/components/SquadSwitcher';
import { Text } from '@/components/Text';
import { fetchFixturesNeedingResults, fetchSquadResults } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { fullDate } from '@/lib/format';
import { useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

/** Results needing entry + this season's results (right column of captain_manage_fixtures.py). */
export default function Scores() {
  const { activeSquad } = useSignedIn();
  const refresh = useRefreshAll();
  const squadId = activeSquad?.id;
  const needs = useQuery({ queryKey: ['needsResults', squadId], queryFn: () => fetchFixturesNeedingResults(squadId!), enabled: !!squadId });
  const results = useQuery({ queryKey: ['squadResults', squadId], queryFn: () => fetchSquadResults(squadId!), enabled: !!squadId });

  const list = results.data ?? [];
  const won = list.filter((r) => r.sets_won > r.sets_lost).length;
  const lost = list.filter((r) => r.sets_won < r.sets_lost).length;
  const drawn = list.length - won - lost;
  const setsFor = list.reduce((n, r) => n + r.sets_won, 0);
  const setsAgainst = list.reduce((n, r) => n + r.sets_lost, 0);

  return (
    <Screen onRefresh={refresh}>
      <SquadSwitcher />

      {(needs.data ?? []).length > 0 ? (
        <>
          <SectionHeader title="Needs a result" />
          {(needs.data ?? []).map((f) => (
            <FixtureCard
              key={f.id}
              opponent={f.opponent_name}
              isHome={f.is_home}
              date={f.fixture_date}
              dateTone="neutral"
              accent="warning"
              chips={<Chip label="Enter scores" tone="warning" icon="create-outline" />}
              onPress={() => router.push({ pathname: '/result-entry/[fixtureId]', params: { fixtureId: String(f.id) } })}
            />
          ))}
        </>
      ) : null}

      <SectionHeader title="This season" />
      {results.isPending ? (
        <Skeleton count={3} height={80} />
      ) : results.error ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon="trophy-outline" title="No results yet" message="Once fixtures are played, enter the scores here." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Played" value={String(list.length)} />
            <Stat label="Won" value={String(won)} tone="success" />
            <Stat label="Lost" value={String(lost)} tone="danger" />
            {drawn ? <Stat label="Drawn" value={String(drawn)} /> : null}
          </View>
          <Text variant="small" color="textMuted" align="center">
            Sets {setsFor}–{setsAgainst} this season
          </Text>
          {list.map((r) => {
            const tone = r.sets_won > r.sets_lost ? 'success' : r.sets_won < r.sets_lost ? 'danger' : 'neutral';
            return (
              <Card
                key={r.id}
                accent={tone === 'neutral' ? 'textFaint' : tone}
                onPress={() => router.push({ pathname: '/result/[fixtureId]', params: { fixtureId: String(r.id) } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <DateBlock iso={r.fixture_date} tone={tone} />
                  <View style={{ flex: 1 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {r.is_home ? 'vs' : '@'} {r.opponent_name}
                    </Text>
                    <Text variant="small" color="textMuted">
                      {fullDate(r.fixture_date)} · rubbers {r.rubbers_won}–{r.rubbers_lost}
                    </Text>
                  </View>
                  <Text variant="stat" color={tone === 'neutral' ? 'textMuted' : tone}>
                    {r.sets_won}–{r.sets_lost}
                  </Text>
                </View>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
