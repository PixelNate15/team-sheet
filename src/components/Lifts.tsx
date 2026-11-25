import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, View } from 'react-native';

import { dropPassenger, fetchLiftBoard, setMyLift, takePassenger } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { LiftRow } from '@/lib/types';
import { space, useTheme } from '@/theme';

import { useActionSheet } from './ActionSheet';
import { Avatar, Chip, SectionHeader } from './Bits';
import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';

/** Lift-sharing for one fixture: drivers offer seats, players who need a lift get picked up. */
export function LiftsSection({ fixtureId, userId, isHome }: { fixtureId: number; userId: string; isHome: boolean }) {
  const { c } = useTheme();
  const qc = useQueryClient();
  const [sheet, showSheet] = useActionSheet();
  const board = useQuery({ queryKey: ['lifts', fixtureId], queryFn: () => fetchLiftBoard(fixtureId) });

  const act = useMutation({
    mutationFn: (fn: () => Promise<void>) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lifts', fixtureId] }),
    onError: (e) => Alert.alert('Couldn’t update lifts', errorMessage(e)),
  });

  const rows = board.data ?? [];
  const drivers = rows.filter((r) => r.kind === 'offer');
  const waiting = rows.filter((r) => r.kind === 'need' && !r.driver_id);
  const mine = rows.find((r) => r.user_id === userId);
  const myCar = mine?.kind === 'offer' ? mine : null;
  const seatsLeft = myCar ? (myCar.seats ?? 0) - (myCar.seats_taken ?? 0) : 0;

  const offerSeats = () =>
    showSheet(
      'How many seats can you offer?',
      [1, 2, 3, 4, 5].map((n) => ({
        text: `${n} seat${n === 1 ? '' : 's'}`,
        onPress: () => act.mutate(() => setMyLift(fixtureId, 'offer', n, mine?.note ?? null)),
      })),
    );

  return (
    <>
      {sheet}
      <SectionHeader title={isHome ? 'Lifts' : 'Lifts to the away match'} />
      <Card>
        <View style={{ gap: space.md }}>
          {drivers.length === 0 && waiting.length === 0 ? (
            <Text variant="small" color="textMuted">
              Nobody has offered or asked for a lift yet.
            </Text>
          ) : null}

          {drivers.map((d) => (
            <DriverRow key={d.user_id} driver={d} passengers={rows.filter((r) => r.driver_id === d.user_id)} userId={userId}
              onDrop={(p) => act.mutate(() => dropPassenger(fixtureId, p))} />
          ))}

          {waiting.length > 0 ? (
            <View style={{ gap: space.sm }}>
              <Text variant="caption" color="textMuted">
                NEED A LIFT
              </Text>
              {waiting.map((p) => (
                <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar userId={p.user_id} first={p.name.split(' ')[0]} surname={p.name.split(' ').slice(1).join(' ')} size={32} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {p.user_id === userId ? 'You' : p.name}
                  </Text>
                  {myCar && seatsLeft > 0 && p.user_id !== userId ? (
                    <Button title="Take" size="sm" full={false} variant="secondary"
                      onPress={() => act.mutate(() => takePassenger(fixtureId, p.user_id))} />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ height: 1, backgroundColor: c.border }} />

          {/* Your own status */}
          {!mine ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title="I can drive" icon="car-outline" size="sm" variant="secondary" style={{ flex: 1 }}
                loading={act.isPending} onPress={offerSeats} />
              <Button title="I need a lift" icon="hand-left-outline" size="sm" variant="secondary" style={{ flex: 1 }}
                loading={act.isPending} onPress={() => act.mutate(() => setMyLift(fixtureId, 'need', null, null))} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text variant="small" color="textMuted" style={{ flex: 1 }}>
                {myCar
                  ? `You’re driving · ${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} free`
                  : mine.driver_id
                    ? `${mine.driver_name} is driving you`
                    : 'You’ve asked for a lift'}
              </Text>
              {myCar ? <Button title="Seats" size="sm" variant="ghost" full={false} onPress={offerSeats} /> : null}
              {mine.kind === 'need' && mine.driver_id ? (
                <Button title="Cancel lift" size="sm" variant="ghost" full={false}
                  onPress={() => act.mutate(() => dropPassenger(fixtureId, userId))} />
              ) : (
                <Button title="Withdraw" size="sm" variant="ghost" full={false} loading={act.isPending}
                  onPress={() => act.mutate(() => setMyLift(fixtureId, null, null, null))} />
              )}
            </View>
          )}
        </View>
      </Card>
    </>
  );
}

function DriverRow({ driver, passengers, userId, onDrop }: {
  driver: LiftRow;
  passengers: LiftRow[];
  userId: string;
  onDrop: (passengerId: string) => void;
}) {
  const [first, ...rest] = driver.name.split(' ');
  const free = (driver.seats ?? 0) - (driver.seats_taken ?? 0);
  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar userId={driver.user_id} first={first} surname={rest.join(' ')} size={36} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">{driver.user_id === userId ? 'You' : driver.name} · driving</Text>
          {driver.note ? (
            <Text variant="small" color="textMuted" numberOfLines={2}>
              {driver.note}
            </Text>
          ) : null}
        </View>
        <Chip label={free > 0 ? `${free} free` : 'Full'} tone={free > 0 ? 'success' : 'neutral'} />
      </View>
      {passengers.map((p) => (
        <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginLeft: 48 }}>
          <Text variant="small" style={{ flex: 1 }}>
            • {p.user_id === userId ? 'You' : p.name}
          </Text>
          {driver.user_id === userId ? (
            <Text variant="smallBold" color="accent" accessibilityRole="button" onPress={() => onDrop(p.user_id)}>
              Drop
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
