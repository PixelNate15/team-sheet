import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, View } from 'react-native';

import { fetchFixtureFees, setFeePaid } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatPence } from '@/lib/format';
import { space } from '@/theme';

import { Chip, SectionHeader } from './Bits';
import { Card } from './Card';
import { Text } from './Text';

/**
 * Match fee for a fixture. Players see whether they've paid; the captain sees
 * every selected player and taps to record a payment.
 */
export function FeesSection({ fixtureId, canManage }: { fixtureId: number; canManage: boolean }) {
  const qc = useQueryClient();
  const fees = useQuery({ queryKey: ['fixtureFees', fixtureId], queryFn: () => fetchFixtureFees(fixtureId) });

  const toggle = useMutation({
    mutationFn: (v: { userId: string; paid: boolean }) => setFeePaid(fixtureId, v.userId, v.paid),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['fixtureFees', fixtureId] }),
        qc.invalidateQueries({ queryKey: ['outstandingFees'] }),
      ]),
    onError: (e) => Alert.alert('Couldn’t record the payment', errorMessage(e)),
  });

  const rows = fees.data ?? [];
  if (rows.length === 0) return null;
  const fee = rows[0].fee_pence;
  const paid = rows.filter((r) => r.paid).length;

  return (
    <>
      <SectionHeader title={canManage ? `Match fee · ${formatPence(fee)} · ${paid}/${rows.length} paid` : 'Match fee'} />
      <Card>
        <View style={{ gap: space.md }}>
          {rows.map((r) => (
            <Pressable
              key={r.user_id}
              disabled={!canManage || toggle.isPending}
              accessibilityRole={canManage ? 'button' : undefined}
              accessibilityLabel={canManage ? `${r.name}, ${r.paid ? 'paid' : 'not paid'}. Tap to change.` : undefined}
              onPress={() => toggle.mutate({ userId: r.user_id, paid: !r.paid })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Text variant="body" style={{ flex: 1 }}>
                {canManage ? r.name : `${formatPence(r.fee_pence)} for this fixture`}
              </Text>
              <Chip label={r.paid ? 'Paid' : 'Not paid'} tone={r.paid ? 'success' : 'warning'} icon={r.paid ? 'checkmark' : undefined} />
            </Pressable>
          ))}
          {canManage ? (
            <Text variant="small" color="textMuted">
              Tap a player to mark them as paid or unpaid.
            </Text>
          ) : (
            <Text variant="small" color="textMuted">
              Your captain records payments.
            </Text>
          )}
        </View>
      </Card>
    </>
  );
}
