/* Display helpers shared by admin pages and the customer portal. */

const DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

export function formatDate(iso?: string | null, timeZone = 'UTC'): string {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('en-GB', { ...DATE, timeZone }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
}

export function formatTime(iso?: string | null, timeZone = 'UTC'): string {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('en-GB', { ...TIME, timeZone }).format(new Date(iso)); } catch { return iso.slice(11, 16); }
}

export function formatDateTime(iso?: string | null, timeZone = 'UTC'): string {
  if (!iso) return '';
  return `${formatDate(iso, timeZone)} · ${formatTime(iso, timeZone)}`;
}

/** "3 h ago", "2 d ago", "in 4 h". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const value = minutes < 60 ? `${Math.max(1, minutes)} min` : hours < 48 ? `${hours} h` : `${days} d`;
  return diff < 0 ? `${value} ago` : `in ${value}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
}

export function formatMoney(amount: number, currency = 'AED'): string {
  return `${currency} ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

export function formatKg(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return `${value.toLocaleString('en-GB')} kg`;
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, character => character.toUpperCase());
}

/** For <input type="datetime-local"> values (UTC). */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

export function fromLocalInput(value: string): string {
  if (!value) return '';
  return value.length === 16 ? `${value}:00.000Z` : new Date(value).toISOString();
}

export function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** CSV export of plain rows; opens the browser's download. */
export function downloadCsv(fileName: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const content = [header, ...rows].map(row => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** SHA-256 of a file, computed in the browser for the document register. */
export async function fileChecksum(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
