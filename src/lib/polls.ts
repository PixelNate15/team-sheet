export interface PollVote {
  message_id: number;
  user_id: string;
  option: number;
}

export interface PollTally {
  counts: number[];
  total: number;
  /** The signed-in player's choice, or null. */
  mine: number | null;
}

/** Count the votes for one poll. Votes for options that don't exist are ignored. */
export function tallyPoll(messageId: number, optionCount: number, votes: PollVote[], userId: string): PollTally {
  const counts = Array.from({ length: optionCount }, () => 0);
  let mine: number | null = null;
  for (const v of votes) {
    if (v.message_id !== messageId || v.option < 0 || v.option >= optionCount) continue;
    counts[v.option] += 1;
    if (v.user_id === userId) mine = v.option;
  }
  return { counts, total: counts.reduce((a, b) => a + b, 0), mine };
}

/** Whole-number percentages for a tally (0 when nobody has voted). */
export function pollPercents(t: PollTally): number[] {
  return t.counts.map((n) => (t.total ? Math.round((n * 100) / t.total) : 0));
}
