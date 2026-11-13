import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Settings } from './model';
import { refreshFromStorage, clearStampNotifications } from './notifications';

export const GEOFENCE_TASK = 'pure-warehouse-geofence-v1';
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const event = (data as { eventType: Location.GeofencingEventType }).eventType;
  try {
    if (event === Location.GeofencingEventType.Enter) await refreshFromStorage(true);
    else if (event === Location.GeofencingEventType.Exit) await clearStampNotifications();
  } catch (e) { console.warn('Geofence non disponibile:', e); }
});

export function hasWarehouse(s: Settings) {
  return Number.isFinite(s.warehouse.latitude) && Number.isFinite(s.warehouse.longitude)
    && s.warehouse.latitude !== null && s.warehouse.longitude !== null;
}
export async function requestLocationPermissions(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted;
}
export async function applyGeofence(s: Settings): Promise<boolean> {
  const wasStarted = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (!s.geoOnly || !hasWarehouse(s)) {
    if (wasStarted) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return !s.geoOnly;
  }
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!fg.granted || !bg.granted) {
    if (wasStarted) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return false;
  }
  await Location.startGeofencingAsync(GEOFENCE_TASK, [{
    identifier: 'magazzino', latitude: s.warehouse.latitude!, longitude: s.warehouse.longitude!,
    radius: s.warehouse.radius, notifyOnEnter: true, notifyOnExit: true
  }]);
  return true;
}
export async function currentWarehouseProximity(s: Settings): Promise<boolean | null> {
  if (!hasWarehouse(s)) return null;
  const permissions = await Location.getForegroundPermissionsAsync();
  if (!permissions.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const toRadians = (x: number) => x * Math.PI / 180;
  const dLat = toRadians(s.warehouse.latitude! - pos.coords.latitude);
  const dLon = toRadians(s.warehouse.longitude! - pos.coords.longitude);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRadians(pos.coords.latitude))
    * Math.cos(toRadians(s.warehouse.latitude!)) * Math.sin(dLon/2)**2;
  const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return dist <= s.warehouse.radius;
}
export async function captureWarehousePosition(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Autorizza la posizione nelle impostazioni del telefono.');
  const point = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: point.coords.latitude, longitude: point.coords.longitude };
}