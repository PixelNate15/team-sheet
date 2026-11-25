import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Appearance } from 'react-native';

import { fetchMe, type Me } from './api';
import { supabase } from './supabase';
import type { Squad } from './types';

interface AuthState {
  /** undefined while the stored session is being restored */
  session: Session | null | undefined;
  me: Me | undefined;
  /** Set when the profile/club could not be loaded (e.g. offline). */
  meError: unknown;
  isLoading: boolean;
  userId: string | null;
  isAdmin: boolean;
  /** Squads this user can manage: those they captain, or every squad for admins. */
  managedSquads: Squad[];
  canCaptain: boolean;
  activeSquad: Squad | null;
  setActiveSquadId: (id: number) => void;
  refreshMe: () => Promise<unknown>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const ACTIVE_SQUAD_KEY = 'activeSquadId';

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [activeSquadId, setActiveSquadIdState] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(ACTIVE_SQUAD_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const meQuery = useQuery({
    queryKey: ['me', userId],
    queryFn: () => fetchMe(userId!),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const me = meQuery.data;

  // Apply the saved theme preference (system / light / dark).
  useEffect(() => {
    const pref = me?.profile.theme ?? 'system';
    // Not available on web, where the browser's setting is always followed.
    if (typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
    }
  }, [me?.profile.theme]);

  const isAdmin = me?.membership?.role === 'admin';
  const managedSquads = useMemo(() => {
    if (!me) return [];
    return isAdmin ? me.squads : me.squads.filter((s) => s.captain_id === userId);
  }, [me, isAdmin, userId]);

  const activeSquad =
    managedSquads.find((s) => s.id === activeSquadId) ??
    managedSquads.find((s) => s.id === me?.mySquadId) ??
    managedSquads[0] ??
    null;

  const setActiveSquadId = useCallback((id: number) => {
    setActiveSquadIdState(id);
    try {
      localStorage.setItem(ACTIVE_SQUAD_KEY, String(id));
    } catch {
      // per-device convenience only
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const value: AuthState = {
    session,
    me,
    meError: meQuery.error,
    isLoading: session === undefined || (!!userId && meQuery.isPending),
    userId,
    isAdmin,
    managedSquads,
    canCaptain: managedSquads.length > 0,
    activeSquad,
    setActiveSquadId,
    refreshMe: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
    signOut,
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

type SignedIn = AuthState & {
  userId: string;
  me: Me;
  membership: NonNullable<Me['membership']>;
  club: NonNullable<Me['membership']>['club'];
};

const EMPTY_CLUB = { id: 0, name: '', join_code: '' };
const EMPTY_MEMBERSHIP: NonNullable<Me['membership']> = { club_id: 0, role: 'member', club: EMPTY_CLUB };
const EMPTY_ME: Me = {
  profile: { id: '', first_name: '', surname: '', theme: 'system', expo_push_token: null, notifications_enabled: false },
  membership: EMPTY_MEMBERSHIP,
  squads: [],
  mySquadId: null,
};

/**
 * For screens that are only reachable when signed in to a club (the root
 * navigator guards them). While screens are being torn down after signing
 * out or leaving a club, empty placeholders are returned instead of
 * throwing, so nothing crashes mid-transition.
 */
export function useSignedIn(): SignedIn {
  const auth = useAuth();
  const me = auth.me ?? EMPTY_ME;
  const membership = me.membership ?? EMPTY_MEMBERSHIP;
  return { ...auth, userId: auth.userId ?? '', me, membership, club: membership.club };
}
