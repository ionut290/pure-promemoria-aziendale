/* Pure Promemoria - sync manuale opt-in, senza salvataggi automatici. */
'use strict';
(() => {
  const AUTH_SESSION_KEY='pure_auth_session';
  const PERSISTENT_AUTH_KEY='pure_auth_session_persistent';
  const currentAuth=sessionStorage.getItem(AUTH_SESSION_KEY);
const persistentAuth=localStorage.getItem(PERSISTENT_AUTH_KEY);
if(!currentAuth && persistentAuth)sessionStorage.setItem(AUTH_SESSION_KEY,persistentAuth);
else if(currentAuth && !persistentAuth)localStorage.setItem(PERSISTENT_AUTH_KEY,currentAuth);
  const $c = id => document.getElementById(id);
  const status = s => { if ($c('cloudStatus')) $c('cloudStatus').textContent=s; };
  let token='', identity=null, version=null;
  const OWNER_KEY='pure_cloud_owner_v1';
  const owner=()=>localStorage.getItem(OWNER_KEY);
  const snap = () => JSON.parse(JSON.stringify(data));
  const valid = x => x && typeof x === 'object' && !Array.isArray(x) && x.settings && typeof x.settings==='object' && Array.isArray(x.reminders) && x.confirmations && typeof x.confirmations==='object';
  const backup = x => {const blob=new Blob([JSON.stringify(x,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pure-promemoria-backup-prima-cloud-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000)};
  const api = async (url, method='GET', payload) => {
    const headers={Authorization:'Bearer '+token};
    if(payload!==undefined)headers['Content-Type']='application/json';
    const res=await fetch('https://pure-promemoria.duckdns.org/api'+url,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store'});
    const obj=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(res.status===409?'Conflitto: dati cambiati da un altro dispositivo. Ricarica la pagina e riprova.':res.status===401?'Sessione scaduta. Effettua nuovamente l’accesso.':(obj.detail||'Errore HTTP '+res.status));
    return obj;
  };
  async function state(){
    token=sessionStorage.getItem('pure_auth_session')||'';
    $c('cloudUpload').disabled=$c('cloudDownload').disabled=$c('cloudLogout').disabled=true;
    if(!token){if(localStorage.getItem('pure-account-mode-v1') || owner())lockLocalAccount();status('Nessun account attivo. Gli archivi personali sono nascosti.');return;}
    try{
      identity=await api('/auth/me');
      switchLocalAccount(identity.id);
      const remote=await api('/data');
      version=remote.version;
      status('Account: '+identity.email+' · Sincronizzazione automatica attiva · Cloud autorevole · versione '+version);
      $c('cloudUpload').disabled=$c('cloudDownload').disabled=$c('cloudLogout').disabled=false;
    }catch(e){identity=null;status('Sincronizzazione automatica in attesa: '+e.message);}
  }
  async function upload(){
    if(!identity)return;
    $c('cloudUpload').disabled=true;
    try{
      const latest=await api('/data');
      if(latest.version!==version)throw Error('L’archivio online è cambiato. Aggiorna la pagina e verifica prima di salvare.');
      const local=snap();
      if(!valid(local))throw Error('Archivio locale non valido');
      if(!confirm('SALVA ONLINE per '+identity.email+'? Confermi che i promemoria LOCALI sono tuoi e devono appartenere a questo account? L’archivio cloud sara sostituito.'))return;
      backup(local);
      const result=await api('/data','PUT',{data:local,version});
      localStorage.setItem(OWNER_KEY,identity.id);
      version=result.version;
      status('Salvataggio cloud riuscito · versione '+version+' · account '+identity.email);
    }catch(e){status('Salvataggio non eseguito: '+e.message)}
    finally{$c('cloudUpload').disabled=false}
  }
  async function download(){
    if(!identity)return;
    $c('cloudDownload').disabled=true;
    try{
      const remote=await api('/data');
      if(!valid(remote.data)){status('Nessun archivio cloud disponibile per '+identity.email);return;}
      if(!confirm('RECUPERA ONLINE da '+identity.email+'? I dati locali saranno sostituiti. Prima verrà esportato un backup JSON: assicurati di conservarlo.'))return;
      backup(snap());
      data={settings:{...BASE.settings,...remote.data.settings},reminders:remote.data.reminders,confirmations:remote.data.confirmations,completed:remote.data.completed||{},snoozes:remote.data.snoozes||{}};
      if(!save())throw Error('Salvataggio locale fallito: usa il backup appena scaricato');
      localStorage.setItem(OWNER_KEY,identity.id);
      version=remote.version;
      closeAlarm(); fillSettings();startGps();renderToday();renderReminders();renderLog();
      status('Archivio recuperato e salvato nel browser · account '+identity.email);
    }catch(e){status('Recupero non completato: '+e.message)}
    finally{$c('cloudDownload').disabled=false}
  }
  async function logout(){
    if(!confirm('Uscire dall’account? I dati personali non saranno più mostrati nell’app. Rimarranno conservati in questo browser fino a una cancellazione manuale.'))return;
    try{await api('/auth/logout','POST',{})}catch(e){}
    sessionStorage.removeItem('pure_auth_session');localStorage.removeItem(PERSISTENT_AUTH_KEY);token='';identity=null;version=null;setHeaderAccount(false);lockLocalAccount();await state();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!$c('cloudUpload'))return;
    $c('cloudUpload').addEventListener('click',upload);
    $c('cloudDownload').addEventListener('click',download);
    $c('cloudLogout').addEventListener('click',logout);
    state();
  });
})();
