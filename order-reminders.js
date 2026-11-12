'use strict';
var OrderReminders=(()=>{
 const endpoint='https://script.google.com/macros/s/AKfycbyTV9tRU9WmmYjt1n2ayLRNck3QxOyVw_bq40FYYIXXcbr6o7GoVhiYMFkMl5VuqURy/exec';
 let dialog,ui,current;
 const requests=new Map();
 function setup(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.className='order-dialog registry-reminder-dialog';dialog.setAttribute('aria-labelledby','registryReminderTitle');
  const header=document.createElement('div');header.className='order-dialog-header';
  const title=document.createElement('h2');title.id='registryReminderTitle';
  const close=document.createElement('button');close.className='btn';close.type='button';close.textContent='Chiudi ×';close.onclick=()=>dialog.close();header.append(title,close);
  const order=document.createElement('p');order.className='registry-reminder-summary';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const recipients=document.createElement('div');recipients.className='registry-reminder-recipients';
  const send=document.createElement('button');send.className='btn primary';send.type='button';send.textContent='Invia notifica push';send.hidden=true;send.onclick=sendPush;
  const note=document.createElement('p');note.className='order-note';
  const history=document.createElement('details');const historyTitle=document.createElement('summary');historyTitle.textContent='Storico notifiche push';const attempts=document.createElement('ul');history.append(historyTitle,attempts);history.hidden=true;
  dialog.append(header,order,status,recipients,send,note,history);document.body.append(dialog);
  ui={title,close,order,status,recipients,send,note,history,attempts};
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('cancel',event=>{if(current?.sending)event.preventDefault();});
  dialog.addEventListener('close',()=>{current?.controller.abort();current=undefined;recipients.replaceChildren();attempts.replaceChildren();});
 }
 async function api(action,fields={},signal){
  if(!hasSession())throw Error('Accedi con Google per preparare il sollecito.');
  const token=accessToken;
  const body=new URLSearchParams({action,googleToken:token,...fields});
  const response=await fetch(endpoint,{method:'POST',body,signal,cache:'no-store'});
  if(!hasSession()||accessToken!==token)throw Error('La sessione Google è cambiata. Chiudi e riapri il sollecito.');
  if(!response.ok)throw Error('Servizio solleciti non raggiungibile.');
  const result=await response.json();
  if(!result.ok)throw Error(result.error||'Sollecito non disponibile.');
  return result;
 }
 function message(order,recipient){
  const url=new URL('https://giovannipiccionebusiness-sudo.github.io/magazzini-dussmann/');url.searchParams.set('ordine-ddt',order.id);
  return ['📦 *MAGAZZINI DUSSMANN*','*Verifica consegna e caricamento DDT*','','Ciao '+recipient.name+'!',
   '📍 *Sede:* '+order.sede,'📄 *Ordine:* '+order.number,'🏢 *Fornitore:* '+order.company,'',
   'Puoi verificare se è arrivata la merce di questo ordine?','✅ *Merce arrivata:* carica il DDT nell’app.',
   '⚠️ *DDT mancante o merce non arrivata:* contatta il responsabile.','','👇 *Apri il PDF dell’ordine e carica il DDT*',url.href,'',
   'Accedi con il tuo account Magazzini Dussmann.'].join('\n');
 }
 function renderAttempts(attempts){
  ui.attempts.replaceChildren();const labels={accepted:'Accettata dal servizio push',expired:'Iscrizione scaduta',failed:'Non inviata',pending:'Esito da verificare'};
  for(const attempt of attempts||[]){const item=document.createElement('li');item.textContent=[attempt.name,new Date(attempt.date).toLocaleString('it-IT',{timeZone:'Europe/Rome'}),labels[attempt.status]||'Esito da verificare'].join(' · ');ui.attempts.append(item);}
  ui.history.hidden=!ui.attempts.childElementCount;
 }
 function selectedIds(){return Array.from(ui.recipients.querySelectorAll('input:checked'),input=>Number(input.value));}
 function renderRecipients(state,result){
  for(const recipient of result.recipients){
   const item=document.createElement(state.channel==='push'?'label':'section');item.className='registry-reminder-contact';
   if(state.channel==='push'){const input=document.createElement('input');input.type='checkbox';input.value=recipient.id;input.onchange=()=>{ui.send.disabled=state.sending||!selectedIds().length;};item.append(input);}
   const info=document.createElement('div');const name=document.createElement('strong');name.textContent=recipient.name;info.append(name);item.append(info);
   if(state.channel==='whatsapp'){
    const valid=/^\+39\d{10}$/.test(recipient.phone||'');const phone=document.createElement('p');phone.className='order-note';phone.textContent=valid?recipient.phone:'Numero WhatsApp non ancora configurato.';info.append(phone);
    if(valid){
     const link=document.createElement('a');link.className='btn registry-whatsapp-link';link.target='_blank';link.rel='noopener noreferrer';link.href='https://wa.me/'+recipient.phone.slice(1)+'?text='+encodeURIComponent(message(result.order,recipient));
     link.textContent='💬 Apri WhatsApp';link.setAttribute('aria-label','Apri WhatsApp per '+recipient.name);item.append(link);
     const preview=document.createElement('details');const caption=document.createElement('summary');caption.textContent='Anteprima messaggio';const text=document.createElement('p');text.className='registry-reminder-text';text.textContent=message(result.order,recipient);preview.append(caption,text);item.append(preview);
    }
   }
   ui.recipients.append(item);
  }
 }
 async function open(order,channel){
  setup();if(current?.sending)return;current?.controller.abort();
  const state=current={id:order.id,channel:channel==='push'?'push':'whatsapp',controller:new AbortController(),sending:false};
  ui.title.textContent=state.channel==='push'?'Sollecito con notifica push':'Richiedi DDT su WhatsApp';
  ui.order.textContent=[order.number,order.company,order.site].filter(Boolean).join(' · ');ui.status.textContent='Verifica dell’ordine e dei destinatari…';ui.recipients.replaceChildren();ui.history.hidden=true;ui.attempts.replaceChildren();ui.send.hidden=true;ui.send.disabled=true;ui.close.disabled=false;
  ui.note.textContent=state.channel==='push'?'Seleziona gli operatori e conferma l’invio della notifica.':'Controlla destinatario e messaggio in WhatsApp. Premi Invia quando sei pronto.';
  if(!dialog.open)dialog.showModal();ui.close.focus();
  const timeout=setTimeout(()=>state.controller.abort(),30000);
  try{
   const result=await api('registryDdtInfo',{id:state.id,channel:state.channel},state.controller.signal);if(current!==state)return;
   if(result.hasDdt){ui.status.textContent='DDT già presente: non occorre inviare un sollecito.';return;}
   ui.order.textContent=[result.order.number,result.order.company,result.order.sede].join(' · ');
   ui.status.textContent=result.recipients.length?'Referenti della sede':'Nessun operatore attivo assegnato a questa sede.';
   renderRecipients(state,result);renderAttempts(result.attempts);
   ui.send.hidden=state.channel!=='push'||!result.recipients.length;
  }catch(error){if(current===state)ui.status.textContent=error.name==='AbortError'?'Servizio non raggiungibile. Chiudi e riprova.':error.message;}
  finally{clearTimeout(timeout);}
 }
 async function sendPush(){
  const state=current;if(!state||state.channel!=='push'||state.sending)return;const recipients=selectedIds();if(!recipients.length)return;
  if(!window.confirm('Inviare il sollecito push ai destinatari selezionati?'))return;
  const key=JSON.stringify([state.id,recipients.slice().sort((a,b)=>a-b)]);if(!requests.has(key))requests.set(key,crypto.randomUUID());
  state.sending=true;ui.send.disabled=true;ui.close.disabled=true;ui.status.textContent='Invio in corso…';
  try{
   const result=await api('registryDdtSend',{id:state.id,requestId:requests.get(key),recipients:JSON.stringify(recipients)});
   requests.delete(key);if(current!==state)return;
   ui.status.textContent='Accettate dal servizio: '+result.accepted+' · Non confermate: '+result.unsuccessful+' · Lavoratori senza dispositivo: '+result.noDevice;
  }catch(error){if(current===state)ui.status.textContent=error.message;}
  finally{if(current===state){state.sending=false;ui.close.disabled=false;ui.send.disabled=!selectedIds().length;}}
 }
 return {open};
})();
