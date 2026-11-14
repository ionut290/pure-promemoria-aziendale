/* Pure Promemoria - sincronizzazione bidirezionale prudente. */
'use strict';
(() => {
  const AUTH_SESSION_KEY='pure_auth_session';
  const PERSISTENT_AUTH_KEY='pure_auth_session_persistent';
  const currentAuth=sessionStorage.getItem(AUTH_SESSION_KEY);
const persistentAuth=localStorage.getItem(PERSISTENT_AUTH_KEY);
if(!currentAuth && persistentAuth)sessionStorage.setItem(AUTH_SESSION_KEY,persistentAuth);
else if(currentAuth && !persistentAuth)localStorage.setItem(PERSISTENT_AUTH_KEY,currentAuth);
  const $ = id => document.getElementById(id);
  const POLL_MS = 15000;
  const FLUSH_MS = 2200;
  const note = message => { const node = $('autoCloudStatus'); if (node) node.textContent = message; };
    let account = null;
  let token = '';
  let version = null;
  let enabled = true;
  let blocked = false;
  let busy = false;
  let dirty = false;
  let flushTimer = null;
  let pollTimer = null;
  let lastSaved = '';
  let currentKey = '';
  let metaKey = '';

  const canonical = value => JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.keys(item).sort().reduce((out, key) => { out[key] = item[key]; return out; }, {});
  });
  const snapshot = () => canonical(data);
  const localMetaKey = key => `${key}-cloud-sync-meta-v2`;
  const localBackupKey = key => `${key}-cloud-sync-previous-v2`;
  const matchingAccount = () => !!account && !!token &&
    sessionStorage.getItem('pure_auth_session') === token &&
    activeStorageKey === `pure-promemoria-web-v1-account-${account.id}`;

  const readMeta = () => {
    if (!metaKey) return null;
    try { return JSON.parse(localStorage.getItem(metaKey) || 'null'); } catch (_e) { return null; }
  };
  const persistMeta = () => {
    if (!metaKey || !Number.isSafeInteger(version) || !lastSaved) return;
    localStorage.setItem(metaKey, JSON.stringify({ version, snapshot: lastSaved, savedAt: new Date().toISOString() }));
  };
  const clearTimers = () => {
    clearTimeout(flushTimer);
    clearTimeout(pollTimer);
    flushTimer = null;
    pollTimer = null;
  };
  const pause = (message, uncheck = true) => {
    enabled = false;
    clearTimers();
        if (message) note(message);
  };
  const schedulePoll = () => {
    clearTimeout(pollTimer);
    if (enabled) pollTimer = setTimeout(poll, POLL_MS);
  };
  const scheduleFlush = () => {
    if (!enabled) return;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_MS);
  };
  const markLocalState = () => {
    dirty = snapshot() !== lastSaved;
    if (dirty) scheduleFlush();
  };

  async function request(path, method = 'GET', body) {
    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`https://pure-promemoria.duckdns.org/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store'
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = Error(response.status === 409 ? 'Conflitto: il Cloud è cambiato.' :
        response.status === 401 ? 'Sessione scaduta.' :
        (typeof result.detail === 'string' ? result.detail : `HTTP ${response.status}`));
      error.code = response.status === 409 ? 'CONFLICT' : response.status === 401 ? 'AUTH' : 'NETWORK';
      throw error;
    }
    return result;
  }

  const validRemote = remote => remote && remote.data &&
    typeof remote.data === 'object' && !Array.isArray(remote.data) &&
    Number.isSafeInteger(remote.version) && remote.version >= 1;

  const remoteData = value => ({
    settings: { ...(typeof BASE !== 'undefined' ? BASE.settings : {}), ...(value.settings || {}) },
    reminders: Array.isArray(value.reminders) ? value.reminders : [],
    confirmations: value.confirmations && typeof value.confirmations === 'object' ? value.confirmations : {},
    completed: value.completed && typeof value.completed === 'object' ? value.completed : {},
    snoozes: value.snoozes && typeof value.snoozes === 'object' ? value.snoozes : {}
  });

  const renderAfterRemote = () => {
    if (typeof closeAlarm === 'function') closeAlarm();
    if (typeof fillSettings === 'function') fillSettings();
    if (typeof startGps === 'function') startGps();
    if (typeof renderToday === 'function') renderToday();
    if (typeof renderReminders === 'function') renderReminders();
    if (typeof renderLog === 'function') renderLog();
  };

  const applyRemote = remote => {
    const old = snapshot();
    localStorage.setItem(localBackupKey(currentKey), JSON.stringify({ version, data: JSON.parse(old), savedAt: new Date().toISOString() }));
    data = remoteData(remote.data);
    if (typeof save !== 'function' || !save()) throw Error('Salvataggio locale fallito: dati locali conservati.');
    version = remote.version;
    lastSaved = snapshot();
    dirty = false;
    persistMeta();
    renderAfterRemote();
  };

    async function start() {
      pause('', false);
      blocked = false;
      token = sessionStorage.getItem('pure_auth_session') || '';
      if (!token) { note('Accedi per attivare la sincronizzazione.'); return; }

      try {
        account = await request('/auth/me');
        const expectedKey = `pure-promemoria-web-v1-account-${account.id}`;
        if (activeStorageKey !== expectedKey && typeof switchLocalAccount === 'function') {
          switchLocalAccount(account.id);
        }
        if (!matchingAccount()) throw Error('Archivio locale non associato all’account verificato.');

        currentKey = activeStorageKey;
        metaKey = localMetaKey(currentKey);

        const remote = await request('/data');
        const local = snapshot();

        if (!validRemote(remote)) {
          if (remote && remote.version === 0 && !remote.data) {
            const saved = await request('/data', 'PUT', {
              data: JSON.parse(local),
              version: 0
            });
            version = saved.version;
            lastSaved = local;
            dirty = false;
            persistMeta();
          } else {
            throw Error('Dati Cloud non validi.');
          }
        } else if (canonical(remote.data) === local) {
          version = remote.version;
          lastSaved = local;
          dirty = false;
          persistMeta();
        } else {
          applyRemote(remote);
          note(`Cloud autorevole applicato · versione ${remote.version}.`);
        }

        enabled = true;
        note(`Sincronizzazione attiva · Cloud autorevole · controllo ogni 15 secondi.`);
        schedulePoll();
      } catch (error) {
        pause(`Sincronizzazione non attivata: ${error.message}`, true);
      }
    }

  async function poll() {
    pollTimer = null;
    if (!enabled || busy) { schedulePoll(); return; }
    if (!matchingAccount() || activeStorageKey !== currentKey) {
      pause('Sincronizzazione sospesa: account cambiato.', true);
      return;
    }
    try {
      const remote = await request('/data');
      if (!validRemote(remote) || remote.version === version) { markLocalState(); return; }
      if (snapshot() !== lastSaved || dirty) {
          applyRemote(remote);
          note(`Cloud autorevole applicato · versione ${remote.version}.`);
          return;
        }
      if (remote.version > version) {
        if (canonical(remote.data) === lastSaved) {
          version = remote.version;
          persistMeta();
        } else {
          applyRemote(remote);
        }
        note(`Aggiornato dal Cloud · versione ${version} · dati locali salvati.`);
      } else {
        pause('Cloud non valido o precedente: sincronizzazione sospesa.', true);
        return;
      }
    } catch (error) {
      if (error.code === 'AUTH') pause(`Sincronizzazione sospesa: ${error.message}`, true);
      else note('Cloud non raggiungibile · nuovo controllo automatico tra 15 secondi.');
    } finally {
      schedulePoll();
    }
  }

  async function flush() {
    flushTimer = null;
    if (!enabled || busy) return;
    if (!matchingAccount() || activeStorageKey !== currentKey) {
      pause('Sincronizzazione sospesa: account cambiato.', true);
      return;
    }
    const outgoing = snapshot();
    dirty = outgoing !== lastSaved;
    if (!dirty) return;
    busy = true;
    try {
      const check = await request('/data');
      if (check.version !== version) {
        const error = Error('il Cloud è cambiato prima del salvataggio');
        error.code = 'CONFLICT';
        throw error;
      }
      if (snapshot() !== outgoing) { dirty = true; return; }
      const saved = await request('/data', 'PUT', { data: JSON.parse(outgoing), version });
      if (!Number.isSafeInteger(saved.version) || saved.version !== version + 1) throw Error('Versione Cloud inattesa.');
      version = saved.version;
      lastSaved = outgoing;
      dirty = false;
      persistMeta();
      note(`Salvataggio automatico riuscito · versione ${version}`);
      if (snapshot() !== outgoing) { dirty = true; scheduleFlush(); }
    } catch (error) {
      dirty = true;
      if (error.code === 'CONFLICT') pause(`Conflitto: modifica locale conservata. ${error.message}`, true);
      else if (error.code === 'AUTH') pause(`Sincronizzazione sospesa: ${error.message}`, true);
      else { note(`Salvataggio Cloud non riuscito · dati locali conservati · nuovo tentativo tra 15 secondi.`); schedulePoll(); }
    } finally {
      busy = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('pure-local-saved', markLocalState);
    window.addEventListener('storage', event => {
      if (event.key === activeStorageKey) markLocalState();
    });
    window.addEventListener('pagehide', () => pause('', false));
    let attempts = 0;
    const autoStart = () => {
      if (!sessionStorage.getItem('pure_auth_session')) { note('Accedi per attivare la sincronizzazione.'); return; }
      if (!activeStorageKey || !activeStorageKey.startsWith('pure-promemoria-web-v1-account-')) {
        if (++attempts < 30) setTimeout(autoStart, 500);
        else note('Account non pronto: sincronizzazione sospesa.');
        return;
      }
      if (!blocked) start();
    };
    note('Verifica automatica dei dati Cloud...');
    setTimeout(autoStart, 700);
  });
})();
