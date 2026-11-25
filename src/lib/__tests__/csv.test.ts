import { parsePlayerCsv, splitCsv } from '../csv';

describe('splitCsv', () => {
  it('handles quotes, escaped quotes, CRLF and blank lines', () => {
    expect(splitCsv('a,"b, c","say ""hi"""\r\n\r\nd,e,f\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });

  it('detects semicolon and tab separators', () => {
    expect(splitCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(splitCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parsePlayerCsv', () => {
  it('reads a header row in any order', () => {
    const rows = parsePlayerCsv('Email,Surname,First Name,Team\nTOM@x.com,Reid,Tom,2nd Team');
    expect(rows).toEqual([{ line: 2, first_name: 'Tom', surname: 'Reid', email: 'tom@x.com', team: '2nd Team', problem: null }]);
  });

  it('splits a single Name column', () => {
    const [r] = parsePlayerCsv('Name,E-mail\nMary Ann Smith,mary@x.com');
    expect([r.first_name, r.surname]).toEqual(['Mary Ann', 'Smith']);
  });

  it('falls back to first, surname, email, team without a header', () => {
    const [r] = parsePlayerCsv('Sam,Okafor,sam@x.com');
    expect(r).toMatchObject({ line: 1, first_name: 'Sam', surname: 'Okafor', email: 'sam@x.com', team: '' });
  });

  it('flags bad and duplicate emails', () => {
    const rows = parsePlayerCsv('first name,surname,email\nA,B,not-an-email\nC,D,\nE,F,e@x.com\nG,H,E@x.com');
    expect(rows.map((r) => r.problem)).toEqual([
      'Email address doesn’t look right',
      'No email address',
      null,
      'Listed twice',
    ]);
  });

  it('ignores a spreadsheet byte-order mark', () => {
    expect(parsePlayerCsv('\uFEFFemail,first name\nx@y.com,Xi')[0].first_name).toBe('Xi');
  });
});
