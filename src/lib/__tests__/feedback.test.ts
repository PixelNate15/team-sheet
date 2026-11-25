import { feedbackToGive } from '../feedback';
import type { MyResult } from '../types';

const row = (o: Partial<MyResult>): MyResult =>
  ({ match_id: 1, fixture_id: 1, fixture_date: '2026-11-01', rubber_number: 1, partner_id: 'p', feedback_given: false, ...o }) as MyResult;

describe('feedbackToGive', () => {
  it('lists a partner once per fixture, using the earliest rubber', () => {
    const out = feedbackToGive([row({ match_id: 3, rubber_number: 3 }), row({ match_id: 1, rubber_number: 1 })]);
    expect(out.map((r) => r.match_id)).toEqual([1]);
  });

  it('keeps different fixtures and different partners apart, newest first', () => {
    const out = feedbackToGive([
      row({ match_id: 1, fixture_id: 1, fixture_date: '2026-10-01' }),
      row({ match_id: 2, fixture_id: 2, fixture_date: '2026-11-01' }),
      row({ match_id: 4, fixture_id: 2, fixture_date: '2026-11-01', rubber_number: 2, partner_id: 'q' }),
    ]);
    expect(out.map((r) => r.match_id)).toEqual([2, 4, 1]);
  });

  it('leaves out partners already rated', () => {
    expect(feedbackToGive([row({ feedback_given: true }), row({ match_id: 2, rubber_number: 3, feedback_given: true })])).toEqual([]);
    expect(feedbackToGive(undefined)).toEqual([]);
  });
});
