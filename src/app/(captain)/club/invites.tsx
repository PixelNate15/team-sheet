import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useMemo, useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Chip, EmptyState, SectionHeader } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { deleteInvite, fetchClubInvites, importInvites } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { parsePlayerCsv } from '@/lib/csv';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/hooks';
import { space } from '@/theme';

const EXAMPLE = 'First name,Surname,Email,Team\nTom,Reid,tom@example.com,1st Team';

/**
 * Club admins import a player list. Each email becomes an invite: when that
 * person signs up with the same email, the app offers to put them straight
 * into the club and team. No emails are sent; share the club code as usual.
 */
export default function InvitesScreen() {
  const qc = useQueryClient();
  const { club, me } = useSignedIn();
  const [text, setText] = useState('');

  const invites = useQuery({ queryKey: ['invites', club.id], queryFn: () => fetchClubInvites(club.id) });
  const rows = useMemo(() => parsePlayerCsv(text), [text]);
  const squadByName = useMemo(() => new Map(me.squads.map((s) => [s.name.trim().toLowerCase(), s])), [me.squads]);
  const ready = rows.filter((r) => !r.problem);
  const unknownTeams = [...new Set(ready.filter((r) => r.team && !squadByName.has(r.team.toLowerCase())).map((r) => r.team))];

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setText(new File(res.assets[0].uri).textSync());
    } catch (e) {
      Alert.alert('Couldn’t read that file', `${errorMessage(e)} Save it as CSV and try again.`);
    }
  };

  const run = useMutation({
    mutationFn: () =>
      importInvites(
        ready.map((r) => ({
          email: r.email,
          first_name: r.first_name,
          surname: r.surname,
          squad_id: r.team ? (squadByName.get(r.team.toLowerCase())?.id ?? null) : null,
        })),
      ),
    onSuccess: async (res) => {
      setText('');
      await qc.invalidateQueries({ queryKey: ['invites', club.id] });
      const parts = [
        `${res.added} invited`,
        res.updated ? `${res.updated} updated` : null,
        res.already_members ? `${res.already_members} already in the club` : null,
        res.invalid ? `${res.invalid} skipped` : null,
      ].filter(Boolean);
      Alert.alert('Players imported', `${parts.join(', ')}.\n\nShare the club code so they can sign up. They’ll be put into the right team automatically.`);
    },
    onError: (e) => Alert.alert('Couldn’t import', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteInvite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', club.id] }),
    onError: (e) => Alert.alert('Couldn’t remove', errorMessage(e)),
  });

  const pending = (invites.data ?? []).filter((i) => !i.accepted_at);
  const joined = (invites.data ?? []).filter((i) => i.accepted_at);

  return (
    <Screen>
      <Text variant="body" color="textMuted">
        Add a list of players with their email addresses. When someone signs up with that email, Team Sheet puts them
        straight into {club.name} and their team.
      </Text>

      <Card>
        <View style={{ gap: space.md }}>
          <Button title="Choose a CSV file" icon="document-outline" variant="secondary" onPress={pickFile} />
          <TextField
            label="Or paste the list"
            value={text}
            onChangeText={setText}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={EXAMPLE}
            hint="Columns: first name, surname, email and (optional) team. Spreadsheet exports work."
          />
        </View>
      </Card>

      {rows.length > 0 ? (
        <>
          <SectionHeader title={`Preview · ${ready.length} ready${rows.length - ready.length ? ` · ${rows.length - ready.length} with problems` : ''}`} />
          <Card>
            <View style={{ gap: space.sm }}>
              {rows.slice(0, 50).map((r) => (
                <View key={`${r.line}-${r.email}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold" numberOfLines={1}>
                      {[r.first_name, r.surname].filter(Boolean).join(' ') || '(no name)'}
                    </Text>
                    <Text variant="small" color={r.problem ? 'danger' : 'textMuted'} numberOfLines={1}>
                      {r.problem ? `Line ${r.line}: ${r.problem}` : `${r.email}${r.team ? ` · ${r.team}` : ''}`}
                    </Text>
                  </View>
                  <Chip label={r.problem ? 'Skip' : 'OK'} tone={r.problem ? 'danger' : 'success'} />
                </View>
              ))}
              {rows.length > 50 ? (
                <Text variant="small" color="textMuted">
                  …and {rows.length - 50} more
                </Text>
              ) : null}
            </View>
          </Card>
          {unknownTeams.length ? (
            <Text variant="small" color="warning">
              No team called {unknownTeams.map((t) => `“${t}”`).join(', ')}. Those players will join the club without a
              team.
            </Text>
          ) : null}
          <Button
            title={`Import ${ready.length} player${ready.length === 1 ? '' : 's'}`}
            icon="cloud-upload-outline"
            disabled={ready.length === 0}
            loading={run.isPending}
            onPress={() => run.mutate()}
          />
        </>
      ) : null}

      <SectionHeader
        title={`Waiting to join · ${pending.length}`}
        action={
          pending.length ? (
            <Text
              variant="smallBold"
              color="accent"
              onPress={() =>
                Share.share({
                  message: `Join ${club.name} on Team Sheet: download the app, sign up with your email and enter the club code ${club.join_code}.`,
                })
              }>
              Share code
            </Text>
          ) : undefined
        }
      />
      {pending.length === 0 ? (
        <EmptyState icon="mail-outline" title="No pending invites" message="Imported players appear here until they join." />
      ) : (
        <Card>
          <View style={{ gap: space.md }}>
            {pending.map((i) => (
              <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold" numberOfLines={1}>
                    {[i.first_name, i.surname].filter(Boolean).join(' ') || i.email}
                  </Text>
                  <Text variant="small" color="textMuted" numberOfLines={1}>
                    {i.email}
                    {i.squads?.name ? ` · ${i.squads.name}` : ''}
                  </Text>
                </View>
                <Text
                  variant="smallBold"
                  color="danger"
                  accessibilityRole="button"
                  onPress={async () => {
                    if (await confirm('Remove this invite?', `${i.email} won’t be added automatically.`)) remove.mutate(i.id);
                  }}>
                  Remove
                </Text>
              </View>
            ))}
          </View>
        </Card>
      )}

      {joined.length ? (
        <Text variant="small" color="textMuted">
          {joined.length} imported player{joined.length === 1 ? ' has' : 's have'} joined.
        </Text>
      ) : null}
    </Screen>
  );
}
