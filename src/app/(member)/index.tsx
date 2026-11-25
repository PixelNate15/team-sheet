import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, EmptyState, IconBubble, ListRow, SectionHeader, Skeleton } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DateBlock } from '@/components/FixtureCard';
import { Hero } from '@/components/Hero';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useSignedIn } from '@/lib/auth';
import { fullDate, longDate, relativeDay, shortTime } from '@/lib/format';
import { feedbackToGive } from '@/lib/feedback';
import { useGroupedResults, useMyFixtures, useMyInjury, useRefreshAll, useSetAvailability } from '@/lib/hooks';
import type { MyFixture } from '@/lib/types';
import { radius, space, useTheme } from '@/theme';

export default function Home() {
  const { c } = useTheme();
  const { me, club, canCaptain } = useSignedIn();
  const fixtures = useMyFixtures();
  const results = useGroupedResults();
  const injury = useMyInjury();
  const refresh = useRefreshAll();

  const next = fixtures.data?.[0];
  const needReply = fixtures.data?.filter((f) => f.is_available == null) ?? [];
  const needFeedback = feedbackToGive(results.data);
  const lastResult = results.groups[0];

  return (
    <Screen onRefresh={refresh} padTop>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="small" color="textMuted">
            {club.name}
          </Text>
          <Text variant="title">Hi {me.profile.first_name} 👋</Text>
        </View>
        {canCaptain ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to captain view"
            onPress={() => router.replace('/squad')}
            style={[styles.switch, { backgroundColor: c.accentSoft }]}>
            <Ionicons name="swap-horizontal" size={16} color={c.accent} />
            <Text variant="smallBold" color="accent">
              Captain
            </Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.push('/me')} accessibilityLabel="Your profile">
          <Avatar first={me.profile.first_name} surname={me.profile.surname} size={44} />
        </Pressable>
      </View>

      {injury.data ? (
        <Card tone="soft" onPress={() => router.push('/injury')} style={{ backgroundColor: c.warningSoft }}>
          <ListRow
            icon="bandage-outline"
            tone="warning"
            title={injury.data.can_play ? 'Injured – still able to play' : 'Injured – unavailable'}
            subtitle={`${injury.data.description} · back ${fullDate(injury.data.expected_end_date)}`}
          />
        </Card>
      ) : null}

      {!me.mySquadId ? (
        <EmptyState
          icon="people-outline"
          title="You’re not in a team yet"
          message="Your club admin or captain will add you to a squad. You’ll see fixtures here as soon as they do."
        />
      ) : fixtures.isPending ? (
        <Skeleton count={1} height={220} />
      ) : next ? (
        <NextFixture fixture={next} />
      ) : (
        <EmptyState icon="calendar-outline" title="No fixtures coming up" message="Your captain hasn’t added any fixtures yet." />
      )}

      {needReply.length > 0 || needFeedback.length > 0 ? (
        <>
          <SectionHeader title="To do" />
          <Card padded={false}>
            {needReply.length > 0 ? (
              <Pressable onPress={() => router.push('/fixtures')} style={styles.todo}>
                <ListRow
                  icon="hand-left-outline"
                  tone="warning"
                  title={`${needReply.length} fixture${needReply.length === 1 ? '' : 's'} need${needReply.length === 1 ? 's' : ''} your availability`}
                  subtitle="Let your captain know if you can play"
                />
              </Pressable>
            ) : null}
            {needReply.length > 0 && needFeedback.length > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
            {needFeedback.length > 0 ? (
              <Pressable onPress={() => router.push('/feedback')} style={styles.todo}>
                <ListRow
                  icon="star-outline"
                  tone="accent"
                  title={`Rate ${needFeedback.length === 1 ? 'your partner' : `${needFeedback.length} partners`}`}
                  subtitle="Quick, private feedback after each fixture"
                />
              </Pressable>
            ) : null}
          </Card>
        </>
      ) : null}

      {lastResult ? (
        <>
          <SectionHeader title="Last result" />
          <Card
            onPress={() => router.push({ pathname: '/result/[fixtureId]', params: { fixtureId: String(lastResult.fixtureId) } })}
            accent={resultTone(lastResult.teamSetsWon, lastResult.teamSetsLost)}>
            <View style={styles.resultRow}>
              <DateBlock iso={lastResult.date} tone={dateTone(lastResult.teamSetsWon, lastResult.teamSetsLost)} />
              <View style={{ flex: 1 }}>
                <Text variant="heading">
                  {lastResult.isHome ? 'vs' : '@'} {lastResult.opponent}
                </Text>
                <Text variant="small" color="textMuted">
                  {lastResult.rubbers.filter((r) => r.did_win).length} of {lastResult.rubbers.length} of your rubbers won
                </Text>
              </View>
              <Text variant="stat" color={resultTone(lastResult.teamSetsWon, lastResult.teamSetsLost)}>
                {lastResult.teamSetsWon}–{lastResult.teamSetsLost}
              </Text>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function NextFixture({ fixture: f }: { fixture: MyFixture }) {
  const { c } = useTheme();
  const setAvail = useSetAvailability();
  const goToDetail = () => router.push({ pathname: '/fixture/[id]', params: { id: String(f.id) } });

  return (
    <Pressable onPress={goToDetail} accessibilityRole="button" accessibilityLabel={`Next fixture against ${f.opponent_name}`}>
      <Hero>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption" style={{ color: c.onHeroMuted }}>
            NEXT FIXTURE · {relativeDay(f.fixture_date).toUpperCase()}
          </Text>
          <View style={[styles.heroPill, { backgroundColor: c.heroChip }]}>
            <Text variant="caption" style={{ color: c.onHero }}>
              {f.is_home ? 'HOME' : 'AWAY'}
            </Text>
          </View>
        </View>
        <Text variant="hero" style={{ color: c.onHero, marginTop: space.sm }} numberOfLines={2}>
          {f.opponent_name}
        </Text>
        <View style={{ gap: 4, marginTop: space.sm }}>
          <HeroMeta icon="calendar-outline" text={`${longDate(f.fixture_date)} · ${shortTime(f.start_time)}`} />
          <HeroMeta icon="location-outline" text={f.location} />
        </View>

        <View style={[styles.heroStatus, { backgroundColor: c.surface }]}>
          {f.is_selected ? (
            <>
              <IconBubble icon="checkmark-circle" tone="success" size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" style={{ color: c.onHero }}>
                  You’re selected – Pair {f.pair_number}
                </Text>
                <Text variant="small" style={{ color: c.onHeroMuted }}>
                  {f.partner_name ? `Partnering ${f.partner_name}` : 'Partner to be confirmed'}
                </Text>
              </View>
            </>
          ) : f.is_available == null ? (
            <View style={{ flex: 1, gap: space.sm }}>
              <Text variant="bodyBold" style={{ color: c.onHero }}>
                Can you play?
              </Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  title="I’m in"
                  icon="checkmark"
                  variant="success"
                  size="sm"
                  style={{ flex: 1 }}
                  loading={setAvail.isPending && setAvail.variables?.available === true}
                  onPress={() => setAvail.mutate({ fixtureId: f.id, available: true })}
                />
                <Button
                  title="Can’t make it"
                  icon="close"
                  variant="secondary"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/availability/[fixtureId]', params: { fixtureId: String(f.id) } })}
                />
              </View>
            </View>
          ) : (
            <>
              <IconBubble icon={f.is_available ? 'thumbs-up' : 'thumbs-down'} tone={f.is_available ? 'success' : 'danger'} size={34} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyBold" style={{ color: c.onHero }}>
                  {f.is_available ? 'You said you’re available' : 'You said you can’t play'}
                </Text>
                <Text variant="small" style={{ color: c.onHeroMuted }}>
                  {f.team_selected ? 'Team has been picked' : 'Waiting for the captain to pick the team'}
                </Text>
              </View>
            </>
          )}
        </View>
      </Hero>
    </Pressable>
  );
}

function HeroMeta({ icon, text }: { icon: 'calendar-outline' | 'location-outline'; text: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name={icon} size={15} color={c.onHeroMuted} />
      <Text variant="small" style={{ color: c.onHero }} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function resultTone(won: number, lost: number): 'success' | 'danger' | 'textMuted' {
  return won > lost ? 'success' : won < lost ? 'danger' : 'textMuted';
}
function dateTone(won: number, lost: number): 'success' | 'danger' | 'neutral' {
  return won > lost ? 'success' : won < lost ? 'danger' : 'neutral';
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switch: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  heroPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, padding: space.md, borderRadius: radius.md },
  todo: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
