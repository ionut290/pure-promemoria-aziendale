/* Dashboard Oggi: calendario, riepilogo e promemoria reali.
   Nessun dato fittizio; mantiene i dati dell'app originale in localStorage. */
(() => {
  'use strict';
  const asDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const key = d => String(d.getFullYear()) + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
  const shortDate = (d, withYear = false) => d.toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? {year: 'numeric'} : {})
  });
  const longDate = d => d.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const iconFor = {mezzi:'▣',documenti:'▤',appuntamenti:'◎',personale:'♡',lavoro:'◷'};
  let selected = asDay(new Date());
  let calendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);

  function startsOn(r) {
    const dt = new Date(r.when);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
  function recurrenceOn(r, d) {
    const first = startsOn(r);
    if (!first || asDay(first) > asDay(d)) return false;
    const repeat = r.repeat || 'once';
    if (repeat === 'once') return sameDay(first,d);
    if (repeat === 'daily') return true;
    if (repeat === 'workdays') return d.getDay() !== 0 && d.getDay() !== 6;
    if (repeat === 'weekly') return first.getDay() === d.getDay();
    if (repeat === 'monthly') return first.getDate() === d.getDate();
    return false;
  }
  function completedOn(r, d) {
    if ((r.repeat || 'once') === 'once') return !!data.completed?.once?.[r.id];
    return !!data.completed?.[key(d)]?.[r.id];
  }
  function scheduledOn(d) {
    const isCurrent = sameDay(d, new Date());
    const arr = (data.reminders || []).filter(r => {
      const first = startsOn(r);
      if (!first) return false;
      if (recurrenceOn(r,d)) return true;
      // Mostra anche le attività una tantum scadute e non completate quando si visualizza oggi.
      return isCurrent && (r.repeat || 'once') === 'once' && first < asDay(d)
        && !completedOn(r,d);
    });
    return arr.sort((a,b) => {
      const pa = a.priority === 'high' ? 0 : a.priority === 'low' ? 2 : 1;
      const pb = b.priority === 'high' ? 0 : b.priority === 'low' ? 2 : 1;
      if (pa !== pb) return pa-pb;
      const da = startsOn(a),db = startsOn(b);
      return (da.getHours()*60+da.getMinutes()) - (db.getHours()*60+db.getMinutes());
    });
  }
  function countUnfinished() {
    return (data.reminders || []).filter(r => {
      if ((r.repeat || 'once') === 'once') return !completedOn(r,new Date());
      return !completedOn(r,new Date());
    }).length;
  }
  function renderCalendar() {
    const month = $('calendarMonth');
    const grid = $('calendarGrid');
    if (!grid || !month) return;
    month.textContent = calendarMonth.toLocaleDateString('it-IT',{month:'long',year:'numeric'})
      .replace(/^./,x=>x.toUpperCase());
    const origin = new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);
    const firstMonday = new Date(origin);
    firstMonday.setDate(origin.getDate() - (origin.getDay()+6)%7);
    const lastDay = new Date(origin.getFullYear(),origin.getMonth()+1,0).getDate();
    const count = (lastDay + (origin.getDay()+6)%7) > 35 ? 42 : 35;
    let html = '';
    for (let i=0;i<count;i++) {
      const d=new Date(firstMonday.getFullYear(),firstMonday.getMonth(),firstMonday.getDate()+i);
      const tasks=scheduledOn(d);
      const high=tasks.some(x=>x.priority === 'high'&&!completedOn(x,d));
      const classes=['calendar-day'];
      if (d.getMonth()!==calendarMonth.getMonth()) classes.push('outside');
      if (sameDay(d,new Date())) classes.push('today');
      if (sameDay(d,selected)) classes.push('selected');
      html += '<button type="button" role="gridcell" class="'+classes.join(' ')+'" data-calendar-date="'+key(d)+'"'
        +' aria-selected="'+sameDay(d,selected)+'" aria-label="'+esc(longDate(d))+'">'
        + d.getDate() + (tasks.length?'<span class="cal-dot'+(high?' high':'')+'"></span>':'')+'</button>';
    }
    grid.innerHTML=html;
  }
  function renderAgenda() {
    const agenda=$('todayReminders');
    if(!agenda) return;
    $('selectedDayLabel').textContent=(sameDay(selected,new Date())?'Oggi, ':'')
      +selected.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
    $('agendaSubtitle').textContent=sameDay(selected,new Date())
      ?'I tuoi promemoria per oggi':'I tuoi promemoria per '+shortDate(selected);
    const tasks=scheduledOn(selected);
    $('goReminders').textContent='＋ Aggiungi promemoria'+(sameDay(selected,new Date())?' per oggi':'');
    if(!tasks.length){
      agenda.innerHTML='<div class="agenda-empty"><span class="empty-icon" aria-hidden="true">▦</span>'
        +'Nessun promemoria per questa data.<br>Puoi aggiungerne uno qui sotto.</div>';
      return;
    }
    agenda.innerHTML=tasks.slice(0,8).map(r=>{
      const dt=startsOn(r),done=completedOn(r,selected);
      const priority=r.priority==='high';
      const time=dt.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
      const overdue=(r.repeat||'once')==='once'&&!sameDay(dt,selected);
      return '<div class="agenda-item'+(done?' finished':'')+'">'
        +'<div class="agenda-item-icon" aria-hidden="true">'+(iconFor[r.category]||'◷')+'</div>'
        +'<div class="agenda-item-main"><div class="agenda-item-title">'+esc(r.title)+'</div>'
        +'<div class="agenda-item-sub"><span>◷ '+esc(time)+'</span>'
        +(overdue?'<span>In ritardo</span>':'')
        +'<span class="agenda-priority'+(priority?' high':'')+'">'
        +(priority?'Priorità alta':r.priority==='low'?'Bassa':'Normale')+'</span></div></div>'
        +'<input class="agenda-check" type="checkbox" data-agenda-complete="'+esc(r.id)+'"'
        +(done?' checked':'')+' aria-label="Segna come '+(done?'da fare':'completato')+': '+esc(r.title)+'"></div>';
    }).join('');
    if(tasks.length>8)agenda.innerHTML+='<p class="agenda-more">Altri '+(tasks.length-8)+' promemoria. Apri la scheda Promemoria per vederli tutti.</p>';
  }
  function nextOccurrence(r) {
    const first=startsOn(r);
    if(!first)return null;
    const now=new Date();
    if ((r.repeat||'once')==='once'){
      if(first<=now||completedOn(r,first))return null;
      return first;
    }
    for(let i=0;i<120;i++){
      const d=asDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()+i));
      if(!recurrenceOn(r,d)||completedOn(r,d))continue;
      d.setHours(first.getHours(),first.getMinutes(),0,0);
      if(d>now)return d;
    }
    return null;
  }
  function renderUpcoming(){
    const node=$('upcomingReminders');
    if(!node)return;
    const tasks=(data.reminders||[]).map(r=>({r,next:nextOccurrence(r)}))
      .filter(x=>x.next).sort((a,b)=>a.next-b.next).slice(0,4);
    if(!tasks.length){
      node.innerHTML='<div class="upcoming-empty"><span aria-hidden="true">◷</span>'
        +'Nessun promemoria in programma.<br>Creane uno nella scheda Promemoria.</div>';
      return;
    }
    node.innerHTML=tasks.map(x=>{
      const r=x.r;
      return '<div class="upcoming-item">'
        +'<div class="upcoming-item-icon" aria-hidden="true">'+(iconFor[r.category]||'▤')+'</div>'
        +'<div class="upcoming-body"><div class="upcoming-title">'+esc(r.title)+'</div>'
        +'<div class="upcoming-date">▦ '+esc(shortDate(x.next,true))+' · '
        +x.next.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'</div></div>'
        +'<span class="upcoming-priority'+(r.priority==='high'?' high':'')+'">'
        +(r.priority==='high'?'Alta':r.priority==='low'?'Bassa':'Normale')+'</span></div>';
    }).join('');
  }
  function renderDashboard(){
    renderCalendar();renderAgenda();renderUpcoming();
    $('activeRemindersCount').textContent=String(countUnfinished());
    const due=scheduledOn(new Date()).filter(r=>!completedOn(r,new Date())).length;
    const done=scheduledOn(new Date()).filter(r=>completedOn(r,new Date())).length;
    $('dashboardProgress').textContent=due+' da fare · '+done+' completati';
  }
  function goAdd(){
    view('reminders');
    const input=$('reminderWhen');
    if(input && !sameDay(selected,new Date())){
      input.value=key(selected)+'T09:00';
    }
    $('reminderTitle').focus();
    $('reminderForm').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function completeFromCalendar(id){
    const r=data.reminders.find(x=>x.id===id);
    if(!r)return;
    const wasDone=completedOn(r,selected);
    if((r.repeat||'once')==='once'){
      data.completed.once ??= {};
      if(wasDone)delete data.completed.once[id];else data.completed.once[id]=true;
    }else{
      const k=key(selected);
      data.completed[k] ??= {};
      if(wasDone)delete data.completed[k][id];else data.completed[k][id]=true;
    }
    if(data.snoozes)delete data.snoozes[id];
    save();
    if(alarm?.type==='reminder'&&alarm.id===id&&typeof closeAlarm==='function')closeAlarm();
    renderReminders();
    renderToday();
  }
  const originalRenderToday=renderToday;
  renderToday=function(){
    originalRenderToday();
    renderDashboard();
  };
  document.addEventListener('DOMContentLoaded',()=>{
    $('heroAdd').addEventListener('click',()=>{selected=asDay(new Date());goAdd()});
    document.querySelector('[data-focus-reminder]')?.addEventListener('click',()=>{
      $('reminderTitle').focus();
      $('reminderForm').scrollIntoView({behavior:'smooth',block:'start'});
    });
    $('heroSettings').addEventListener('click',()=>view('settings'));
    $('activeRemindersOpen').addEventListener('click',()=>view('reminders'));
    $('priorityRemindersOpen').addEventListener('click',()=>{
      view('reminders');$('reminderFilter').value='high';renderReminders();
    });
    $('calendarToday').addEventListener('click',()=>{
      selected=asDay(new Date());calendarMonth=new Date(selected.getFullYear(),selected.getMonth(),1);renderDashboard();
    });
    $('calendarPrev').addEventListener('click',()=>{
      calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);renderCalendar();
    });
    $('calendarNext').addEventListener('click',()=>{
      calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);renderCalendar();
    });
    $('calendarGrid').addEventListener('click',e=>{
      const node=e.target.closest('[data-calendar-date]');
      if(!node)return;
      const parts=node.dataset.calendarDate.split('-').map(Number);
      selected=new Date(parts[0],parts[1]-1,parts[2]);
      calendarMonth=new Date(selected.getFullYear(),selected.getMonth(),1);
      renderDashboard();
    });
    $('goReminders').addEventListener('click',()=>goAdd());
    $('todayReminders').addEventListener('change',e=>{
      if(e.target.matches('[data-agenda-complete]'))completeFromCalendar(e.target.dataset.agendaComplete);
    });
    renderDashboard();
  });
})();
