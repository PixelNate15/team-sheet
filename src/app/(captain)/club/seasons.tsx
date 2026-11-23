import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Chip, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { createDivision, createSeason, fetchDivisions, fetchSeasons, setCurrentSeason } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { confirm, useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

/** Admin: seasons (the original could only change these in SQL) and league divisions. */
export default function Seasons() {
  const { club } = useSignedIn();
  const refresh = useRefreshAll();
  const seasons = useQuery({ queryKey: ['seasons', club.id], queryFn: () => fetchSeasons(club.id) });
  const divisions = useQuery({ queryKey: ['divisions', club.id], queryFn: () => fetchDivisions(club.id) });
  const [seasonName, setSeasonName] = useState('');
  const [divisionName, setDivisionName] = useState('');
  const [teamCount, setTeamCount] = useState('8');

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
      return true;
    } catch (e) {
      Alert.alert('Couldn’t save', errorMessage(e));
      return false;
    }
  }

  return (
    <Screen onRefresh={refresh}>
      <SectionHeader title="Seasons" />
      {(seasons.data ?? []).map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text variant="bodyBold" style={{ flex: 1 }}>
              {s.name}
            </Text>
            {s.is_current ? (
              <Chip label="Current" tone="success" />
            ) : (
              <Button
                title="Make current"
                size="sm"
                variant="secondary"
                full={false}
                onPress={async () => {
                  if (await confirm(`Start ${s.name}?`, 'New fixtures will be added to this season. Season stats reset.', 'Make current', false)) {
                    run(() => setCurrentSeason(s.id));
                  }
                }}
              />
            )}
          </View>
        </Card>
      ))}
      <TextField label="New season" value={seasonName} onChangeText={setSeasonName} placeholder="e.g. Summer 2027" />
      <Button
        title="Add season"
        icon="add"
        variant="secondary"
        disabled={!seasonName.trim()}
        onPress={async () => {
          if (await run(() => createSeason(club.id, seasonName))) setSeasonName('');
        }}
      />

      <SectionHeader title="Divisions" />
      {(divisions.data ?? []).map((d) => (
        <Card key={d.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodyBold">{d.name}</Text>
            <Text variant="small" color="textMuted">
              {d.team_count} teams
            </Text>
          </View>
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 2 }}>
          <TextField label="New division" value={divisionName} onChangeText={setDivisionName} placeholder="e.g. Division 2" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Teams" value={teamCount} onChangeText={setTeamCount} keyboardType="number-pad" />
        </View>
      </View>
      <Button
        title="Add division"
        icon="add"
        variant="secondary"
        disabled={!divisionName.trim() || !(Number(teamCount) >= 2 && Number(teamCount) <= 40)}
        onPress={async () => {
          if (await run(() => createDivision(club.id, divisionName, Number(teamCount)))) setDivisionName('');
        }}
      />
    </Screen>
  );
}
