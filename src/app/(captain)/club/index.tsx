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
import { regenerateJoinCode } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { APP_NAME } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/hooks';
import { space, useTheme } from '@/theme';

export default function Club() {
  const { c } = useTheme();
  const { club, isAdmin, me, refreshMe } = useSignedIn();

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
        <Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
          {club.name.toUpperCase()} · CLUB CODE
        </Text>
        <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Club code ${club.join_code}. Tap to copy.`}>
          <Text style={styles.code}>{club.join_code}</Text>
        </Pressable>
        <Text variant="small" style={{ color: 'rgba(255,255,255,0.85)' }}>
          Players enter this code after creating an account. Tap the code to copy it.
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
          <Button title="Share invite" icon="share-outline" size="sm" variant="secondary" style={{ flex: 1 }} onPress={share} />
          {isAdmin ? <Button title="New code" icon="refresh" size="sm" variant="secondary" style={{ flex: 1 }} onPress={regenerate} /> : null}
        </View>
      </Hero>

      {isAdmin ? (
        <>
          <SectionHeader title="Club admin" />
          <Card padded={false}>
            <Pressable style={styles.row} onPress={() => router.push('/club/members')}>
              <ListRow icon="people-outline" title="Members" subtitle="Roles, teams and removing members" />
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
  code: { color: '#fff', fontSize: 44, lineHeight: 52, fontWeight: '900', letterSpacing: 8, marginVertical: space.sm },
  row: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
