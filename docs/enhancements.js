/* Funzioni avanzate di Pure Promemoria Aziendale (versione web).
   Estende la versione esistente senza cancellare le attività già salvate.
   Geolocalizzazione e suoneria richiedono che la pagina sia in uso. */
(function () {
  'use strict';

  const CATEGORIES = {
    lavoro: 'Lavoro',
    mezzi: 'Mezzi e attrezzature',
    documenti: 'Documenti',
    appuntamenti: 'Appuntamenti',
    personale: 'Personale'
  };
  const REPEATS = {
    once: 'Una volta',
    daily: 'Ogni giorno',
    workdays: 'Lun–Ven',
    weekly: 'Ogni settimana',
    monthly: 'Ogni mese'
  };
  const PRIORITIES = { high: 'Alta', normal: 'Normale', low: 'Bassa' };
  let editingId = null;

  // Mantiene il formato usato dalla prima versione dell'app.
  data.snoozes = data.snoozes && typeof data.snoozes === 'object' ? data.snoozes : {};

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function isRecurring(r) {
    return r.repeat !== 'once';
  }
  function validDate(r) {
    const d = new Date(r.when);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  function occursOn(r, date) {
    const first = validDate(r);
    if (!first || startOfDay(date).getTime() < startOfDay(first).getTime()) return false;
    const repeat = r.repeat || 'once';
    if (repeat === 'daily') return true;
    if (repeat === 'workdays') return date.getDay() !== 0 && date.getDay() !== 6;
    if (repeat === 'weekly') return date.getDay() === first.getDay();
    if (repeat === 'monthly') return date.getDate() === first.getDate();
    return date.toDateString() === first.toDateString();
  }
  function dueNow(r, now = new Date()) {
    const first = validDate(r);
    if (!first || !occursOn(r, now)) return false;
    if ((r.repeat || 'once') === 'once') return now >= first;
    if (now < first) return false;
    return currentMinute() >= first.getHours() * 60 + first.getMinutes();
  }
  function snoozed(r) {
    return Number(data.snoozes?.[r.id] || 0) > Date.now();
  }
  function onlyOffice(r) {
    return r.place === 'office';
  }
  function locationAllowed(r) {
    if (!onlyOffice(r)) return true;
    // Se GPS è disattivato, un'attività vincolata alla posizione non scatta.
    if (data.settings.mode !== 'gps') return false;
    return nearby();
  }
  function taskDone(r) {
    if ((r.repeat || 'once') === 'once') return !!data.completed.once?.[r.id];
    return !!data.completed[day()]?.[r.id];
  }
  doneReminder = taskDone;
  timeForReminder = function (r) {
    return !taskDone(r) && !snoozed(r) && locationAllowed(r) && (
      (r.repeat || 'once') === 'once'
        ? !!validDate(r) && Date.now() >= validDate(r).getTime()
        : dueNow(r)
    );
  };

  function clearCompletion(id) {
    for (const value of Object.values(data.completed)) {
      if (value && typeof value === 'object') delete value[id];
    }
    delete data.snoozes[id];
  }
  reminderDone = function (r) {
    if (!r) return;
    if ((r.repeat || 'once') === 'once') {
      data.completed.once ??= {};
      data.completed.once[r.id] = true;
    } else {
      data.completed[day()] ??= {};
      data.completed[day()][r.id] = true;
    }
    delete data.snoozes[r.id];
    save();
    if (alarm?.type === 'reminder' && alarm.id === r.id) closeAlarm();
    renderReminders();
    renderToday();
  };

  dateLabel = function (r) {
    const d = validDate(r);
    if (!d) return 'Data da correggere';
    const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    switch (r.repeat || 'once') {
      case 'daily': return 'Tutti i giorni alle ' + time;
      case 'workdays': return 'Lunedì–venerdì alle ' + time;
      case 'weekly': return 'Ogni ' + d.toLocaleDateString('it-IT', { weekday: 'long' }) + ' alle ' + time;
      case 'monthly': return 'Il giorno ' + d.getDate() + ' di ogni mese alle ' + time;
      default: return date + ', ' + time;
    }
  };

  function dueDateLabel(r) {
    if (taskDone(r)) return 'Completato';
    if (snoozed(r)) {
      return 'Rinviato alle ' + new Date(data.snoozes[r.id])
        .toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    }
    if ((r.repeat || 'once') === 'once' && validDate(r) < new Date()) return 'In ritardo';
    if (dueNow(r)) return 'Da fare ora';
    return '';
  }
  function taskMarkup(r, manage) {
    const completed = taskDone(r);
    const priority = r.priority || 'normal';
    const category = r.category || 'lavoro';
    const id = esc(r.id);
    const detail = dueDateLabel(r);
    const pills = [
      '<span class="task-chip">' + esc(CATEGORIES[category] || 'Lavoro') + '</span>',
      priority === 'high' ? '<span class="task-chip priority-high">Priorità alta</span>' :
        priority === 'low' ? '<span class="task-chip priority-low">Priorità bassa</span>' : '',
      onlyOffice(r) ? '<span class="task-chip location-chip">⌖ Ufficio</span>' : '',
      completed ? '<span class="task-chip completed-chip">✓ Completato</span>' : '',
      detail && !completed ? '<span class="task-chip due-chip">' + esc(detail) + '</span>' : ''
    ].join('');
    return '<article class="reminder-item enhanced' + (completed ? ' completed-reminder' : '') + '">' +
      '<div class="reminder-body"><div class="task-chips">' + pills + '</div><h4>' + esc(r.title) +
      '</h4><p>' + esc(dateLabel(r)) + '</p>' +
      (r.notes ? '<p>' + esc(r.notes) + '</p>' : '') + '</div>' +
      '<div class="actions advanced-actions">' +
      (completed ?
        '<button type="button" class="tiny" data-reopen="' + id + '">Riapri</button>' :
        '<button type="button" class="tiny task-complete" data-complete="' + id + '">✓ Fatto</button>' +
        '<button type="button" class="tiny" data-snooze="' + id + '">+10 min</button>') +
      (manage ? '<button type="button" class="tiny" data-edit="' + id + '">Modifica</button>' +
        '<button type="button" class="tiny" data-remove="' + id + '">Elimina</button>' : '') +
      '</div></article>';
  }
  reminderList = function (items, allowDelete) {
    if (!items.length) return '<div class="empty">Nessun promemoria da visualizzare.</div>';
    return items.map(r => taskMarkup(r, allowDelete)).join('');
  };

  function summary() {
    const now = new Date();
    const visible = data.reminders.filter(r => {
      const date = validDate(r);
      if (!date) return false;
      if ((r.repeat || 'once') === 'once') return occursOn(r, now) || (date < now && !taskDone(r));
      return occursOn(r, now);
    });
    const completedTasks = visible.filter(taskDone).length;
    const completedPunches = ['entry', 'exit'].filter(donePunch).length;
    const expectedPunches = workday() ? 2 : 0;
    const dueTasks = visible.filter(r => !taskDone(r)).length;
    $('statToDo').textContent = dueTasks + expectedPunches - completedPunches;
    $('statCompleted').textContent = completedTasks + completedPunches;
    $('statHigh').textContent = visible.filter(r => !taskDone(r) && r.priority === 'high').length;
    return visible;
  }

  const originalRenderToday = renderToday;
  renderToday = function () {
    originalRenderToday();
    const visible = summary();
    $('todayReminders').innerHTML = reminderList(
      visible.sort((a, b) => (a.priority === 'high' ? -1 : 0) -
        (b.priority === 'high' ? -1 : 0)).slice(0, 8), false
    );
  };

  renderReminders = function () {
    const q = $('reminderSearch')?.value.trim().toLocaleLowerCase('it-IT') || '';
    const filter = $('reminderFilter')?.value || 'open';
    const category = $('reminderCategoryFilter')?.value || 'all';
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    let reminders = data.reminders.filter(r => {
      if (q && !(String(r.title) + ' ' + String(r.notes || '')).toLocaleLowerCase('it-IT').includes(q)) return false;
      if (category !== 'all' && (r.category || 'lavoro') !== category) return false;
      const done = taskDone(r);
      if (filter === 'completed' && !done) return false;
      if (filter === 'open' && done) return false;
      if (filter === 'high' && (r.priority || 'normal') !== 'high') return false;
      return true;
    });
    reminders.sort((a, b) => {
      const pa = priorityOrder[a.priority || 'normal'] ?? 1;
      const pb = priorityOrder[b.priority || 'normal'] ?? 1;
      if (pa !== pb) return pa - pb;
      return String(a.when).localeCompare(String(b.when));
    });
    $('reminderList').innerHTML = reminderList(reminders, true);
    $('reminderCount').textContent = '(' + reminders.length + ')';
  };

  // Il rinvio della finestra di avviso viene salvato anche tra un'apertura e l'altra.
  const oldDismissAlarm = dismissAlarm;
  dismissAlarm = function (completed) {
    if (alarm?.type === 'reminder' && !completed) {
      data.snoozes[alarm.id] = Date.now() + Number(data.settings.interval) * 60000;
      save();
    }
    oldDismissAlarm(completed);
    renderReminders();
    renderToday();
  };

  function resetForm() {
    editingId = null;
    $('reminderForm').reset();
    $('reminderSubmit').textContent = '+ Aggiungi promemoria';
    $('cancelReminderEdit').classList.add('hidden');
    $('reminderFeedback').textContent = '';
    futureTime();
  }
  function submitEnhancedReminder(event) {
    // Previene la vecchia gestione del modulo senza modificare gli altri dati.
    event.preventDefault();
    event.stopImmediatePropagation();
    const title = $('reminderTitle').value.trim();
    const when = $('reminderWhen').value;
    const notes = $('reminderNotes').value.trim();
    if (!title || !when || Number.isNaN(new Date(when).getTime())) {
      $('reminderFeedback').textContent = 'Compila titolo, data e ora.';
      return;
    }
    const category = $('reminderCategory').value;
    const repeat = $('reminderRepeat').value;
    const priority = $('reminderPriority').value;
    const place = $('reminderPlace').value;
    if (!Object.hasOwn(REPEATS, repeat) || !Object.hasOwn(CATEGORIES, category) ||
        !Object.hasOwn(PRIORITIES, priority) || !['any', 'office'].includes(place)) return;
    if (editingId) {
      const r = data.reminders.find(x => x.id === editingId);
      if (!r) { resetForm(); return; }
      Object.assign(r, { title, when, notes, repeat, category, priority, place });
      clearCompletion(r.id);
    } else {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID() : 'r' + Date.now() + Math.random();
      data.reminders.push({ id, title, when, notes, repeat, category, priority, place });
    }
    save(); resetForm(); renderReminders(); renderToday(); check();
    $('reminderFeedback').textContent = '✓ Promemoria salvato.';
  }

  function loadIntoForm(r) {
    editingId = r.id;
    $('reminderTitle').value = r.title;
    $('reminderWhen').value = r.when.slice(0, 16);
    $('reminderRepeat').value = r.repeat || 'once';
    $('reminderCategory').value = r.category || 'lavoro';
    $('reminderPriority').value = r.priority || 'normal';
    $('reminderPlace').value = r.place || 'any';
    $('reminderNotes').value = r.notes || '';
    $('reminderSubmit').textContent = 'Salva modifiche';
    $('cancelReminderEdit').classList.remove('hidden');
    $('reminderFeedback').textContent = 'Modifica: ' + r.title;
    view('reminders');
    $('reminderTitle').focus();
    $('reminderForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('reminderForm').addEventListener('submit', submitEnhancedReminder, true);
    $('cancelReminderEdit').addEventListener('click', resetForm);
    for (const id of ['reminderSearch', 'reminderFilter', 'reminderCategoryFilter']) {
      $(id).addEventListener(id === 'reminderSearch' ? 'input' : 'change', renderReminders);
    }
    document.addEventListener('click', function (event) {
      const btn = event.target.closest?.('button[data-edit],button[data-snooze],button[data-reopen]');
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const id = btn.dataset.edit || btn.dataset.snooze || btn.dataset.reopen;
      const r = data.reminders.find(x => x.id === id);
      if (!r) return;
      if (btn.hasAttribute('data-edit')) {
        loadIntoForm(r);
      } else if (btn.hasAttribute('data-snooze')) {
        data.snoozes[id] = Date.now() + 10 * 60000;
        save(); renderReminders(); renderToday();
      } else if (btn.hasAttribute('data-reopen')) {
        clearCompletion(id);
        save(); renderReminders(); renderToday(); check();
      }
    }, true);
    renderReminders();
    renderToday();
  });

  // Il codice di base gestisce i backup: queste proprietà restano nel JSON.
  // Non effettua timbratura sul servizio aziendale né esegue servizi in background.
})();
