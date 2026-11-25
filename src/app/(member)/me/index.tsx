import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Chip, ListRow, SectionHeader } from '@/components/Bits';
import { Card } from '@/components/Card';
import { Segmented, SwitchRow } from '@/components/Field';
import { StudioMark } from '@/components/Hero';
import { PartnerStatsList } from '@/components/PartnerStats';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { deleteMyAccount, fetchMyFees, fetchPartnerStats, leaveClub, updateProfile } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { PRIVACY_POLICY_URL, SUPPORT_EMAIL } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { formatPence, fullDate } from '@/lib/format';
import { confirm, useMyInjury } from '@/lib/hooks';
import { registerForPush } from '@/lib/notifications';
import type { ThemePref } from '@/lib/types';
import { space, useTheme } from '@/theme';

export default function Me() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { me, club, membership, userId, canCaptain, isAdmin, signOut, refreshMe } = useSignedIn();
  const injury = useMyInjury();
  const partners = useQuery({ queryKey: ['partnerStats', userId], queryFn: () => fetchPartnerStats(userId) });
  const fees = useQuery({ queryKey: ['myFees'], queryFn: fetchMyFees });
  const unpaid = (fees.data ?? []).filter((f) => !f.paid).reduce((n, f) => n + f.fee_pence, 0);
  const squad = me.squads.find((s) => s.id === me.mySquadId);

  const patch = useMutation({
    mutationFn: (p: Parameters<typeof updateProfile>[1]) => updateProfile(userId, p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
    onError: (e) => Alert.alert('Couldn’t save', errorMessage(e)),
  });

  async function toggleNotifications(on: boolean) {
    if (on) {
      const ok = await registerForPush(userId);
      if (!ok) {
        Alert.alert('Notifications are off', 'Allow notifications for this app in your phone’s Settings, then try again.');
        return;
      }
      refreshMe();
    } else {
      patch.mutate({ notifications_enabled: false, expo_push_token: null });
    }
  }

  async function onLeave() {
    if (!(await confirm('Leave club?', `You’ll leave ${club.name} and lose access to its fixtures and results.`, 'Leave'))) return;
    try {
      await leaveClub();
      await refreshMe();
    } catch (e) {
      Alert.alert('Couldn’t leave', errorMessage(e));
    }
  }

  async function onDelete() {
    if (
      !(await confirm(
        'Delete your account?',
        'This permanently deletes your profile, availability, injury history, match records and feedback. This can’t be undone.',
        'Delete account',
      ))
    )
      return;
    try {
      await deleteMyAccount(me.profile.avatar_path);
      await signOut();
    } catch (e) {
      Alert.alert('Couldn’t delete account', errorMessage(e));
    }
  }

  return (
    <Screen>
      <Card onPress={() => router.push('/profile')}>
        <View style={styles.profile}>
          <Avatar userId={me.profile.id} first={me.profile.first_name} surname={me.profile.surname} size={60} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading">
              {me.profile.first_name} {me.profile.surname}
            </Text>
            <Text variant="small" color="textMuted">
              {club.name}
              {squad ? ` · ${squad.name}` : ''}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              {isAdmin ? <Chip label="Admin" tone="accent" /> : null}
              {me.squads.some((s) => s.captain_id === userId) ? <Chip label="Captain" tone="success" /> : null}
            </View>
          </View>
          <Text variant="smallBold" color="accent">
            Edit
          </Text>
        </View>
      </Card>

      {canCaptain ? (
        <Card onPress={() => router.replace('/squad')} style={{ backgroundColor: c.accentSoft }}>
          <ListRow icon="swap-horizontal" title="Switch to captain view" subtitle="Squad, fixtures, team selection and results" />
        </Card>
      ) : null}

      <SectionHeader title="Fitness" />
      <Card onPress={() => router.push('/injury')}>
        <ListRow
          icon={injury.data ? 'bandage' : 'fitness-outline'}
          tone={injury.data ? 'warning' : 'success'}
          title={injury.data ? injury.data.description : 'Fit to play'}
          subtitle={
            injury.data
              ? `${injury.data.can_play ? 'Can still play' : 'Unavailable'} · back ${fullDate(injury.data.expected_end_date)}`
              : 'Tap to report an injury'
          }
        />
      </Card>

      {(fees.data ?? []).length > 0 ? (
        <>
          <SectionHeader title={`Match fees${unpaid ? ` · ${formatPence(unpaid)} to pay` : ''}`} />
          <Card>
            <View style={{ gap: space.md }}>
              {(fees.data ?? []).slice(0, 8).map((f) => (
                <Pressable
                  key={f.fixture_id}
                  onPress={() => router.push({ pathname: '/fixture/[id]', params: { id: String(f.fixture_id) } })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold" numberOfLines={1}>
                      {f.is_home ? 'vs' : '@'} {f.opponent_name}
                    </Text>
                    <Text variant="small" color="textMuted">
                      {fullDate(f.fixture_date)} · {formatPence(f.fee_pence)}
                    </Text>
                  </View>
                  <Chip label={f.paid ? 'Paid' : 'Not paid'} tone={f.paid ? 'success' : 'warning'} />
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      ) : null}

      <SectionHeader title="My partnerships" />
      {partners.data ? <PartnerStatsList stats={partners.data} /> : null}

      <SectionHeader title="Appearance" />
      <Segmented<ThemePref>
        value={me.profile.theme}
        onChange={(theme) => patch.mutate({ theme })}
        options={[
          { value: 'system', label: 'Automatic' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />

      <SectionHeader title="Notifications" />
      <SwitchRow
        label="Push notifications"
        description="Selection, fixture changes, reminders and results"
        value={me.profile.notifications_enabled && !!me.profile.expo_push_token}
        onValueChange={toggleNotifications}
      />

      <SectionHeader title="About" />
      <Card padded={false}>
        <Pressable style={styles.row} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}>
          <ListRow icon="shield-checkmark-outline" title="Privacy policy" tone="neutral" />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <View style={styles.row}>
          <ListRow icon="help-buoy-outline" title="Support" subtitle={SUPPORT_EMAIL} tone="neutral" chevron={false} />
        </View>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={signOut}>
          <ListRow icon="log-out-outline" title="Sign out" tone="neutral" chevron={false} />
        </Pressable>
      </Card>

      <SectionHeader title="Danger zone" />
      <Card padded={false}>
        <Pressable style={styles.row} onPress={onLeave}>
          <ListRow icon="exit-outline" title={`Leave ${club.name}`} tone="danger" chevron={false} />
        </Pressable>
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <Pressable style={styles.row} onPress={onDelete}>
          <ListRow icon="trash-outline" title="Delete my account" tone="danger" chevron={false} />
        </Pressable>
      </Card>

      <View style={styles.studio} accessible accessibilityLabel="Team Sheet by PixelNate159 Software">
        <StudioMark size={30} />
        <Text variant="smallBold" color="textMuted">
          Made by PixelNate159 Software
        </Text>
      </View>
      <Text variant="small" color="textFaint" align="center">
        Team Sheet · Version {Constants.expoConfig?.version ?? '1.0.0'} · {membership.role === 'admin' ? 'Club admin' : 'Member'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  row: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  studio: { alignItems: 'center', gap: space.xs, marginTop: space.lg },
});
