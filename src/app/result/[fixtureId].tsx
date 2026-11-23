import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Chip, EmptyState, ErrorState, Loading, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FeedbackCard } from '@/components/FeedbackCard';
import { Hero } from '@/components/Hero';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fetchFeedbackForFixture, fetchFixture, fetchFixtureMatches } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { fullName, longDate } from '@/lib/format';
import { useRefreshAll } from '@/lib/hooks';
import { scoreLine } from '@/lib/scoring';
import { space, useTheme } from '@/theme';

/** Full result of a fixture + the feedback you received (port of member_expanded_result_card_screen). */
export default function ResultDetail() {
  const { c } = useTheme();
  const { fixtureId: raw } = useLocalSearchParams<{ fixtureId: string }>();
  const fixtureId = Number(raw);
  const { userId, managedSquads } = useSignedIn();
  const refresh = useRefreshAll();

  const fixture = useQuery({ queryKey: ['fixture', fixtureId], queryFn: () => fetchFixture(fixtureId) });
  const matches = useQuery({ queryKey: ['matches', fixtureId], queryFn: () => fetchFixtureMatches(fixtureId) });
  const feedback = useQuery({ queryKey: ['feedbackFixture', fixtureId], queryFn: () => fetchFeedbackForFixture(userId, fixtureId) });

  if (fixture.isPending || matches.isPending) return <Loading />;
  if (fixture.error || matches.error || !fixture.data) {
    return (
      <Screen>
        <ErrorState error={fixture.error ?? matches.error} onRetry={() => refresh()} />
      </Screen>
    );
  }

  const f = fixture.data;
  const rubbers = matches.data ?? [];
  const setsWon = rubbers.reduce((n, m) => n + m.sets_won, 0);
  const setsLost = rubbers.reduce((n, m) => n + m.sets_lost, 0);
  const canManage = managedSquads.some((s) => s.id === f.squad_id);

  return (
    <Screen onRefresh={refresh}>
      <Stack.Screen options={{ title: f.opponent_name }} />

      <Hero>
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {longDate(f.fixture_date).toUpperCase()} · {f.is_home ? 'HOME' : 'AWAY'}
        </Text>
        <Text variant="title" style={{ color: '#fff', marginTop: 4 }}>
          {f.opponent_name}
        </Text>
        {rubbers.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md, marginTop: space.lg }}>
            <Text style={{ color: '#fff', fontSize: 56, lineHeight: 60, fontWeight: '900' }}>
              {setsWon}–{setsLost}
            </Text>
            <Text variant="bodyBold" style={{ color: 'rgba(255,255,255,0.9)', marginBottom: 10 }}>
              {setsWon > setsLost ? 'Win' : setsWon < setsLost ? 'Loss' : 'Draw'} · sets
            </Text>
          </View>
        ) : null}
      </Hero>

      {rubbers.length === 0 ? (
        <EmptyState
          icon="hourglass-outline"
          title="No result yet"
          message={canManage ? 'Enter the scores for all four rubbers.' : 'Your captain hasn’t entered the result yet.'}
          action={
            canManage
              ? { title: 'Enter result', onPress: () => router.push({ pathname: '/result-entry/[fixtureId]', params: { fixtureId: String(fixtureId) } }) }
              : undefined
          }
        />
      ) : (
        <>
          <SectionHeader title="Rubbers" />
          {rubbers.map((m) => {
            const names = m.match_players.map((p) => fullName(p.profiles)).join(' & ');
            const mine = m.match_players.some((p) => p.user_id === userId);
            return (
              <Card key={m.id} accent={m.did_win ? 'success' : 'danger'} selected={mine}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" color="textMuted">
                      RUBBER {m.rubber_number} · OUR PAIR {m.pair_number} v THEIR PAIR {m.opponent_pair_number}
                    </Text>
                    <Text variant="bodyBold">{names}</Text>
                    <Text variant="body" color="textMuted" style={{ fontVariant: ['tabular-nums'] }}>
                      {scoreLine(m)}
                    </Text>
                  </View>
                  <Chip label={m.did_win ? 'Won' : 'Lost'} tone={m.did_win ? 'success' : 'danger'} />
                </View>
              </Card>
            );
          })}
          {canManage ? (
            <Button
              title="Edit result"
              icon="create-outline"
              variant="secondary"
              onPress={() => router.push({ pathname: '/result-entry/[fixtureId]', params: { fixtureId: String(fixtureId) } })}
            />
          ) : null}
        </>
      )}

      {feedback.data && feedback.data.length > 0 ? (
        <>
          <SectionHeader title="Feedback from your partner" />
          {feedback.data.map((fb) => (
            <FeedbackCard key={fb.id} f={fb} showFixture={false} />
          ))}
        </>
      ) : null}
      <View style={{ height: 1, backgroundColor: c.background }} />
    </Screen>
  );
}
