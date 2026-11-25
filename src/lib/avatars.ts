import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { avatarUrl, fetchClubAvatars } from './api';

/** Photo paths for everyone in the club (RLS limits profiles to your club), loaded once and cached. */
export function useClubAvatars() {
  return useQuery({ queryKey: ['clubAvatars'], queryFn: fetchClubAvatars, staleTime: 5 * 60_000 });
}

/** Public URL of a player's photo, or null for initials. */
export function useAvatarUrl(userId: string | null | undefined) {
  const { data } = useClubAvatars();
  return useMemo(() => {
    const path = userId ? data?.find((p) => p.id === userId)?.avatar_path : null;
    return path ? avatarUrl(path) : null;
  }, [data, userId]);
}
