// When each chat was last read on this device, for the unread dot on Home.
// A per-device convenience, so it lives in local storage, not the database.

const keyFor = (clubId: number, fixtureId: number | null) => `chatRead:${clubId}:${fixtureId ?? 'club'}`;

export function markChatRead(clubId: number, fixtureId: number | null, latestIso: string) {
  try {
    localStorage.setItem(keyFor(clubId, fixtureId), latestIso);
  } catch {
    // storage unavailable: the dot just stays
  }
}

/** True if the newest message (by someone else) is newer than the last read time. */
export function hasUnread(
  clubId: number,
  fixtureId: number | null,
  latest: { created_at: string; user_id: string } | undefined,
  userId: string,
) {
  if (!latest || latest.user_id === userId) return false;
  try {
    const read = localStorage.getItem(keyFor(clubId, fixtureId));
    return !read || new Date(latest.created_at).getTime() > new Date(read).getTime();
  } catch {
    return false;
  }
}
