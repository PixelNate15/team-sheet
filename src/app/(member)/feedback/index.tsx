import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, EmptyState, ErrorState, Skeleton, Stat } from '@/components/Bits';
import { Card } from '@/components/Card';
import { FeedbackCard } from '@/components/FeedbackCard';
import { Segmented } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { fetchFeedbackReceived } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { fullDate } from '@/lib/format';
import { feedbackToGive } from '@/lib/feedback';
import { useMyResults, useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

/**
 * "To give" replaces member_show_required_partner_feedback_screen;
 * "Received" replaces member_show_recent_partner_feedback.
 */
export default function FeedbackTab() {
  const { userId } = useSignedIn();
  const refresh = useRefreshAll();
  const [tab, setTab] = useState<'give' | 'received'>('give');

  const results = useMyResults();
  const toGive = feedbackToGive(results.data);
  const received = useQuery({ queryKey: ['feedbackReceived', userId], queryFn: () => fetchFeedbackReceived(userId) });

  const avg = (k: 'overall_rating' | 'key_moments_rating' | 'communication_rating') => {
    const list = received.data ?? [];
    return list.length ? (list.reduce((n, f) => n + f[k], 0) / list.length).toFixed(1) : '–';
  };

  return (
    <Screen onRefresh={refresh}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'give', label: `To give${toGive.length ? ` (${toGive.length})` : ''}` },
          { value: 'received', label: 'Received' },
        ]}
      />

      {tab === 'give' ? (
        results.isPending ? (
          <Skeleton count={3} height={76} />
        ) : results.error ? (
          <ErrorState error={results.error} onRetry={() => results.refetch()} />
        ) : toGive.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="All done" message="You’ve rated every partner from the last 6 months." />
        ) : (
          toGive.map((r) => {
            const [first, ...rest] = r.partner_name.split(' ');
            return (
              <Card
                key={r.match_id}
                onPress={() => router.push({ pathname: '/give-feedback/[matchId]', params: { matchId: String(r.match_id) } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar userId={r.partner_id} first={first} surname={rest.join(' ')} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyBold">Rate {r.partner_name}</Text>
                    <Text variant="small" color="textMuted">
                      {r.is_home ? 'vs' : '@'} {r.opponent_name} · {fullDate(r.fixture_date)}
                    </Text>
                  </View>
                  <Text variant="smallBold" color="accent">
                    Rate
                  </Text>
                </View>
              </Card>
            );
          })
        )
      ) : received.isPending ? (
        <Skeleton count={3} height={150} />
      ) : received.error ? (
        <ErrorState error={received.error} onRetry={() => received.refetch()} />
      ) : (received.data ?? []).length === 0 ? (
        <EmptyState icon="star-outline" title="No feedback yet" message="When a partner rates you after a match, it shows up here. Only you and your captain can see it." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Stat label="Overall" value={avg('overall_rating')} tone="accent" />
            <Stat label="Moments" value={avg('key_moments_rating')} />
            <Stat label="Comms" value={avg('communication_rating')} />
          </View>
          {(received.data ?? []).map((f) => (
            <FeedbackCard key={f.id} f={f} />
          ))}
        </>
      )}
    </Screen>
  );
}
