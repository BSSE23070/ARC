import { z } from 'zod';

// Mirrors the server's rules (backend/arc/modules/identity/schemas.py) so
// most mistakes are caught before a request is sent. The server stays the
// authority.
export const emailSchema = z.email();
export const usernameSchema = z.string().regex(/^[a-z0-9_.]{3,20}$/);
export const PASSWORD_MIN_LENGTH = 10;

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value.trim()).success;
}

export function isValidUsername(value: string): boolean {
  return usernameSchema.safeParse(value.trim().toLowerCase()).success;
}

/** Formats typed digits as "DD / MM / YYYY" while the user types. */
export function formatDob(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join(' / ');
}

/** "14 / 03 / 2002" -> "2002-03-14", or null if it isn't a real past date. */
export function parseDob(formatted: string): string | null {
  const digits = formatted.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real || year < 1900 || date.getTime() > Date.now()) return null;
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}
