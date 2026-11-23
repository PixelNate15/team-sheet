import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useActionSheet } from '@/components/ActionSheet';
import { Chip, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { createSquad, deleteSquad, fetchClubPlayers, fetchDivisions, updateSquad } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { fullName } from '@/lib/format';
import { confirm, useRefreshAll } from '@/lib/hooks';
import type { Squad } from '@/lib/types';
import { space } from '@/theme';

/** Admin: teams (squads), their ranking, division and captain. */
export default function Squads() {
  const { club, me } = useSignedIn();
  const refresh = useRefreshAll();
  const divisions = useQuery({ queryKey: ['divisions', club.id], queryFn: () => fetchDivisions(club.id) });
  const players = useQuery({ queryKey: ['clubPlayers'], queryFn: fetchClubPlayers });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, showSheet] = useActionSheet();

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      Alert.alert('Couldn’t update', errorMessage(e));
    }
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    const ranking = Math.max(0, ...me.squads.map((s) => s.ranking)) + 1;
    await run(() => createSquad(club.id, name, ranking, divisions.data?.[0]?.id ?? null));
    setName('');
    setBusy(false);
  }

  function pickCaptain(s: Squad) {
    const options = (players.data ?? []).filter((p) => p.squad_id === s.id);
    if (options.length === 0) {
      Alert.alert('No players in this team', 'Add players to the team first, then choose a captain.');
      return;
    }
    showSheet(
      `Captain of ${s.name}`,
      options.map((p) => ({ text: fullName(p), onPress: () => run(() => updateSquad(s.id, { captain_id: p.user_id })) })),
    );
  }

  function pickDivision(s: Squad) {
    showSheet(
      `Division for ${s.name}`,
      (divisions.data ?? []).map((d) => ({ text: d.name, onPress: () => run(() => updateSquad(s.id, { division_id: d.id })) })),
      divisions.data?.length ? undefined : 'Add a division under Seasons & divisions first.',
    );
  }

  return (
    <Screen onRefresh={refresh}>
      {sheet}
      <Text variant="small" color="textMuted">
        Teams are ranked in order: players can be moved down from a team to the next one, and captains can pull players up from lower teams.
      </Text>
      {me.squads.map((s) => {
        const captain = players.data?.find((p) => p.user_id === s.captain_id);
        const division = divisions.data?.find((d) => d.id === s.division_id);
        const count = players.data?.filter((p) => p.squad_id === s.id).length ?? 0;
        return (
          <Card key={s.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Chip label={`#${s.ranking}`} tone="accent" />
              <Text variant="heading" style={{ flex: 1 }}>
                {s.name}
              </Text>
              <Text variant="small" color="textMuted">
                {count} players
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <Button title={captain ? `Capt: ${captain.first_name}` : 'Set captain'} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => pickCaptain(s)} />
              <Button title={division?.name ?? 'Set division'} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => pickDivision(s)} />
            </View>
            <Button
              title="Delete team"
              size="sm"
              variant="ghost"
              full={false}
              style={{ marginTop: space.sm }}
              onPress={async () => {
                if (await confirm(`Delete ${s.name}?`, 'Its fixtures and results will be deleted too. Players stay in the club.', 'Delete')) {
                  run(() => deleteSquad(s.id));
                }
              }}
            />
          </Card>
        );
      })}

      <SectionHeader title="Add a team" />
      <TextField label="Team name" value={name} onChangeText={setName} placeholder="e.g. Men’s 2nd Team" />
      <Button title="Add team" icon="add" onPress={add} loading={busy} disabled={!name.trim()} />
    </Screen>
  );
}
