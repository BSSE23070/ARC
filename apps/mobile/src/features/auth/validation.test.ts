import { formatSeconds } from './useCountdown';
import { formatDob, isValidEmail, isValidUsername, parseDob } from './validation';

describe('date of birth field', () => {
  it('adds separators while typing', () => {
    expect(formatDob('1')).toBe('1');
    expect(formatDob('140')).toBe('14 / 0');
    expect(formatDob('14032002')).toBe('14 / 03 / 2002');
    expect(formatDob('14/03/2002 extra 99')).toBe('14 / 03 / 2002');
  });

  it('turns a complete date into ISO format', () => {
    expect(parseDob('14 / 03 / 2002')).toBe('2002-03-14');
    expect(parseDob('29 / 02 / 2004')).toBe('2004-02-29'); // leap day
  });

  it('rejects dates that are incomplete, impossible or in the future', () => {
    expect(parseDob('14 / 03')).toBeNull();
    expect(parseDob('31 / 02 / 2002')).toBeNull();
    expect(parseDob('29 / 02 / 2003')).toBeNull();
    expect(parseDob('01 / 13 / 2002')).toBeNull();
    expect(parseDob('01 / 01 / 1850')).toBeNull();
    expect(parseDob('01 / 01 / 2999')).toBeNull();
  });
});

describe('sign-up field rules (mirroring the server)', () => {
  it('validates emails', () => {
    expect(isValidEmail('maryam@itu.edu.pk')).toBe(true);
    expect(isValidEmail('  maryam@itu.edu.pk ')).toBe(true);
    expect(isValidEmail('maryam@')).toBe(false);
    expect(isValidEmail('not an email')).toBe(false);
  });

  it('validates usernames', () => {
    expect(isValidUsername('maryam_t')).toBe(true);
    expect(isValidUsername('Maryam.T')).toBe(true); // lower-cased before sending
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('no spaces')).toBe(false);
    expect(isValidUsername('x'.repeat(21))).toBe(false);
  });
});

test('countdown is shown as m:ss', () => {
  expect(formatSeconds(24)).toBe('0:24');
  expect(formatSeconds(75)).toBe('1:15');
  expect(formatSeconds(0)).toBe('0:00');
});
