/*
 * ISO 6346 container numbers: four letters (owner code + category identifier U/J/Z),
 * six digits and a check digit. Used to validate every number typed into the gate,
 * registration and enquiry screens, and to generate valid seed numbers.
 */

const LETTER_VALUES: Record<string, number> = {};
// A=10, B=12, … skipping multiples of 11 (K=21 becomes 22, etc.).
let value = 10;
for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
  if (value % 11 === 0) value += 1;
  LETTER_VALUES[letter] = value;
  value += 1;
}

export function normaliseContainerNumber(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function checkDigit(first10: string): number {
  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const character = first10[index];
    const characterValue = index < 4 ? LETTER_VALUES[character] : Number(character);
    sum += characterValue * 2 ** index;
  }
  return (sum % 11) % 10;
}

/** Returns null when valid, or a human-readable problem. */
export function validateContainerNumber(input: string): string | null {
  const number = normaliseContainerNumber(input);
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(number)) return 'Container numbers have four letters (ending in U, J or Z) followed by seven digits.';
  const expected = checkDigit(number.slice(0, 10));
  if (expected !== Number(number[10])) return `Check digit is wrong: ${number.slice(0, 10)} should end in ${expected}.`;
  return null;
}

export function makeContainerNumber(owner: string, serial: number): string {
  const first10 = `${owner.toUpperCase().slice(0, 4)}${String(serial).padStart(6, '0')}`;
  return `${first10}${checkDigit(first10)}`;
}

/** Display with the conventional space: MSKU 884210 7 */
export function formatContainerNumber(number: string): string {
  const n = normaliseContainerNumber(number);
  if (n.length !== 11) return number;
  return `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}`;
}
