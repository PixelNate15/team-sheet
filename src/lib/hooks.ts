import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Alert } from 'react-native';

import { fetchCurrentInjury, fetchMyFixtures, fetchMyResults, setAvailability } from './api';
import { useSignedIn } from './auth';
import { errorMessage } from './errors';
import type { MyResult } from './types';

export function useMyFixtures() {
  return useQuery({ queryKey: ['myFixtures'], queryFn: fetchMyFixtures });
}

export function useMyResults() {
  return useQuery({ queryKey: ['myResults'], queryFn: fetchMyResults });
}

export function useMyInjury() {
  const { userId } = useSignedIn();
  return useQuery({ queryKey: ['injury', userId], queryFn: () => fetchCurrentInjury(userId) });
}

/** After any write, refresh everything: the data set is small and this keeps every screen consistent. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Results grouped by fixture, newest first. */
export interface FixtureResultGroup {
  fixtureId: number;
  opponent: string;
  date: string;
  isHome: boolean;
  teamSetsWon: number;
  teamSetsLost: number;
  rubbers: MyResult[];
}

export function useGroupedResults() {
  const q = useMyResults();
  const groups = useMemo(() => {
    const map = new Map<number, FixtureResultGroup>();
    for (const r of q.data ?? []) {
      let g = map.get(r.fixture_id);
      if (!g) {
        g = {
          fixtureId: r.fixture_id,
          opponent: r.opponent_name,
          date: r.fixture_date,
          isHome: r.is_home,
          teamSetsWon: r.team_sets_won,
          teamSetsLost: r.team_sets_lost,
          rubbers: [],
        };
        map.set(r.fixture_id, g);
      }
      g.rubbers.push(r);
    }
    return [...map.values()];
  }, [q.data]);
  return { ...q, groups };
}

export function useSetAvailability() {
  const { userId } = useSignedIn();
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (v: { fixtureId: number; available: boolean; reason?: string }) =>
      setAvailability(v.fixtureId, userId, v.available, v.reason),
    onSuccess: refresh,
    onError: (e) => Alert.alert('Couldn’t save', errorMessage(e)),
  });
}

/** Native confirmation dialog for destructive actions (the original had none). */
export function confirm(title: string, message: string, confirmText = 'Delete', destructive = true): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
