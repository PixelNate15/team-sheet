import { useQuery } from '@tanstack/react-query';
import { Alert, View } from 'react-native';

import { useActionSheet } from '@/components/ActionSheet';
import { Avatar, Chip, ErrorState, Skeleton } from '@/components/Bits';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { adminSetPlayerSquad, fetchClubPlayers, removeMember, setMemberRole } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { confirm, useRefreshAll } from '@/lib/hooks';
import type { ClubPlayer } from '@/lib/types';
import { space } from '@/theme';

/** Admin: put members in teams, make admins, remove members. */
export default function Members() {
  const { club, me, userId } = useSignedIn();
  const refresh = useRefreshAll();
  const q = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });
  const [sheet, showSheet] = useActionSheet();

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      Alert.alert('Couldn’t update', errorMessage(e));
    }
  }

  function chooseSquad(p: ClubPlayer) {
    showSheet(`Team for ${p.first_name}`, [
      ...me.squads.map((s) => ({ text: s.name, onPress: () => run(() => adminSetPlayerSquad(p.user_id, s.id)) })),
      { text: 'No team', destructive: true, onPress: () => run(() => adminSetPlayerSquad(p.user_id, null)) },
    ]);
  }

  function actions(p: ClubPlayer) {
    const self = p.user_id === userId;
    showSheet(fullName(p), [
      { text: 'Change team', onPress: () => chooseSquad(p) },
      ...(self
        ? []
        : [
            p.role === 'admin'
              ? { text: 'Remove admin rights', onPress: () => run(() => setMemberRole(club.id, p.user_id, 'member')) }
              : { text: 'Make club admin', onPress: () => run(() => setMemberRole(club.id, p.user_id, 'admin')) },
            {
              text: 'Remove from club',
              destructive: true,
              onPress: async () => {
                if (await confirm(`Remove ${p.first_name}?`, 'They’ll lose access to the club. Their past results stay.', 'Remove')) {
                  run(async () => {
                    await adminSetPlayerSquad(p.user_id, null);
                    await removeMember(club.id, p.user_id);
                  });
                }
              },
            },
          ]),
    ]);
  }

  return (
    <Screen onRefresh={refresh}>
      {sheet}
      <Text variant="small" color="textMuted">
        Tap a member to change their team or role.
      </Text>
      {q.isPending ? (
        <Skeleton count={6} height={70} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <View style={{ gap: space.sm }}>
          {(q.data ?? []).map((p) => (
            <Card key={p.user_id} onPress={() => actions(p)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar userId={p.user_id} first={p.first_name} surname={p.surname} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyBold">{fullName(p)}</Text>
                  <Text variant="small" color="textMuted">
                    {p.squad_name ?? 'Not in a team'}
                  </Text>
                </View>
                {p.role === 'admin' ? <Chip label="Admin" tone="accent" /> : null}
                {p.is_captain ? <Chip label="Captain" tone="success" /> : null}
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
