
'use strict';
const AUTH_SESSION_KEY='pure_auth_session';
const PERSISTENT_AUTH_KEY='pure_auth_session_persistent';
const currentAuth=sessionStorage.getItem(AUTH_SESSION_KEY);
const persistentAuth=localStorage.getItem(PERSISTENT_AUTH_KEY);
if(!currentAuth && persistentAuth)sessionStorage.setItem(AUTH_SESSION_KEY,persistentAuth);
else if(currentAuth && !persistentAuth)localStorage.setItem(PERSISTENT_AUTH_KEY,currentAuth);
const $=id=>document.getElementById(id);let mode='login',available=false,signup=false;const params=new URLSearchParams(location.search);const token=params.get('token');const path=location.pathname;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);$('status').classList.toggle('hidden',!message)}
function afterAuth(){
  const raw=params.get('next');
  try{
    const target=new URL(raw||'./',location.href);
    if(target.origin===location.origin && /\/share\.html$/.test(target.pathname) && target.searchParams.get('token')){
      location.replace(target.pathname+target.search);
      return;
    }
  }catch(e){}
  location.replace('./');
}function show(next){mode=next;status('');const copy={login:['Accedi al tuo account','Inserisci le tue credenziali.','Accedi'],register:['Crea un account','Riceverai un link per confermare la tua email.','Registrati'],forgot:['Recupera la password','Ti invieremo un link per impostarne una nuova.','Invia il link'],verify:['Conferma la tua email','Conferma la registrazione in modo sicuro.','Conferma email'],reset:['Imposta una nuova password','Scegli una password di almeno 12 caratteri.','Salva nuova password'],profile:['Accesso effettuato','Il tuo account è stato verificato.','Esci dall’account']}[next];$('heading').textContent=copy[0];$('subtitle').textContent=copy[1];$('submit').textContent=copy[2];$('emailField').classList.toggle('hidden',['verify','reset','profile'].includes(next));$('passwordField').classList.toggle('hidden',['verify','forgot','profile'].includes(next));$('passwordLabel').textContent=next==='reset'?'Nuova password':'Password';$('password').autocomplete=next==='login'?'current-password':'new-password';$('links').classList.toggle('hidden',['verify','reset','profile'].includes(next));$('disabled').classList.toggle('hidden',available&&(next!=='register'||signup));$('submit').disabled=(!available)||(next==='register'&&!signup);}
async function api(endpoint,body,auth){const headers={'Content-Type':'application/json'};if(auth)headers.Authorization='Bearer '+auth;let response=await fetch('https://pure-promemoria.duckdns.org/api/auth/'+endpoint,{method:'POST',headers,body:JSON.stringify(body||{})});let value=await response.json().catch(()=>({}));if(!response.ok)throw Error(typeof value.detail==='string'?value.detail:'Richiesta non riuscita ('+response.status+')');return value;}
$('login').onclick=()=>show('login');$('register').onclick=()=>show('register');$('forgot').onclick=()=>show('forgot');
$('form').addEventListener('submit',async event=>{event.preventDefault();if(!available)return;let email=$('email').value.trim(),password=$('password').value;let data={email,password};$('submit').disabled=true;status('Operazione in corso…');try{let result;if(mode==='register'){result=await api('register',data);status(result.message||'Se possibile, riceverai una email di verifica.')}else if(mode==='login'){result=await api('login',data);sessionStorage.setItem('pure_auth_session',result.access_token);localStorage.setItem(PERSISTENT_AUTH_KEY,result.access_token);afterAuth()}else if(mode==='forgot'){result=await api('forgot-password',{email});status(result.message||'Controlla la tua email.')}else if(mode==='verify'){result=await api('verify-email',{token});status(result.message||'Email verificata.');history.replaceState({},'',location.pathname);setTimeout(()=>show('login'),1800)}else if(mode==='reset'){result=await api('reset-password',{token,password});status(result.message||'Password aggiornata.');history.replaceState({},'',location.pathname);setTimeout(()=>show('login'),1800)}else if(mode==='profile'){let t=sessionStorage.getItem('pure_auth_session');await api('logout',{},t);sessionStorage.removeItem('pure_auth_session');localStorage.removeItem(PERSISTENT_AUTH_KEY);show('login');status('Disconnessione effettuata.')}}catch(e){status(e.message,true)}finally{$('submit').disabled=!available||(mode==='register'&&!signup)}});
async function restorePersistentSession(){
  const stored=localStorage.getItem(PERSISTENT_AUTH_KEY);
  if(!stored)return false;
  try{
    const response=await fetch('https://pure-promemoria.duckdns.org/api/auth/me',{headers:{Authorization:'Bearer '+stored},cache:'no-store'});
    if(response.ok){
      sessionStorage.setItem(AUTH_SESSION_KEY,stored);
      show('profile');
      status('Sei già autenticato.');
      return true;
    }
  }catch(e){}
  localStorage.removeItem(PERSISTENT_AUTH_KEY);
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  return false;
}
(async()=>{if(await restorePersistentSession())return;if(token&&/^\/verify-email(?:\.html|\/)?$/.test(path))show('verify');else if(token&&/^\/reset-password(?:\.html|\/)?$/.test(path))show('reset');else show('login');try{let r=await fetch('https://pure-promemoria.duckdns.org/api/auth/status',{cache:'no-store'});let j=await r.json();available=r.ok&&j.status==='ready';signup=j.registration_enabled===true;if(!available)status('Gli account non sono ancora attivi. I tuoi promemoria locali rimangono disponibili nella pagina principale.');show(mode)}catch(e){available=false;show(mode);status('Impossibile contattare il servizio account.',true)}})();


