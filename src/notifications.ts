import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AppData, Settings, StampType, localDayKey, timeOnDay, isCompletedToday } from './model';
import { loadData } from './storage';

const CHANNEL_STAMP = 'timbratura-v1';
const CHANNEL_PERSONAL = 'promemoria-v1';
const SOUND = 'alert.wav';
Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false
}) });

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_STAMP, {
      name: 'Timbratura aziendale', importance: Notifications.AndroidImportance.MAX,
      sound: SOUND, vibrationPattern: [0, 500, 250, 500, 250, 500]
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_PERSONAL, {
      name: 'Promemoria personalizzati', importance: Notifications.AndroidImportance.HIGH,
      sound: 'default'
    });
  }
  await Notifications.setNotificationCategoryAsync('STAMP', [{
    identifier: 'STAMP_DONE', buttonTitle: 'Ho timbrato', options: { opensAppToForeground: true }
  }]);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function cancelCategory(kind: 'stamp' | 'personal') {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const req of pending) {
    if (req.content.data?.kind === kind) await Notifications.cancelScheduledNotificationAsync(req.identifier);
  }
}
export async function clearStampNotifications() { await cancelCategory('stamp'); }

// Al massimo 36 ore di promemoria condizionati alla posizione, per rispettare
// i limiti del sistema. Un nuovo ingresso/rientro nell'app rinnova il programma.
export async function refreshStampNotifications(data: AppData, inside: boolean, now = new Date()) {
  await clearStampNotifications();
  const s = data.settings;
  if (s.geoOnly && !inside) return;
  const until = new Date(now.getTime() + 36 * 60 * 60_000);
  let count = 0;
  for (let offset = -1; offset <= 2; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!s.days.includes(day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6)) continue;
    for (const kind of ['entrata', 'uscita'] as StampType[]) {
      const w = s.windows[kind];
      if (!w.enabled) continue;
      const start = timeOnDay(day, w.start);
      const end = timeOnDay(day, w.end);
      if (end <= start) end.setDate(end.getDate() + 1);
      if (data.completed.some(c => c.kind === kind && localDayKey(new Date(c.occurredAt)) === localDayKey(day))) continue;
      const step = s.repeatMinutes * 60_000;
      for (let at = start.getTime(); at <= end.getTime(); at += step) {
        const moment = new Date(at);
        if (moment <= now || moment > until || count >= 48) continue;
        await Notifications.scheduleNotificationAsync({
          content: {
            title: kind === 'entrata' ? '🔔 Ricordati di timbrare ENTRATA' : '🔔 Ricordati di timbrare USCITA',
            body: `Se non hai ancora timbrato, apri Pure Promemoria e conferma. ${s.warehouse.name}.`,
            sound: SOUND, categoryIdentifier: 'STAMP',
            data: { kind: 'stamp', stampType: kind, dateKey: localDayKey(day) }
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: moment, channelId: CHANNEL_STAMP }
        });
        count++;
      }
    }
  }
}

export async function refreshPersonalNotifications(data: AppData) {
  await cancelCategory('personal');
  const now = new Date();
  for (const reminder of data.personal.filter(p => p.active)) {
    const [hour, minute] = reminder.time.split(':').map(Number);
    const trigger = reminder.repeat === 'daily'
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY as const, hour, minute, channelId: CHANNEL_PERSONAL }
      : { type: Notifications.SchedulableTriggerInputTypes.DATE as const,
          date: timeOnDay(new Date(`${reminder.date}T12:00:00`), reminder.time), channelId: CHANNEL_PERSONAL };
    if (reminder.repeat === 'once' && trigger.type === Notifications.SchedulableTriggerInputTypes.DATE && trigger.date <= now) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.notes || 'È il momento del tuo promemoria.',
        sound: 'default', data: { kind: 'personal', reminderId: reminder.id } },
      trigger
    });
  }
}

export async function testSound() {
  await Notifications.scheduleNotificationAsync({
    content: { title: '🔔 Prova promemoria', body: 'Questo è il suono dei promemoria di timbratura.', sound: SOUND },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, channelId: CHANNEL_STAMP }
  });
}
export async function refreshFromStorage(inside: boolean) {
  const data = await loadData();
  await refreshStampNotifications(data, inside);
}