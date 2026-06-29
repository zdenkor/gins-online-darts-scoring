// Unit tests for the player parser. No IDB required — pure functions.
import {
  parseLine, normalizeRegNumber, parseRegNumber, formatPlayerName,
  filterByClub,
} from '../js/db/players.js';

// nextRegNumberForClub and highestSerialForClub need IDB stub.
// Could be tested via fake-indexeddb in a follow-up. The pure
// functions below cover the parser/format helpers thoroughly.

let passed = 0, failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ok ${name}`); }
  else {
    failed++;
    console.log(`  FAIL ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
  }
}

console.log('--- normalizeRegNumber ---');
eq('lowercased',          normalizeRegNumber('nr#100298'),     'NR#100298');
eq('trimmed whitespace',  normalizeRegNumber('  NR#100298  '), 'NR#100298');
eq('lowercase letters',   normalizeRegNumber('nr#100298'),     'NR#100298');
eq('long club code',      normalizeRegNumber('nrzal#000123'),  'NRZAL#000123');
eq('accepts no separator',normalizeRegNumber('NR100298'),      'NR100298');
eq('accepts dot sep',     normalizeRegNumber('NR.100298'),     'NR.100298');
eq('accepts dash sep',    normalizeRegNumber('NR-100298'),     'NR-100298');
eq('accepts SVK format',  normalizeRegNumber('SVK003112'),     'SVK003112');
eq('rejects short num',   normalizeRegNumber('NR#12345'),      null);
eq('rejects letters num', normalizeRegNumber('NR#10029A'),     null);
eq('rejects empty',       normalizeRegNumber(''),              null);
eq('rejects null',        normalizeRegNumber(null),            null);

console.log('--- parseRegNumber ---');
eq('parses well-formed', parseRegNumber('NR#100298'),
   { clubCode: 'NR', separator: '#', serial: '100298', full: 'NR#100298' });
eq('parses long code',   parseRegNumber('NRZAL#000123'),
   { clubCode: 'NRZAL', separator: '#', serial: '000123', full: 'NRZAL#000123' });
eq('parses no separator',parseRegNumber('NR100298'),
   { clubCode: 'NR', separator: '', serial: '100298', full: 'NR100298' });
eq('parses dot sep',     parseRegNumber('NR.100298'),
   { clubCode: 'NR', separator: '.', serial: '100298', full: 'NR.100298' });
eq('parses SVK',         parseRegNumber('SVK003112'),
   { clubCode: 'SVK', separator: '', serial: '003112', full: 'SVK003112' });
eq('rejects bad',        parseRegNumber('nope'), null);

console.log('--- parseLine: comma-separated ---');
eq('full line', parseLine('Slovák, Ján, ml., Bratislava, DC Bratislava, NR#100298'),
   { surname: 'Slovák', firstName: 'Ján', middleName: 'ml.', nameSuffixes: '',
     town: 'Bratislava', club: 'DC Bratislava', regNumber: 'NR#100298' });
eq('partial line', parseLine('Novák, Ján'),
   { surname: 'Novák', firstName: 'Ján', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: '' });

console.log('--- parseLine: SVK format ---');
eq('SVK ID at end', parseLine('Remeň Zdenko SVK003112'),
   { surname: 'Remeň', firstName: 'Zdenko', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'SVK003112' });
eq('SVK ID lowercase', parseLine('remeň zdenko svk003112'),
   { surname: 'remeň', firstName: 'zdenko', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'SVK003112' });
eq('SVK ID with SetDarts ignored',
   parseLine('02337 Remeň Zdenko SVK003112'),
   { surname: 'Remeň', firstName: 'Zdenko', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'SVK003112' });
eq('SVK only', parseLine('SVK999999'),
   { surname: '', firstName: '', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'SVK999999' });
eq('CLUB# takes precedence over SVK', parseLine('Remeň Zdenko NR#100298 SVK003112'),
   { surname: 'Remeň', firstName: 'Zdenko', middleName: 'SVK003112', nameSuffixes: '',
     town: '', club: '', regNumber: 'NR#100298' });

console.log('--- parseLine: whitespace-separated ---');
eq('whitespace full', parseLine('Novák Ján NR#100299'),
   { surname: 'Novák', firstName: 'Ján', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'NR#100299' });
eq('whitespace long', parseLine('Mrkvičková Jana BA#200145'),
   { surname: 'Mrkvičková', firstName: 'Jana', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'BA#200145' });

console.log('--- parseLine: reg-only ---');
eq('just reg', parseLine('NR#999999'),
   { surname: '', firstName: '', middleName: '', nameSuffixes: '',
     town: '', club: '', regNumber: 'NR#999999' });

console.log('--- parseLine: empty ---');
eq('empty string',  parseLine(''),    { surname: '', firstName: '', middleName: '', nameSuffixes: '', town: '', club: '', regNumber: '' });
eq('whitespace',    parseLine('   '), { surname: '', firstName: '', middleName: '', nameSuffixes: '', town: '', club: '', regNumber: '' });
eq('null',          parseLine(null),  { surname: '', firstName: '', middleName: '', nameSuffixes: '', town: '', club: '', regNumber: '' });

console.log('--- formatPlayerName ---');
eq('full',  formatPlayerName({ surname: 'Novák', firstName: 'Ján', middleName: 'ml.', nameSuffixes: '' }),
                'Novák, Ján ml.');
eq('no mid', formatPlayerName({ surname: 'Novák', firstName: 'Ján' }), 'Novák, Ján');
eq('surname only', formatPlayerName({ surname: 'Novák' }), 'Novák');
eq('empty',        formatPlayerName({}), 'Player #?');

console.log('--- filterByClub ---');
const sample = [
  { surname: 'A', club: 'Nitra' },
  { surname: 'B', club: 'Nitra' },
  { surname: 'C', club: 'Bratislava' },
  { surname: 'D', club: '' },
];
eq('empty filter returns all', (await filterByClub(sample, '')).length, 4);
eq('exact match', (await filterByClub(sample, 'Nitra')).length, 2);
eq('case-insensitive', (await filterByClub(sample, 'nitra')).length, 2);
eq('whitespace-tolerant', (await filterByClub(sample, '  Bratislava  ')).length, 1);
eq('no match', (await filterByClub(sample, 'Kosice')).length, 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);