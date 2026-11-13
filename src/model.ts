export type StampType = 'entrata' | 'uscita';
export type Workday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WorkWindow { enabled: boolean; start: string; end: string }
export interface Settings {
  warehouse: { name: string; latitude: number | null; longitude: number | null; radius: number };
  days: Workday[];
  windows: Record<StampType, WorkWindow>;
  geoOnly: boolean;
  repeatMinutes: 5 | 10 | 15;
}
export interface PersonalReminder {
  id: string;
  title: string;
  notes: string;
  time: string;
  date: string;
  repeat: 'once' | 'daily';
  active: boolean;
}
export interface Completed {
  id: string;
  kind: StampType | 'personal';
  label: string;
  occurredAt: string;
  relatedId?: string;
}
export interface AppData {
  settings: Settings;
  personal: PersonalReminder[];
  completed: Completed[];
}
export const DEFAULT_DATA: AppData = {
  settings: {
    warehouse: { name: 'Il mio ufficio', latitude: null, longitude: null, radius: 150 },
    days: [1, 2, 3, 4, 5],
    windows: { entrata: { enabled: true, start: '07:00', end: '09:00' }, uscita: { enabled: true, start: '16:00', end: '18:00' } },
    geoOnly: true,
    repeatMinutes: 10
  },
  personal: [],
  completed: []
};
export const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
export function localDayKey(d = new Date()): string {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function validTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [h, m] = value.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60;
}
export function minutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function timeOnDay(day: Date, value: string) {
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const [h, m] = value.split(':').map(Number);
  result.setHours(h, m, 0, 0);
  return result;
}
export function isInsideWindow(window: WorkWindow, now: Date): boolean {
  const m = now.getHours() * 60 + now.getMinutes();
  const start = minutes(window.start), end = minutes(window.end);
  return start <= end ? m >= start && m <= end : m >= start || m <= end;
}
export function isCompletedToday(completed: Completed[], kind: StampType, when = new Date()) {
  return completed.some(c => c.kind === kind && localDayKey(new Date(c.occurredAt)) === localDayKey(when));
}