/* GOOGLE_LOGIN_V1 */
(() => {
  const form = $('form');
  if (!form) return;

  const box = document.createElement('div');
  box.id = 'googleLoginBox';
  box.style.cssText = 'margin-top:14px;display:none;text-align:center';

  const divider = document.createElement('div');
  divider.textContent = 'oppure';
  divider.style.cssText = 'margin:10px 0;color:#777;font-size:.9rem';

  const button = document.createElement('div');
  button.id = 'googleButton';

  box.append(divider, button);
  form.appendChild(box);

  let configured = false;

  function updateVisibility() {
    box.style.display = mode === 'login' && available && configured ? 'block' : 'none';
  }

  function finishLogin(result) {
    sessionStorage.setItem(AUTH_SESSION_KEY, result.access_token);
    localStorage.setItem(PERSISTENT_AUTH_KEY, result.access_token);
    afterAuth();
  }

  async function googleCallback(response) {
    try {
      status('Accesso Google in corso…');
      const result = await api('google', {credential: response.credential});
      finishLogin(result);
    } catch (error) {
      status(error.message || 'Accesso Google non riuscito.', true);
    }
  }

  async function initGoogle() {
    try {
      const response = await fetch('https://pure-promemoria.duckdns.org/api/auth/google-config', {
        cache: 'no-store'
      });
      if (!response.ok) return;

      const config = await response.json();
      if (!config.client_id) return;

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        if (!window.google || !google.accounts || !google.accounts.id) return;

        google.accounts.id.initialize({
          client_id: config.client_id,
          callback: googleCallback
        });

        google.accounts.id.renderButton(button, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 280
        });

        configured = true;
        updateVisibility();
      };

      document.head.appendChild(script);
    } catch (error) {
      // Il login email/password rimane disponibile.
    }
  }

  ['login', 'register', 'forgot'].forEach(id => {
    const element = $(id);
    if (element) {
      element.addEventListener('click', () => setTimeout(updateVisibility, 0));
    }
  });

  const timer = setInterval(updateVisibility, 200);
  setTimeout(() => clearInterval(timer), 15000);

  initGoogle();
})();
