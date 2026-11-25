import type { MyResult } from './types';

/**
 * Partners still to rate: one per partner per fixture (a pair plays two rubbers
 * together, but is rated once). Keeps the earliest rubber, which the rating is attached to.
 */
export function feedbackToGive(results: MyResult[] | undefined): MyResult[] {
  const seen = new Set<string>();
  return [...(results ?? [])]
    .sort((a, b) => a.rubber_number - b.rubber_number)
    .filter((r) => {
      const key = `${r.fixture_id}:${r.partner_id}`;
      if (r.feedback_given || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.fixture_date < b.fixture_date ? 1 : a.fixture_date > b.fixture_date ? -1 : 0));
}
