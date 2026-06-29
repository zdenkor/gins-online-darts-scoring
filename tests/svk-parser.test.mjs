// Tests for SVK list parser. No IDB required — pure function.
import { parseSVKListText, splitSlovakName } from '../js/auth/svk.js';

let passed = 0, failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { passed++; console.log(`  ok ${name}`); }
  else {
    failed++;
    console.log(`  FAIL ${name}\n    got:  ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`);
  }
}

console.log('--- parseSVKListText: tab-separated with header ---');
const tsv = [
  'SVK ID\tSetDarts ID\tPriezvisko Meno\tMesto\tMaterský Klub',
  'SVK003107\t06814\tObonya Adam\tČaradice\tDarts Club Topoľčianky',
  'SVK002516\t01571\tBlaško Adam\tNITRA\tDart Club Nitra',
  'SVK003112\t02337\tRemeň Zdenko\tKrnča\tDart Club Nitra',
].join('\n');
const rows = parseSVKListText(tsv);
eq('parses 3 rows', rows.length, 3);
eq('first svkId', rows[0]?.svkId, 'SVK003107');
eq('first setDartsId', rows[0]?.setDartsId, '06814');
eq('first name preserved', rows[0]?.name, 'Obonya Adam');
eq('first split surname', rows[0]?.surname, 'Obonya');
eq('first split firstName', rows[0]?.firstName, 'Adam');
eq('first town', rows[0]?.town, 'Čaradice');
eq('first club', rows[0]?.club, 'Darts Club Topoľčianky');
eq('Remeň split', rows[2]?.surname, 'Remeň');
eq('Remeň firstName', rows[2]?.firstName, 'Zdenko');

console.log('--- parseSVKListText: no header (just rows) ---');
const noHdr = 'SVK999999\t00001\tTest Player\tTestTown\tTestClub';
const rows2 = parseSVKListText(noHdr);
eq('parses single row', rows2.length, 1);
eq('single row svkId', rows2[0]?.svkId, 'SVK999999');

console.log('--- parseSVKListText: bad rows skipped ---');
const mixed = [
  'SVK888888\t00001\tReal Player\tTown\tClub',
  'not svk\t12345\tNo ID here\t-\t-',
  'SVK 000001\tinvalid\tspaces in svk\t-\t-', // not valid format
  'SVK000111\t99999\tAnother Player\tT2\tC2',
].join('\n');
const rows3 = parseSVKListText(mixed);
eq('only valid rows', rows3.length, 2);

console.log('--- parseSVKListText: empty / null ---');
eq('empty string', parseSVKListText(''), []);
eq('null', parseSVKListText(null), []);

console.log('--- parseSVKListText: multi-space separator (HTML table) ---');
const multiSpace = 'SVK003107   06814   Obonya Adam   Čaradice   Darts Club Topoľčianky';
const rows4 = parseSVKListText(multiSpace);
eq('parses multi-space', rows4.length, 1);
eq('ms svkId', rows4[0]?.svkId, 'SVK003107');

console.log('--- splitSlovakName: middle initials ---');
eq('plain', splitSlovakName('Novák Ján'), { surname: 'Novák', firstName: 'Ján' });
eq('with ml.', splitSlovakName('Novák Ján ml.'), { surname: 'Novák', firstName: 'Ján' });
eq('with St.', splitSlovakName('Novák Ján St.'), { surname: 'Novák', firstName: 'Ján' });
eq('three words no middle', splitSlovakName('Van Der Berg Jan'),
   { surname: 'Van', firstName: 'Der Berg Jan' });
eq('one word', splitSlovakName('Cher'), { surname: 'Cher', firstName: '' });
eq('empty', splitSlovakName(''), { surname: '', firstName: '' });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);