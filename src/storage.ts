import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, DEFAULT_DATA } from './model';
const KEY = '@pure-promemoria/data-v1';
export async function loadData(): Promise<AppData> {
  try {
    const json = await AsyncStorage.getItem(KEY);
    if (!json) return DEFAULT_DATA;
    const loaded = JSON.parse(json) as Partial<AppData>;
    return {
      settings: { ...DEFAULT_DATA.settings, ...loaded.settings,
        warehouse: { ...DEFAULT_DATA.settings.warehouse, ...loaded.settings?.warehouse },
        windows: { ...DEFAULT_DATA.settings.windows, ...loaded.settings?.windows } },
      personal: Array.isArray(loaded.personal) ? loaded.personal : [],
      completed: Array.isArray(loaded.completed) ? loaded.completed : []
    };
  } catch { return DEFAULT_DATA; }
}
export async function saveData(data: AppData) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ ...data, completed: data.completed.slice(0, 500) }));
}