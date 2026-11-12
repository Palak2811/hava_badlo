import type { Cost } from '../engine/types';

export const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
export const num = (n: number, d = 0) => n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
export const signed = (n: number, d = 0) => `${n >= 0 ? '+' : ''}${num(n, d)}`;

export function costText(c: Cost) {
  const parts: string[] = [];
  if (c.budget) parts.push(inr(c.budget));
  if (c.rp) parts.push(`${c.rp} RP`);
  if (c.capital) parts.push(`${c.capital} 🏛️`);
  if (c.cac) parts.push(`${c.cac} 🍃`);
  return parts.join(' · ') || 'Free';
}
