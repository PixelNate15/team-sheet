import type { Venue } from '../types';
import { venueFor } from '../venues';

const v = (id: number, name: string): Venue => ({ id, club_id: 1, name, address: `${name} address`, notes: null });
const book = [v(1, 'Oakwood TC'), v(2, 'Oakwood'), v(3, "St Mary's LTC")];

describe('venueFor', () => {
  it('matches the opponent or its lower teams, ignoring case and spacing', () => {
    expect(venueFor('oakwood  tc b', book)?.id).toBe(1);
    expect(venueFor("St Mary's LTC", book)?.id).toBe(3);
  });

  it('prefers the most specific venue', () => {
    expect(venueFor('Oakwood TC', book)?.id).toBe(1);
    expect(venueFor('Oakwood Park', book)?.id).toBe(2);
  });

  it('doesn’t match part of a word, blanks or an empty book', () => {
    expect(venueFor('Oakwoodshire', book)).toBeNull();
    expect(venueFor('', book)).toBeNull();
    expect(venueFor('Oakwood TC', undefined)).toBeNull();
  });
});
