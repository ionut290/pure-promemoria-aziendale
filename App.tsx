import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, AppState, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View, useWindowDimensions
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { AppData, Completed, DAY_NAMES, DEFAULT_DATA, PersonalReminder, Settings, StampType,
  isCompletedToday, isInsideWindow, localDayKey, validTime } from './src/model';
import { loadData, saveData } from './src/storage';
import { applyGeofence, captureWarehousePosition, currentWarehouseProximity, hasWarehouse,
  requestLocationPermissions } from './src/geofence';
import { refreshPersonalNotifications, refreshStampNotifications, setupNotifications, testSound } from './src/notifications';

type Tab = 'home' | 'others' | 'history' | 'settings';
const C = { bg: '#F5F8F9', white: '#FFFFFF', ink: '#17303A', muted: '#71858C',
  teal: '#087C72', dark: '#085D59', pale: '#E5F5F1', blue: '#3C6A8B', line: '#E5EEF0',
  orange: '#F5AB50', orangeBg: '#FFF3E0', red: '#CA5554' };
const firstCapital = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const humanStamp = (t: StampType) => t === 'entrata' ? 'Entrata' : 'Uscita';
const dateLabel = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
function Title({ children, secondary }: { children: React.ReactNode; secondary?: boolean }) {
  return <Text style={secondary ? styles.sectionSub : styles.sectionTitle}>{children}</Text>;
}
function Btn({ text, onPress, secondary = false, danger = false, disabled = false }: {
  text: string; onPress: () => void; secondary?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
    style={[styles.button, secondary && styles.buttonSecondary, danger && { backgroundColor: C.red }, disabled && { opacity: 0.45 }] }>
    <Text style={[styles.buttonText, secondary && { color: C.teal }]}>{text}</Text>
  </TouchableOpacity>;
}
function Field({ label, value, change, placeholder, numeric = false }: {
  label: string; value: string; change: (s: string) => void; placeholder?: string; numeric?: boolean;
}) {
  return <View style={{ flex: 1, minWidth: 90 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput style={styles.field} value={value} onChangeText={change} placeholder={placeholder}
      placeholderTextColor="#9AABB0" autoCorrect={false} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'} />
  </View>;
}
function CalendarCard() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const monthName = firstCapital(today.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
  const cells = Array.from({ length: offset + days }, (_, index) => index < offset ? null : index - offset + 1);
  while (cells.length % 7) cells.push(null);
  return <Panel style={styles.calendarCard}>
    <View style={styles.cardHeaderRow}>
      <View style={styles.cardTitleRow}><View style={styles.cardTitleIcon}><Text style={styles.cardTitleIconText}>▦</Text></View><Text style={styles.cardTitle}>Calendario</Text></View>
      <TouchableOpacity style={styles.todayButton}><Text style={styles.todayButtonText}>Oggi</Text></TouchableOpacity>
    </View>
    <View style={styles.calendarNav}><Text style={styles.calendarArrow}>‹</Text><Text style={styles.calendarMonth}>{monthName}</Text><Text style={styles.calendarArrow}>›</Text></View>
    <View style={styles.weekRow}>{['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(day => <Text key={day} style={styles.weekText}>{day}</Text>)}</View>
    <View style={styles.calendarGrid}>{cells.map((day, index) => <View key={index} style={[styles.calendarCell, day === today.getDate() && styles.calendarCellToday]}><Text style={[styles.calendarDayText, day === today.getDate() && styles.calendarDayTextToday]}>{day ?? ''}</Text>{day === today.getDate() && <View style={styles.calendarDot}/>}</View>)}</View>
    <View style={styles.calendarLegend}><Text style={styles.legendGreen}>● Promemoria</Text><Text style={styles.legendOrange}>● Priorità alta</Text></View>
  </Panel>;
}

function Header({ tab, onMenu }: { tab: Tab; onMenu: () => void }) {
  const names: Record<Tab, string> = { home: 'Oggi', others: 'Promemoria', history: 'Registro', settings: 'Impostazioni' };
  const today = firstCapital(new Intl.DateTimeFormat('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date()));
  return <View style={styles.header}>
    <View style={styles.brandMark}><Text style={{ fontSize: 24, color: C.white }}>◉</Text></View>
    <View style={{ flex: 1 }}><Text style={styles.brand}>PURE</Text><Text style={styles.brandSub}>PROMEMORIA AZIENDALE</Text></View>
    {tab === 'home' && <View style={styles.headerDate}><Text style={styles.headerDateText}>▣  {today}</Text></View>}
    <TouchableOpacity onPress={onMenu} accessibilityLabel="Apri menu" style={styles.menuButton}>
      <Text style={styles.menuButtonText}>☰</Text>
    </TouchableOpacity>
  </View>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [data, setData] = useState<AppData>(DEFAULT_DATA);
  const current = useRef<AppData>(DEFAULT_DATA);
  const [ready, setReady] = useState(false);
  const [inside, setInside] = useState<boolean | null>(null);
  const [status, setStatus] = useState('Imposta la posizione dell'ufficio');
  const [draft, setDraft] = useState<Settings>(DEFAULT_DATA.settings);
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [extraOpen, setExtraOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newTime, setNewTime] = useState('09:00');
  const [newDate, setNewDate] = useState(localDayKey());
  const [newRepeat, setNewRepeat] = useState<'once'|'daily'>('once');

  const replace = useCallback(async (next: AppData) => {
    current.current = next;
    setData(next);
    await saveData(next);
  }, []);

  const refreshGeo = useCallback(async (dataset: AppData = current.current) => {
    if (!dataset.settings.geoOnly) {
      setInside(null);
      setStatus('Modalità solo orario');
      await refreshStampNotifications(dataset, true);
      return;
    }
    if (!hasWarehouse(dataset.settings)) {
      setInside(null);
      setStatus('Posizione da impostare');
      await refreshStampNotifications(dataset, false);
      return;
    }
    try {
      const backgroundPermission = await Location.getBackgroundPermissionsAsync();
      if (!backgroundPermission.granted) {
        setInside(null);
        setStatus('Autorizza la posizione “Sempre” per gli avvisi GPS');
        await refreshStampNotifications(dataset, false);
        return;
      }
      const found = await currentWarehouseProximity(dataset.settings);
      setInside(found);
      setStatus(found === null ? 'Autorizzazione GPS necessaria' : found ? 'Sei vicino all'ufficio' : 'Sei fuori dall'ufficio');
      await refreshStampNotifications(dataset, found === true);
    } catch {
      setStatus('Posizione temporaneamente non disponibile');
      setInside(null);
      await refreshStampNotifications(dataset, false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = await loadData();
      if (!mounted) return;
      current.current = saved;
      setData(saved);
      setDraft(saved.settings);
      setLatText(saved.settings.warehouse.latitude?.toString() ?? '');
      setLonText(saved.settings.warehouse.longitude?.toString() ?? '');
      try {
        await setupNotifications();
        await applyGeofence(saved.settings);
        await refreshPersonalNotifications(saved);
        await refreshGeo(saved);
      } catch (e) { console.warn('Inizializzazione notifiche:', e); }
      if (mounted) setReady(true);
    })();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && mounted) void refreshGeo().catch(console.warn);    });
    const answer = Notifications.addNotificationResponseReceivedListener(response => {
      if (response.actionIdentifier === 'STAMP_DONE') {
        const kind = response.notification.request.content.data?.stampType;
        const eventDate = response.notification.request.content.data?.dateKey;
        if ((kind === 'entrata' || kind === 'uscita') && eventDate === localDayKey()) {
          void markStamp(kind);
        }
      } else { setTab('home'); }
    });
    return () => { mounted = false; sub.remove(); answer.remove(); };
  }, [refreshGeo]);

  async function markStamp(kind: StampType) {
    const prev = current.current;
    if (isCompletedToday(prev.completed, kind)) return;
    const completed: Completed = { id: newId(), kind, label: `Timbratura ${kind} confermata`, occurredAt: new Date().toISOString() };
    const next = { ...prev, completed: [completed, ...prev.completed] };
    await replace(next);
    await refreshGeo(next);
    Alert.alert('Confermato', 'Promemoria disattivato per oggi. La timbratura effettiva va fatta con il sistema aziendale.');
  }

  async function saveSettings() {
    const parseCoord = (s: string) => s.trim() === '' ? null : Number(s.trim().replace(',', '.'));
    const latitude = parseCoord(latText), longitude = parseCoord(lonText);
    if ((latText.trim() && !Number.isFinite(latitude)) || (lonText.trim() && !Number.isFinite(longitude))) {
      Alert.alert('Coordinate GPS non valide', 'Inserisci numeri come 44.5000 e 11.3500.'); return;
    }
    const updatedSettings: Settings = { ...draft, warehouse: { ...draft.warehouse, latitude, longitude } };
    const wh = updatedSettings.warehouse;
    for (const kind of ['entrata','uscita'] as StampType[]) {
      const { start, end } = draft.windows[kind];
      if (!validTime(start) || !validTime(end) || start === end) {
        Alert.alert('Orario non valido', `Controlla la fascia ${kind} (esempio 07:00 e 09:00).`); return;
      }
    }
    if (draft.days.length === 0) { Alert.alert('Seleziona almeno un giorno di lavoro'); return; }
    if (wh.radius < 100 || wh.radius > 2000) { Alert.alert('Raggio non valido', 'Scegli un raggio tra 100 e 2000 metri.'); return; }
    if (updatedSettings.geoOnly && !hasWarehouse(updatedSettings)) { Alert.alert('Manca l'ufficio', 'Premi “Usa la mia posizione” oppure inserisci coordinate GPS.'); return; }
    if ((wh.latitude !== null && (wh.latitude < -90 || wh.latitude > 90)) ||
        (wh.longitude !== null && (wh.longitude < -180 || wh.longitude > 180))) {
      Alert.alert('Coordinate non valide'); return;
    }
    const next = { ...current.current, settings: updatedSettings };
    try {
      await replace(next);
      setDraft(updatedSettings);
      const active = await applyGeofence(updatedSettings);
      await refreshGeo(next);
      if (updatedSettings.geoOnly && !active) {
        Alert.alert('Impostazioni salvate', 'Per attivare il promemoria GPS in background, concedi la localizzazione “Sempre” dal pulsante qui sotto.');
      } else { Alert.alert('Salvato', 'Impostazioni aggiornate.'); }
    } catch (e) { Alert.alert('Errore', String(e)); }
  }

  async function permitGPS() {
    try {
      const granted = await requestLocationPermissions();
      if (!granted) { Alert.alert('Permesso non concesso', 'Apri Impostazioni del telefono → Pure Promemoria → Posizione e attiva “Sempre”.'); return; }
      await applyGeofence(draft);
      await refreshGeo({ ...current.current, settings: draft });
      Alert.alert('GPS autorizzato', 'Il controllo dell'ufficio è stato configurato sul dispositivo.');
    } catch (e) { Alert.alert('Impossibile attivare il GPS', String(e)); }
  }

  async function setWarehouseHere() {
    try {
      const coords = await captureWarehousePosition();
      setDraft(s => ({ ...s, warehouse: { ...s.warehouse, ...coords } }));
      setLatText(String(coords.latitude));
      setLonText(String(coords.longitude));
      Alert.alert('Posizione acquisita', 'Coordinate inserite. Premi “Salva impostazioni” per attivarle.');
    } catch (e) { Alert.alert('Posizione non acquisita', String(e)); }
  }

  async function addPersonal() {
    if (!newTitle.trim() || !validTime(newTime)) { Alert.alert('Inserisci titolo e orario valido'); return; }
    const d = new Date(`${newDate}T${newTime}:00`);
    if (newRepeat === 'once' && (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !Number.isFinite(d.getTime()) || d <= new Date() || localDayKey(d) !== newDate)) {
      Alert.alert('Data non valida', 'Inserisci una data futura nel formato AAAA-MM-GG.'); return;
    }
    const item: PersonalReminder = { id: newId(), title: newTitle.trim(), notes: newNotes.trim(), date: newDate,
      time: newTime, repeat: newRepeat, active: true };
    const next = { ...current.current, personal: [item, ...current.current.personal] };
    try { await replace(next); await refreshPersonalNotifications(next); setExtraOpen(false); setNewTitle(''); setNewNotes('');
      Alert.alert('Promemoria creato', 'Riceverai una notifica all’orario impostato.'); }
    catch (e) { Alert.alert('Errore notifiche', String(e)); }
  }

  async function changePersonal(id: string, remove = false) {
    const prev = current.current;
    const personal = remove ? prev.personal.filter(p => p.id !== id) :
      prev.personal.map(p => p.id === id ? { ...p, active: !p.active } : p);
    const next = { ...prev, personal };
    await replace(next); await refreshPersonalNotifications(next);
  }

  const s = data.settings;
  const remaining = data.personal.filter(p => p.active).length;
  const bothDone = (['entrata','uscita'] as StampType[]).filter(kind => isCompletedToday(data.completed,kind)).length;
  const settingsWarehouse = draft.warehouse;
  const { width } = useWindowDimensions();
  const wideDashboard = width >= 900;
  const todayPersonal = data.personal.filter(p => p.active && (p.repeat === 'daily' || p.date === localDayKey()));
  const todayTotal = todayPersonal.length + (s.windows.entrata.enabled ? 1 : 0) + (s.windows.uscita.enabled ? 1 : 0);
  const completedToday = bothDone + data.personal.filter(p => !p.active && (p.repeat === 'daily' || p.date === localDayKey())).length;

  const upcomingPanel = <Panel style={styles.upcomingFocus}>
    <View style={styles.cardHeaderRow}>
      <View style={styles.cardTitleRow}><Text style={styles.upcomingIcon}>▱</Text><Text style={styles.cardTitle}>Prossimi promemoria</Text></View>
      <TouchableOpacity onPress={() => setTab('others')}><Text style={styles.link}>Vedi tutti ›</Text></TouchableOpacity>
    </View>
    {data.personal.filter(p => p.active && p.date > localDayKey()).slice(0, 4).map(item =>
      <View key={item.id} style={styles.upcomingRow}>
        <View style={styles.upcomingDateBadge}><Text style={styles.upcomingDateDay}>{item.date.slice(8, 10)}</Text><Text style={styles.upcomingDateMonth}>{item.date.slice(5, 7)}</Text></View>
        <View style={{ flex: 1 }}><Text style={styles.upcomingTitle}>{item.title}</Text><Text style={styles.muted}>◷ {item.time}</Text></View>
        <Text style={styles.priorityNormal}>Normale</Text>
      </View>
    )}
    {!data.personal.some(p => p.active && p.date > localDayKey()) && <Text style={styles.emptyFocus}>Nessun altro promemoria programmato.</Text>}
  </Panel>;

  return <SafeAreaProvider>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top','bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <Header tab={tab} onMenu={() => setMenuOpen(true)}/>
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuPanel}>
            <View style={styles.menuPanelHead}><View><Text style={styles.menuLogo}>PURE</Text><Text style={styles.menuSubtitle}>Promemoria Aziendale</Text></View><TouchableOpacity onPress={() => setMenuOpen(false)}><Text style={styles.menuClose}>×</Text></TouchableOpacity></View>
            {([
              ['home','⌂','Dashboard'],
              ['others','▦','Promemoria'],
              ['history','✓','Registro'],
              ['settings','⚙','Impostazioni']
            ] as [Tab,string,string][]).map(([key, icon, label]) => <TouchableOpacity key={key} onPress={() => { setTab(key); setMenuOpen(false); if (key === 'settings') { setDraft(current.current.settings); setLatText(current.current.settings.warehouse.latitude?.toString() ?? ''); setLonText(current.current.settings.warehouse.longitude?.toString() ?? ''); } }} style={[styles.menuItem, tab === key && styles.menuItemActive]}><Text style={styles.menuIcon}>{icon}</Text><Text style={styles.menuLabel}>{label}</Text></TouchableOpacity>)}
            <View style={styles.menuDivider}/>
            <TouchableOpacity onPress={() => Alert.alert('Sincronizzazione', 'I dati dell’app mobile vengono salvati localmente sul dispositivo.')} style={styles.menuItem}><Text style={styles.menuIcon}>↻</Text><Text style={styles.menuLabel}>Sincronizzazione</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => Alert.alert('Account', 'La gestione dell’account è disponibile nella versione web.')} style={styles.menuItem}><Text style={styles.menuIcon}>♙</Text><Text style={styles.menuLabel}>Account</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
      {!ready ? <View style={styles.center}><Text style={styles.muted}>Caricamento promemoria…</Text></View> :
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            {tab === 'home' && <>
              <View style={styles.summaryStrip}>
                <View style={styles.summaryItem}>
                  <View style={[styles.summaryIcon, { backgroundColor: '#E5F5F1' }]}><Text style={styles.summaryIconText}>☷</Text></View>
                  <Text style={styles.summaryNumber}>{todayTotal}</Text><Text style={styles.summaryLabel}>Da completare</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <View style={[styles.summaryIcon, { backgroundColor: '#FFE8E5' }]}><Text style={[styles.summaryIconText, { color: C.red }]}>⚑</Text></View>
                  <Text style={styles.summaryNumber}>0</Text><Text style={[styles.summaryLabel, { color: C.red }]}>Priorità alta</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <View style={[styles.summaryIcon, { backgroundColor: '#E5F5F1' }]}><Text style={styles.summaryIconText}>✓</Text></View>
                  <Text style={styles.summaryNumber}>{completedToday}</Text><Text style={styles.summaryLabel}>Completati</Text>
                </View>
              </View>
              <View style={[styles.focusGrid, wideDashboard && styles.focusGridWide]}>
                <View style={wideDashboard && styles.focusCalendarWide}><CalendarCard /></View>
                <View style={[styles.focusMain, wideDashboard && styles.focusMainWide]}>
                  <Panel style={styles.todayPanel}>
                    <View style={styles.todayPanelHeader}>
                      <View><Text style={styles.todayPanelTitle}>Promemoria di oggi</Text><Text style={styles.todayPanelSub}>I tuoi promemoria in programma</Text></View>
                      <View style={styles.totalBadge}><Text style={styles.totalBadgeText}>{todayTotal} in totale</Text></View>
                    </View>
                    <View style={styles.todayList}>
                      {(['entrata','uscita'] as StampType[]).filter(kind => s.windows[kind].enabled).map(kind => {
                        const done = isCompletedToday(data.completed, kind);
                        const w = s.windows[kind];
                        return <View key={kind} style={styles.focusReminderRow}>
                          <View style={styles.focusReminderIcon}><Text style={styles.focusReminderIconText}>◷</Text></View>
                          <Text style={styles.focusReminderTime}>{w.start}</Text>
                          <View style={styles.focusReminderBody}><Text style={[styles.focusReminderTitle, done && styles.focusReminderDone]}>Timbratura {humanStamp(kind)}</Text><Text style={styles.priorityNormal}>Promemoria normale</Text></View>
                          <TouchableOpacity onPress={() => void markStamp(kind)} style={[styles.focusCheck, done && styles.focusCheckDone]}><Text style={styles.focusCheckText}>{done ? '✓' : ''}</Text></TouchableOpacity>
                        </View>;
                      })}
                      {todayPersonal.slice(0, 6).map(item => <View key={item.id} style={styles.focusReminderRow}>
                        <View style={styles.focusReminderIcon}><Text style={styles.focusReminderIconText}>◷</Text></View>
                        <Text style={styles.focusReminderTime}>{item.time}</Text>
                        <View style={styles.focusReminderBody}><Text style={styles.focusReminderTitle}>{item.title}</Text><Text style={styles.priorityNormal}>Promemoria normale</Text></View>
                        <TouchableOpacity onPress={() => void changePersonal(item.id)} style={styles.focusCheck}><Text style={styles.focusCheckText}></Text></TouchableOpacity>
                      </View>)}
                      {!todayPersonal.length && !s.windows.entrata.enabled && !s.windows.uscita.enabled && <Text style={styles.emptyFocus}>Nessun promemoria per oggi.</Text>}
                    </View>
                    <TouchableOpacity onPress={() => { setTab('others'); setExtraOpen(true); }} style={styles.addReminderButton}><Text style={styles.addReminderButtonText}>＋  Aggiungi promemoria</Text></TouchableOpacity>
                  </Panel>
                  {!wideDashboard && upcomingPanel}
                </View>
                {wideDashboard && <View style={styles.focusUpcomingWide}>{upcomingPanel}</View>}
              </View>
            </>}

            {tab === 'others' && <>
              <Text style={styles.bigTitle}>Tutto sotto controllo.</Text>
              <Text style={styles.intro}>Organizza i tuoi impegni di lavoro e ricevi un avviso quando serve.</Text>
              {!extraOpen && <Btn text="+ Crea un promemoria" onPress={() => setExtraOpen(true)} />}
              {extraOpen && <Panel>
                <Title>Nuovo promemoria</Title>
                <View style={{ height: 12 }} />
                <Field label="Titolo" value={newTitle} change={setNewTitle} placeholder="Es. Revisione furgone" />
                <View style={{ height: 12 }} />
                <Field label="Note (facoltative)" value={newNotes} change={setNewNotes} placeholder="Cosa devo ricordare?" />
                <View style={[styles.row, { marginTop: 12 }] }>
                  <Field label="Ora (HH:MM)" value={newTime} change={setNewTime} placeholder="09:00" />
                  {newRepeat === 'once' && <Field label="Data (AAAA-MM-GG)" value={newDate} change={setNewDate} placeholder="2026-11-20" />}
                </View>
                <Text style={styles.fieldLabel}>Frequenza</Text>
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => setNewRepeat('once')} style={[styles.pill, newRepeat === 'once' && styles.pillActive]}><Text style={[styles.pillText, newRepeat === 'once' && styles.pillActiveText]}>Una volta</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setNewRepeat('daily')} style={[styles.pill, newRepeat === 'daily' && styles.pillActive]}><Text style={[styles.pillText, newRepeat === 'daily' && styles.pillActiveText]}>Ogni giorno</Text></TouchableOpacity>
                </View>
                <View style={{ height: 18 }}/><Btn text="Salva promemoria" onPress={() => void addPersonal()}/>
                <TouchableOpacity onPress={() => setExtraOpen(false)} style={styles.textButton}><Text style={styles.muted}>Annulla</Text></TouchableOpacity>
              </Panel>}
              {!data.personal.length && !extraOpen && <Panel style={{ alignItems: 'center', paddingVertical: 40 }}><Text style={{ fontSize: 38 }}>🗓️</Text>
                <Text style={[styles.cardHeadline,{ marginTop: 10 }]}>Nessun promemoria ancora</Text>
                <Text style={[styles.muted,{ textAlign: 'center' }]}>Crea il primo per ricevere notifiche sul telefono.</Text>
              </Panel>}
              {data.personal.map(item => <Panel key={item.id}>
                <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.cardHeadline}>{item.title}</Text>
                  {!!item.notes && <Text style={styles.muted}>{item.notes}</Text>}
                  <Text style={styles.smallTeal}>◷ {item.time} · {item.repeat === 'daily' ? 'Ogni giorno' : item.date}</Text></View>
                  <Switch value={item.active} onValueChange={() => void changePersonal(item.id)} trackColor={{ true: C.teal }}/>
                </View>
                <TouchableOpacity onPress={() => Alert.alert('Elimina promemoria', `Eliminare “${item.title}”?`, [
                  { text:'Annulla', style:'cancel' }, { text:'Elimina', style:'destructive', onPress: () => void changePersonal(item.id,true) }
                ])} style={{ paddingTop: 12 }}><Text style={{ color: C.red, fontWeight: '600' }}>Elimina</Text></TouchableOpacity>
              </Panel>)}
              <Text style={styles.footnote}>I promemoria personalizzati sono basati sull’orario, senza controllo GPS.</Text>
            </>}

            {tab === 'history' && <>
              <Text style={styles.bigTitle}>Le tue conferme.</Text>
              <Text style={styles.intro}>Storico dei promemoria di timbratura che hai confermato. Non equivale a un registro presenze ufficiale.</Text>
              {data.completed.length ? data.completed.map(item => <Panel key={item.id}>
                <View style={styles.row}><Text style={{ fontSize: 25 }}>✓</Text><View style={{ flex:1 }}>
                  <Text style={styles.cardHeadline}>{firstCapital(item.label)}</Text>
                  <Text style={styles.muted}>{dateLabel(item.occurredAt)}</Text>
                </View></View></Panel>) : <Panel><Text style={styles.muted}>Non hai ancora confermato nessuna timbratura.</Text></Panel>}
            </>}

            {tab === 'settings' && <>
              <Text style={styles.bigTitle}>Imposta la tua giornata.</Text>
              <Text style={styles.intro}>Scegli dove e quando desideri che l'app ti ricordi di timbrare.</Text>
              <Panel>
                <Title>📍 Posizione dell'ufficio</Title>
                <View style={{ height: 12 }}/>
                <Field label="Nome" value={settingsWarehouse.name} change={name => setDraft(p=>({...p,warehouse:{...p.warehouse,name}}))}/>
                <View style={{ height: 12 }}/>
                <Btn text="⌖ Usa la mia posizione GPS" onPress={() => void setWarehouseHere()} secondary/>
                <View style={[styles.row,{ marginTop: 12 }]}>
                  <Field label="Latitudine" value={latText} change={setLatText} numeric />
                  <Field label="Longitudine" value={lonText} change={setLonText} numeric />
                </View>
                <Text style={styles.fieldLabel}>Raggio di riconoscimento</Text>
                <View style={styles.row}>{[100,150,300,500].map(m =>
                  <TouchableOpacity key={m} onPress={() => setDraft(p=>({...p,warehouse:{...p.warehouse,radius:m}}))}
                    style={[styles.pill,settingsWarehouse.radius===m&&styles.pillActive]}>
                    <Text style={[styles.pillText,settingsWarehouse.radius===m&&styles.pillActiveText]}>{m} m</Text>
                  </TouchableOpacity>)}</View>
              </Panel>
              <Panel>
                <View style={styles.row}><View style={{flex:1}}><Title>Controllo posizione GPS</Title>
                    <Text style={styles.muted}>Avvisa solo quando sei nell’area dell'ufficio.</Text></View>
                  <Switch value={draft.geoOnly} onValueChange={geoOnly => setDraft(p=>({...p,geoOnly}))} trackColor={{true:C.teal}}/>
                </View>
                {draft.geoOnly && <><View style={{height:14}}/><Btn text="Autorizza posizione in background" onPress={() => void permitGPS()} secondary/>
                  <Text style={styles.footnote}>Serve autorizzazione “Sempre”. Il telefono decide quando consegnare gli eventi GPS.</Text></>}
                {!draft.geoOnly && <Text style={styles.footnote}>Gli avvisi saranno emessi anche fuori dall'ufficio, in base agli orari scelti.</Text>}
              </Panel>
              <Panel>
                <Title>🕒 Fasce orarie timbratura</Title>
                {(['entrata','uscita'] as StampType[]).map(kind => <View key={kind} style={{ marginTop: 18 }}>
                  <View style={styles.row}><Text style={styles.cardHeadline}>{humanStamp(kind)}</Text>
                    <Switch value={draft.windows[kind].enabled} onValueChange={enabled => setDraft(p=>({...p,windows:{...p.windows,[kind]:{...p.windows[kind],enabled}}}))} trackColor={{true:C.teal}} /></View>
                  <View style={[styles.row,{marginTop:8}]}>
                    <Field label="Dalle" value={draft.windows[kind].start} change={start=>setDraft(p=>({...p,windows:{...p.windows,[kind]:{...p.windows[kind],start}}}))} placeholder="07:00" />
                    <Field label="Alle" value={draft.windows[kind].end} change={end=>setDraft(p=>({...p,windows:{...p.windows,[kind]:{...p.windows[kind],end}}}))} placeholder="09:00" />
                  </View>
                </View>)}
                <Text style={[styles.fieldLabel,{ marginTop:20 }]}>Giorni lavorativi</Text>
                <View style={[styles.row, { flexWrap:'wrap' }]}>
                  {DAY_NAMES.map((day, index) => <TouchableOpacity key={day} style={[styles.pill, draft.days.includes(index as 0|1|2|3|4|5|6) && styles.pillActive]}
                    onPress={()=>setDraft(p=>({...p,days:p.days.includes(index as 0|1|2|3|4|5|6)
                      ? p.days.filter(x=>x!==index) : [...p.days,index as 0|1|2|3|4|5|6]}))}>
                    <Text style={[styles.pillText,draft.days.includes(index as 0|1|2|3|4|5|6) && styles.pillActiveText]}>{day}</Text>
                  </TouchableOpacity>)}
                </View>
                <Text style={[styles.fieldLabel,{ marginTop:16 }]}>Ripeti avviso ogni</Text>
                <View style={styles.row}>{([5,10,15] as const).map(n => <TouchableOpacity key={n}
                  onPress={()=>setDraft(p=>({...p,repeatMinutes:n}))} style={[styles.pill,draft.repeatMinutes===n&&styles.pillActive]}>
                  <Text style={[styles.pillText,draft.repeatMinutes===n&&styles.pillActiveText]}>{n} min</Text>
                </TouchableOpacity>)}</View>
              </Panel>
              <Btn text="✓ Salva impostazioni" onPress={() => void saveSettings()}/>
              <View style={{height:12}}/><Btn text="♪ Prova il suono di notifica" secondary onPress={() => void testSound().catch(e=>Alert.alert('Errore',String(e)))}/>
              <Text style={styles.footnote}>I dati restano su questo telefono. Non vengono registrati percorsi o coordinate dei tuoi spostamenti. Il sistema può ritardare o silenziare avvisi secondo le proprie impostazioni.</Text>
            </>}
          </ScrollView>
          <View style={[styles.bottomBar, { display: 'none' }]}>
            {([['home','⌂','Oggi'],['others','▦','Promemoria'],['history','◷','Registro'],['settings','⚙','Impostazioni']] as [Tab,string,string][]).map(([key,icon,label])=>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} key={key} onPress={()=>{setTab(key);if(key==='settings'){setDraft(current.current.settings);setLatText(current.current.settings.warehouse.latitude?.toString() ?? '');setLonText(current.current.settings.warehouse.longitude?.toString() ?? '');}}} style={[styles.bottomItem,tab===key&&styles.bottomSelected]}>
                <Text style={[styles.bottomIcon,tab===key&&{color:C.teal}]}>{icon}</Text>
                <Text style={[styles.bottomLabel,tab===key&&{color:C.teal,fontWeight:'700'}]}>{label}</Text>
              </TouchableOpacity>)}
          </View>
        </KeyboardAvoidingView>}
    </SafeAreaView>
  </SafeAreaProvider>;
}

const styles = StyleSheet.create({
  menuButton:{width:44,height:44,borderRadius:13,backgroundColor:C.teal,alignItems:'center',justifyContent:'center'},
  menuButtonText:{color:C.white,fontSize:25,fontWeight:'700'},
  headerDate:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:18,paddingHorizontal:11,paddingVertical:8,maxWidth:180},
  headerDateText:{color:C.ink,fontSize:10,fontWeight:'800'},
  summaryStrip:{backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line,paddingVertical:14,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-around',gap:8},
  summaryItem:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  summaryIcon:{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center'},
  summaryIconText:{color:C.teal,fontSize:21,fontWeight:'900'},
  summaryNumber:{color:C.ink,fontSize:24,fontWeight:'900'},
  summaryLabel:{color:'#287452',fontSize:12,fontWeight:'800'},
  summaryDivider:{width:1,height:35,backgroundColor:C.line},
  focusGrid:{gap:14},
  focusGridWide:{flexDirection:'row',alignItems:'stretch'},
  focusCalendarWide:{flex:0.95},
  focusMain:{gap:14},
  focusMainWide:{flex:1.35},
  focusUpcomingWide:{flex:1.15},
  calendarCard:{padding:16},
  cardHeaderRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  cardTitleRow:{flexDirection:'row',alignItems:'center',gap:9},
  cardTitleIcon:{width:35,height:35,borderRadius:10,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'},
  cardTitleIconText:{color:C.teal,fontSize:22,fontWeight:'800'},
  cardTitle:{color:C.ink,fontSize:18,fontWeight:'900'},
  todayButton:{borderWidth:1,borderColor:C.line,borderRadius:10,paddingHorizontal:12,paddingVertical:8},
  todayButtonText:{color:C.teal,fontWeight:'800',fontSize:12},
  calendarNav:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:18,marginBottom:14},
  calendarArrow:{color:C.teal,fontSize:32,fontWeight:'300'},
  calendarMonth:{color:C.ink,fontSize:18,fontWeight:'900'},
  weekRow:{flexDirection:'row',justifyContent:'space-between',marginBottom:9},
  weekText:{color:C.muted,fontSize:10,fontWeight:'800',width:34,textAlign:'center'},
  calendarGrid:{flexDirection:'row',flexWrap:'wrap',gap:4},
  calendarCell:{width:'13.2%',aspectRatio:1,alignItems:'center',justifyContent:'center',borderRadius:10},
  calendarCellToday:{backgroundColor:C.teal},
  calendarDayText:{color:C.ink,fontSize:13,fontWeight:'600'},
  calendarDayTextToday:{color:C.white,fontWeight:'900'},
  calendarDot:{position:'absolute',bottom:3,width:4,height:4,borderRadius:2,backgroundColor:'#9FF0C0'},
  calendarLegend:{flexDirection:'row',gap:15,marginTop:12},
  legendGreen:{color:C.teal,fontSize:10},
  legendOrange:{color:C.orange,fontSize:10},
  todayPanel:{padding:0,overflow:'hidden'},
  todayPanelHeader:{backgroundColor:C.teal,padding:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  todayPanelTitle:{color:C.white,fontSize:21,fontWeight:'900'},
  todayPanelSub:{color:'#C9EFE8',fontSize:12,marginTop:4},
  totalBadge:{backgroundColor:'#FFFFFF25',borderRadius:18,paddingHorizontal:10,paddingVertical:8},
  totalBadgeText:{color:C.white,fontSize:11,fontWeight:'800'},
  todayList:{paddingHorizontal:15,paddingBottom:8},  focusReminderRow:{minHeight:62,flexDirection:'row',alignItems:'center',gap:9,borderBottomWidth:1,borderColor:C.line},
  focusReminderIcon:{width:35,height:35,borderRadius:11,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'},
  focusReminderIconText:{color:C.teal,fontSize:18},
  focusReminderTime:{color:C.muted,fontSize:12,width:42},
  focusReminderBody:{flex:1},
  focusReminderTitle:{color:C.ink,fontSize:14,fontWeight:'800'},
  focusReminderDone:{textDecorationLine:'line-through',color:C.muted},
  priorityNormal:{alignSelf:'flex-start',color:'#297454',backgroundColor:'#E4F5EA',borderRadius:12,paddingHorizontal:7,paddingVertical:3,fontSize:9,fontWeight:'800',marginTop:4},
  focusCheck:{width:25,height:25,borderWidth:2,borderColor:'#9AAEAD',borderRadius:6,alignItems:'center',justifyContent:'center'},
  focusCheckDone:{backgroundColor:C.teal,borderColor:C.teal},
  focusCheckText:{color:C.white,fontWeight:'900'},
  emptyFocus:{color:C.muted,textAlign:'center',padding:22,fontSize:12},
  addReminderButton:{marginHorizontal:15,marginTop:8,marginBottom:14,borderRadius:13,backgroundColor:C.teal,paddingVertical:13,alignItems:'center'},
  addReminderButtonText:{color:C.white,fontSize:13,fontWeight:'900'},
  upcomingFocus:{padding:16},
  upcomingIcon:{color:C.teal,fontSize:30},
  upcomingRow:{minHeight:62,flexDirection:'row',alignItems:'center',gap:9,borderTopWidth:1,borderColor:C.line},
  upcomingDateBadge:{width:40,height:40,borderRadius:11,backgroundColor:C.pale,alignItems:'center',justifyContent:'center'},
  upcomingDateDay:{color:C.teal,fontSize:15,fontWeight:'900'},
  upcomingDateMonth:{color:C.muted,fontSize:9,fontWeight:'800'},
  upcomingTitle:{flex:1,color:C.ink,fontSize:13,fontWeight:'800'},
  upcomingDate:{color:C.muted,fontSize:10},
  menuOverlay:{flex:1,flexDirection:'row',justifyContent:'flex-end'},
  menuBackdrop:{...StyleSheet.absoluteFillObject,backgroundColor:'#092F2B66'},
  menuPanel:{width:'78%',maxWidth:360,backgroundColor:C.white,paddingHorizontal:20,paddingTop:35,paddingBottom:25},
  menuPanelHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingBottom:22,borderBottomWidth:1,borderColor:C.line,marginBottom:18},
  menuLogo:{color:C.teal,fontSize:25,fontWeight:'900'},
  menuSubtitle:{color:C.muted,fontSize:11,marginTop:2},
  menuClose:{color:C.teal,fontSize:31,fontWeight:'300'},
  menuItem:{flexDirection:'row',alignItems:'center',gap:14,borderRadius:12,padding:14},
  menuItemActive:{backgroundColor:C.pale},
  menuIcon:{color:C.teal,fontSize:22,width:25,textAlign:'center'},
  menuLabel:{color:C.ink,fontSize:15,fontWeight:'700'},
  menuDivider:{height:1,backgroundColor:C.line,marginVertical:12},  center: {flex:1,justifyContent:'center',alignItems:'center'},
  header: { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingVertical:13,
    backgroundColor:C.bg, borderBottomWidth:1, borderColor:C.line, gap:11 },
  brandMark: {width:39,height:39,borderRadius:13,backgroundColor:C.teal,alignItems:'center',justifyContent:'center'},
  brand: {color:C.ink, fontSize:16, fontWeight:'900',letterSpacing:2},
  brandSub:{color:C.muted,fontSize:8.8,letterSpacing:1.25,fontWeight:'800'},
  tabChip:{borderRadius:14,paddingHorizontal:12,paddingVertical:7,backgroundColor:C.pale,maxWidth:130},
  tabChipText:{color:C.dark,fontWeight:'800',fontSize:11},
  scroll:{paddingHorizontal:19,paddingTop:22,paddingBottom:40,gap:14},
  eyebrow:{alignSelf:'flex-start',backgroundColor:C.pale,borderRadius:20,paddingVertical:7,paddingHorizontal:12},
  eyebrowText:{color:C.teal,fontSize:10,letterSpacing:1,fontWeight:'800'},
  bigTitle:{fontWeight:'900',fontSize:29,lineHeight:36,color:C.ink,letterSpacing:-.7},
  intro:{color:C.muted,fontSize:14,lineHeight:21,marginBottom:1},
  panel:{borderRadius:19,padding:17,backgroundColor:C.white,borderWidth:1,borderColor:C.line, gap:5},
  whiteSmall:{color:'#AFE5DC',fontSize:10,letterSpacing:1.5,fontWeight:'800'},
  whiteTitle:{color:C.white,fontSize:22,fontWeight:'900',marginTop:4},
  whiteLink:{color:C.white,fontSize:13,fontWeight:'800'},
  lightRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap'},
  sectionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:7},
  sectionTitle:{fontWeight:'900',fontSize:18,color:C.ink},
  sectionSub:{fontWeight:'700',fontSize:14,color:C.muted},
  smallTag:{color:C.teal,fontWeight:'800',fontSize:11},
  stampTop:{flexDirection:'row',alignItems:'center',gap:11,marginBottom:12},
  stampIcon:{width:45,height:45,borderRadius:14,alignItems:'center',justifyContent:'center'},
  cardHeadline:{fontSize:15,fontWeight:'800',color:C.ink},
  muted:{fontSize:12.5,color:C.muted,lineHeight:19},
  smallTeal:{fontSize:12,color:C.teal,fontWeight:'800',marginTop:5},
  stateText:{fontSize:11,fontWeight:'800'},
  positive:{color:C.teal,fontWeight:'700',fontSize:12},
  button:{backgroundColor:C.teal,borderRadius:13,paddingVertical:13,paddingHorizontal:14,alignItems:'center',justifyContent:'center'},
  buttonSecondary:{backgroundColor:C.pale},
  buttonText:{color:C.white,fontSize:13,fontWeight:'800'},
  footnote:{color:C.muted,fontSize:11.5,lineHeight:17.5,marginTop:7},
  link:{color:C.teal,fontWeight:'800',fontSize:12},
  row:{flexDirection:'row',alignItems:'center',gap:9},
  fieldLabel:{color:C.muted,fontWeight:'800',fontSize:11,marginBottom:5,marginTop:5},
  field:{backgroundColor:'#F8FBFC',borderWidth:1,borderColor:C.line,borderRadius:12,paddingHorizontal:12,paddingVertical:10,fontSize:14,color:C.ink,minHeight:45},
  pill:{paddingHorizontal:12,paddingVertical:10,borderWidth:1,borderColor:C.line,borderRadius:11,backgroundColor:'#FAFCFC',minWidth:52,alignItems:'center'},
  pillActive:{backgroundColor:C.teal,borderColor:C.teal},
  pillText:{color:C.muted,fontSize:12,fontWeight:'800'},
  pillActiveText:{color:C.white},
  textButton:{alignSelf:'center',padding:12},
  bottomBar:{backgroundColor:C.white,borderTopWidth:1,borderColor:C.line,flexDirection:'row',paddingTop:7,paddingHorizontal:8,paddingBottom:4},
  bottomItem:{flex:1,alignItems:'center',borderRadius:12,paddingVertical:6},
  bottomSelected:{backgroundColor:C.pale},
  bottomIcon:{color:C.muted,fontSize:22,fontWeight:'700'},
  bottomLabel:{fontSize:10,color:C.muted,marginTop:3}
});