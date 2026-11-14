(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  const auth = () => sessionStorage.getItem('pure_auth_session') || localStorage.getItem('pure_auth_session_persistent');

  function formatWhen(r){
    const d = new Date(r.when);
    if(Number.isNaN(d.getTime())) return r.when || '';
    return r.repeat === 'daily'
      ? 'Ogni giorno alle '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})
      : d.toLocaleString('it-IT',{dateStyle:'full',timeStyle:'short'});
  }

  async function main(){
    if(!token){$('state').textContent='Link non valido.';return}

    try{
      const response=await fetch('/api/share/'+encodeURIComponent(token),{cache:'no-store'});
      const value=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(value.detail||'Link non valido o scaduto.');

      const r=value.reminder||{};
      $('title').textContent=r.title||'Promemoria';
      $('when').textContent='Quando: '+formatWhen(r);
      $('repeat').textContent=r.repeat&&r.repeat!=='once'?'Ripetizione: '+r.repeat:'Una sola volta';
      $('notes').textContent=r.notes||'';
      $('preview').classList.remove('hidden');
      $('state').textContent='Puoi aggiungerla al tuo archivio personale.';

      const current=auth();
      if(current){
        $('accept').classList.remove('hidden');
        $('accept').onclick=async()=>{
          $('accept').disabled=true;
          $('accept').textContent='Aggiunta in corso…';
          try{
            const saved=await fetch('/api/share/'+encodeURIComponent(token)+'/accept',{
              method:'POST',
              headers:{Authorization:'Bearer '+current}
            });
            const result=await saved.json().catch(()=>({}));
            if(!saved.ok)throw Error(result.detail||'Impossibile aggiungere la promemoria.');
            $('state').textContent=result.added?'Promemoria aggiunta al tuo archivio.':'Questa promemoria era già presente.';
            $('accept').textContent='✓ Operazione completata';
          }catch(error){
            $('state').textContent=error.message;
            $('accept').disabled=false;
            $('accept').textContent='＋ Aggiungi alle mie promemoria';
          }
        };
      }else{
        const next='./share.html?token='+encodeURIComponent(token);
        $('login').href='./auth.html?next='+encodeURIComponent(next);
        $('login').classList.remove('hidden');
      }
    }catch(error){
      $('state').textContent=error.message||'Link non valido.';
    }
  }

  main();
})();
