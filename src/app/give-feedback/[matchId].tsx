import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar } from '@/components/Bits';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/Field';
import { RatingPicker } from '@/components/Pickers';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { submitFeedback } from '@/lib/api';
import { useSignedIn } from '@/lib/auth';
import { errorMessage } from '@/lib/errors';
import { fullDate } from '@/lib/format';
import { useMyResults, useRefreshAll } from '@/lib/hooks';
import { space } from '@/theme';

/** Port of member_submit_feedback.py. Ratings start unset; comment is optional. */
export default function GiveFeedback() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { userId } = useSignedIn();
  const refresh = useRefreshAll();
  const match = useMyResults().data?.find((r) => r.match_id === Number(matchId));

  const [overall, setOverall] = useState<number | null>(null);
  const [moments, setMoments] = useState<number | null>(null);
  const [comms, setComms] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const save = useMutation({
    mutationFn: () =>
      submitFeedback({
        match_id: Number(matchId),
        reviewer_id: userId,
        reviewed_id: match!.partner_id,
        overall_rating: overall!,
        key_moments_rating: moments!,
        communication_rating: comms!,
        comments: comment,
      }),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: (e) => Alert.alert('Couldn’t send feedback', errorMessage(e)),
  });

  const ready = overall != null && moments != null && comms != null && !!match;
  const [first, ...rest] = (match?.partner_name ?? 'Partner').split(' ');

  return (
    <Screen
      footer={<Button title="Send feedback" onPress={() => save.mutate()} disabled={!ready} loading={save.isPending} />}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <Avatar userId={match?.partner_id} first={first} surname={rest.join(' ')} size={72} />
        <Text variant="title" align="center">
          {match?.partner_name ?? 'Your partner'}
        </Text>
        {match ? (
          <Text variant="body" color="textMuted" align="center">
            {match.is_home ? 'vs' : '@'} {match.opponent_name} · {fullDate(match.fixture_date)}
          </Text>
        ) : null}
      </View>

      <Card>
        <View style={{ gap: space.xl }}>
          <RatingPicker label="Overall" value={overall} onChange={setOverall} />
          <RatingPicker label="Key moments" value={moments} onChange={setMoments} />
          <RatingPicker label="Communication" value={comms} onChange={setComms} />
        </View>
      </Card>

      <TextField
        label="Comment (optional)"
        value={comment}
        onChangeText={setComment}
        placeholder="What went well? What could be better?"
        maxLength={1000}
        multiline
      />
      <Text variant="small" color="textFaint">
        Only your partner and your captain can see this feedback.
      </Text>
    </Screen>
  );
}
