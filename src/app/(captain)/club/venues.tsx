import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, ListRow } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { deleteVenue, fetchVenues, saveVenue } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { confirm } from '@/lib/hooks';
import type { Venue } from '@/lib/types';
import { space, useTheme } from '@/theme';

const EMPTY = { name: '', address: '', notes: '' };

/**
 * The club's venue book: where each opponent plays, with parking and court
 * notes. The fixture editor fills in the venue for away fixtures from here.
 */
export default function Venues() {
  const { c } = useTheme();
  const qc = useQueryClient();
  const { club, userId } = useSignedIn();
  const venues = useQuery({ queryKey: ['venues', club.id], queryFn: () => fetchVenues(club.id) });
  const [editing, setEditing] = useState<Venue | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);

  const open = (v: Venue | 'new') => {
    setEditing(v);
    setForm(v === 'new' ? EMPTY : { name: v.name, address: v.address, notes: v.notes ?? '' });
  };

  const save = useMutation({
    mutationFn: () => {
      if (!form.name.trim() || !form.address.trim()) throw new Error('Add the club name and the address.');
      return saveVenue({ id: editing && editing !== 'new' ? editing.id : undefined, clubId: club.id, userId, ...form });
    },
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['venues', club.id] });
    },
    onError: (e) => Alert.alert('Couldn’t save the venue', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteVenue(id),
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['venues', club.id] });
    },
    onError: (e) => Alert.alert('Couldn’t delete', errorMessage(e)),
  });

  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen>
      <Text variant="body" color="textMuted">
        Save where each opponent plays, once. Away fixtures against them get the venue and notes filled in, and
        “Oakwood TC” also covers “Oakwood TC B”.
      </Text>

      {editing ? (
        <Card>
          <View style={{ gap: space.md }}>
            <TextField label="Club" value={form.name} onChangeText={set('name')} placeholder="e.g. Oakwood TC" maxLength={100} />
            <TextField label="Address" value={form.address} onChangeText={set('address')} placeholder="Street, town, postcode" maxLength={200} />
            <TextField
              label="Notes (optional)"
              value={form.notes}
              onChangeText={set('notes')}
              placeholder="Parking, court surface, where to meet…"
              multiline
              maxLength={500}
            />
            <Button title="Save venue" loading={save.isPending} onPress={() => save.mutate()} />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="Cancel" variant="ghost" style={{ flex: 1 }} onPress={() => setEditing(null)} />
              {editing !== 'new' ? (
                <Button
                  title="Delete"
                  variant="danger"
                  style={{ flex: 1 }}
                  loading={remove.isPending}
                  onPress={async () => {
                    if (await confirm('Delete this venue?', `${editing.name} will be removed from the venue book.`)) remove.mutate(editing.id);
                  }}
                />
              ) : null}
            </View>
          </View>
        </Card>
      ) : (
        <Button title="Add a venue" icon="add-circle-outline" variant="secondary" onPress={() => open('new')} />
      )}

      {(venues.data ?? []).length === 0 ? (
        <EmptyState icon="location-outline" title="No venues yet" message="Add the clubs you play away at." />
      ) : (
        <Card padded={false}>
          {(venues.data ?? []).map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <View style={[styles.divider, { backgroundColor: c.border }]} /> : null}
              <Pressable style={styles.row} onPress={() => open(v)}>
                <ListRow icon="location-outline" title={v.name} subtitle={v.notes ? `${v.address} · ${v.notes}` : v.address} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { padding: space.lg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
});
