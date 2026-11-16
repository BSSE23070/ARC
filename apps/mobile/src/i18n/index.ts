import { en } from './en';

export const strings = en;

/** Fills {placeholders} in a string: fill('Sent to {email}', { email }) */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}
