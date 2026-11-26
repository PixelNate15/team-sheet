import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { ListRow, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Hero } from '@/components/Hero';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fetchDivisions, regenerateJoinCode } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/hooks';
import { font, space, useTheme } from '@/theme';

export default function Club() {
  const { c } = useTheme();
  const { club, isAdmin, me, refreshMe } = useSignedIn();
  const divisions = useQuery({ queryKey: ['divisions', club.id], queryFn: () => fetchDivisions(club.id) });

  async function copy() {
    await Clipboard.setStringAsync(club.join_code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }

  function share() {
    Share.share({
      message: `Join ${club.name} on ${APP_NAME}! Download the app, create an account and enter club code ${club.join_code}.`,
    });
  }

  async function regenerate() {
    if (!(await confirm('Change the club code?', 'The old code will stop working. Existing members aren’t affected.', 'Change code', false))) return;
    try {
      await regenerateJoinCode();
      await refreshMe();
    } catch (e) {
      Alert.alert('Couldn’t change code', errorMessage(e));
    }
  }

  return (
    <Screen>
      <Hero>
        <Text variant="caption" style={{ color: c.onHeroMuted }}>
          {club.name.toUpperCase()} · CLUB CODE
        </Text>
        <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Club code ${club.join_code}. Tap to copy.`}>
          <Text style={[styles.code, { color: c.onHero }]}>{club.join_code}</Text>
        </Pressable>
        <Text variant="small" style={{ color: c.onHeroMuted }}>
          Players enter this code after creating an account. Tap the code to copy it.
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button title="Share invite" icon="share-outline" size="sm" variant="secondary" style={{ flex: 1 }} onPress={share} />
          {isAdmin ? <Button title="New code" icon="refresh" size="sm" variant="secondary" style={{ flex: 1 }} onPress={regenerate} /> : null}
        </View>
      </Hero>

      <SectionHeader title="League tables" />
      {(divisions.data ?? []).length === 0 ? (
        <Text variant="small" color="textMuted">
          {divisions.isPending ? 'Loading divisions…' : 'No divisions yet. A club admin can add them under Seasons & divisions.'}
        </Text>
      ) : (
        <Card padded={false}>
          {(divisions.data ?? []).map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
              <Pressable
                style={styles.row}
                onPress={() => router.push({ pathname: '/league/[divisionId]', params: { divisionId: String(d.id) } })}>
                <ListRow icon="podium-outline" title={d.name} subtitle="This season’s table and positions" />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="Team admin" />
      <Card padded={false}>
        <Pressable style={styles.row} onPress={() => router.push('/club/fees')}>
          <ListRow icon="cash-outline" title="Match fees" subtitle="Who owes what, and the usual fee" />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={() => router.push('/club/report')}>
          <ListRow icon="document-text-outline" title="Season report" subtitle="Results, awards and player stats as a PDF" />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={() => router.push('/club/balance')}>
          <ListRow icon="scale-outline" title="Selection balance" subtitle="Who’s been picked versus available" />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={() => router.push('/club/venues')}>
          <ListRow icon="location-outline" title="Venues" subtitle="Opponents’ addresses, parking and courts" />
        </Pressable>
      </Card>

      {isAdmin ? (
        <>
          <SectionHeader title="Club admin" />
          <Card padded={false}>
            <Pressable style={styles.row} onPress={() => router.push('/club/members')}>
              <ListRow icon="people-outline" title="Members" subtitle="Roles, teams and removing members" />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <Pressable style={styles.row} onPress={() => router.push('/club/invites')}>
              <ListRow icon="cloud-upload-outline" title="Import players" subtitle="Invite a list of players from a CSV file" />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <Pressable style={styles.row} onPress={() => router.push('/club/squads')}>
              <ListRow icon="shirt-outline" title="Teams" subtitle={`${me.squads.length} team${me.squads.length === 1 ? '' : 's'} · captains and divisions`} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: c.border }]} />
            <Pressable style={styles.row} onPress={() => router.push('/club/seasons')}>
              <ListRow icon="calendar-number-outline" title="Seasons & divisions" subtitle="Start a new season, add divisions" />
            </Pressable>
          </Card>
        </>
      ) : (
        <Text variant="small" color="textMuted">
          Club settings are managed by your club admin.
        </Text>
      )}

      <Button title="Back to player view" icon="person-outline" variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: font.display, fontSize: 46, lineHeight: 54, letterSpacing: 6, marginVertical: space.sm },
  row: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
