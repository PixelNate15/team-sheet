import { pollPercents, tallyPoll } from '../polls';

const votes = [
  { message_id: 1, user_id: 'a', option: 0 },
  { message_id: 1, user_id: 'b', option: 1 },
  { message_id: 1, user_id: 'c', option: 1 },
  { message_id: 2, user_id: 'a', option: 0 },
  { message_id: 1, user_id: 'd', option: 7 },
];

describe('tallyPoll', () => {
  it('counts votes for one poll and finds mine', () => {
    expect(tallyPoll(1, 3, votes, 'b')).toEqual({ counts: [1, 2, 0], total: 3, mine: 1 });
  });

  it('ignores other polls and options that don’t exist', () => {
    expect(tallyPoll(2, 2, votes, 'z')).toEqual({ counts: [1, 0], total: 1, mine: null });
  });

  it('turns a tally into percentages', () => {
    expect(pollPercents(tallyPoll(1, 3, votes, 'b'))).toEqual([33, 67, 0]);
    expect(pollPercents({ counts: [0, 0], total: 0, mine: null })).toEqual([0, 0]);
  });
});
