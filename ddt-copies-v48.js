/* Email copies of protocolled N154 documents; templates and history stay in the private register. */
'use strict';
const DDTCopies={queue:[],config:null,record:null};
function ddtCopyKey(r){return JSON.stringify([r.name,r.ddt,r.cdc,r.protocol,r.url].map(String));}
function ddtCopyEligible(r){return r&&r.cdc==='N154'&&isDone(r)&&Boolean(r.protocol&&safeDrive(r.url));}
function ddtCopyTemplate(text,r){const values={fornitore:r.company,ddt:r.ddt,data:r.date,cdc:r.cdc,protocollo:r.protocol,ordine:r.order};return String(text||'').replace(/\{(fornitore|ddt|data|cdc|protocollo|ordine)\}/g,(_,key)=>values[key]||'—');}
async function loadDDTCopies(){
 const [cfg,queue]=await Promise.all([ordersRead('CopieDDTConfig','A1:B5'),ordersRead('CopieDDTInvii','A:R')]);
 if(cfg[0]?.[0]!=='Voce'||queue[0]?.[0]!=='ID documento')throw Error('Configurazione invio copie non disponibile.');
 DDTCopies.config=Object.fromEntries(cfg.slice(1));DDTCopies.queue=queue.slice(1);
 return DDTCopies;
}
function ddtCopyExisting(r){return DDTCopies.queue.filter(q=>q[0]===ddtCopyKey(r)&&['IN_CODA','IN_INVIO','INVIATO','DA_VERIFICARE'].includes(q[14])).at(-1);}
function ddtCopyStatus(q){if(!q)return 'Copia non ancora richiesta.';const labels={IN_CODA:'In attesa di invio (entro circa 5 minuti)',IN_INVIO:'Invio in corso',INVIATO:'Copia inviata',DA_VERIFICARE:'Invio da verificare: controlla la Posta inviata',ERRORE:'Invio non riuscito',ANNULLATO:'Richiesta duplicata annullata'};return (labels[q[14]]||q[14])+(q[15]?' · '+new Date(q[15]).toLocaleString('it-IT',{timeZone:'Europe/Rome'}):'')+(q[16]?'\n'+q[16]:'');}
async function openDDTCopy(r){
 if(!live||!hasSession()||!ddtCopyEligible(r))return toast('Seleziona un DDT protocollato del CDC N154 con registro collegato.');
 DDTCopies.record={...r};const dialog=$('ddtCopyDialog');dialog.showModal();$('copySend').disabled=true;$('copySaveTemplate').disabled=true;$('copyMessage').textContent='Caricamento impostazioni e storico…';
 try{
  await loadDDTCopies();if(!dialog.open)return;
  const cfg=DDTCopies.config,q=ddtCopyExisting(r);
  $('copyTo').value=cfg['Destinatario N154']||'';
  $('copySubjectTemplate').value=cfg.Oggetto||'';$('copyBodyTemplate').value=cfg.Testo||'';
  $('copySubject').value=ddtCopyTemplate(cfg.Oggetto,r);$('copyBody').value=ddtCopyTemplate(cfg.Testo,r);
  $('copyAttachment').textContent='PDF allegato: '+r.company+' · DDT '+r.ddt+' · Protocollo '+r.protocol;
  $('copyMessage').textContent=ddtCopyStatus(q);$('copySend').disabled=!!q||cfg.Stato!=='ATTIVO';$('copySaveTemplate').disabled=false;
 }catch(error){$('copyMessage').textContent=error.message;}
}
async function queueDDTCopy(){
 const r=DDTCopies.record;if(!r||!ddtCopyEligible(r))return;
 $('copySend').disabled=true;
 try{
  await checkSnapshot(r);await loadDDTCopies();const existing=ddtCopyExisting(r);if(existing)throw Error(ddtCopyStatus(existing));
  const cfg=DDTCopies.config,to=String(cfg['Destinatario N154']||'').trim(),subject=$('copySubject').value.trim(),body=$('copyBody').value.trim();
  if(cfg.Stato!=='ATTIVO'||!/^cappelluti@dussmann\.it$/i.test(to))throw Error('Invio N154 non attivo o destinatario non valido.');
  if(!subject||subject.length>200||/[\r\n]/.test(subject)||!body||body.length>20000)throw Error('Inserisci oggetto e testo validi.');
  await checkSnapshot(r);
  const values=[[ddtCopyKey(r),new Date().toISOString(),r.row,r.name,r.company,r.ddt,r.date,r.cdc,r.order,r.protocol,r.url,to,subject,body,'IN_CODA','','','']];
  await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+orderRange('CopieDDTInvii','A:R')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',jsonOptions('POST',{values}));
  $('copyMessage').textContent='Richiesta registrata. La copia con PDF allegato sarà inviata entro circa 5 minuti. Riapri questa finestra per controllare l’esito.';toast('Copia email in attesa di invio.');
 }catch(error){$('copyMessage').textContent=error.message+'\nAggiorna lo storico prima di riprovare.';}
}
function mountDDTCopyAction(){
 let section=$('ddtCopyAction');if(!section){section=document.createElement('section');section.id='ddtCopyAction';section.className='field';$('protocolBox').before(section);}
 section.hidden=!ddtCopyEligible(selected);section.replaceChildren();if(section.hidden)return;
 const button=document.createElement('button');button.className='btn primary';button.textContent='Invia copia email · CDC N154';button.disabled=!live||!hasSession();button.onclick=()=>openDDTCopy(selected);section.append(button);
}
const openDetailBeforeCopies=openDetail;
openDetail=function(row){openDetailBeforeCopies(row);mountDDTCopyAction();};
$('copyClose').onclick=()=>$('ddtCopyDialog').close();$('copySend').onclick=queueDDTCopy;
$('copyRefresh').onclick=async()=>{try{await loadDDTCopies();const q=ddtCopyExisting(DDTCopies.record);$('copyMessage').textContent=ddtCopyStatus(q);$('copySend').disabled=!!q||DDTCopies.config.Stato!=='ATTIVO';}catch(error){$('copyMessage').textContent=error.message;}};
$('copySaveTemplate').onclick=async()=>{
 $('copySaveTemplate').disabled=true;
 try{
 const subject=$('copySubjectTemplate').value.trim(),body=$('copyBodyTemplate').value.trim();
 if(!subject||subject.length>200||/[\r\n]/.test(subject)||!body||body.length>20000)throw Error('Compila oggetto e testo del modello.');
 await ordersWrite('CopieDDTConfig','B3:B4',[[subject],[body]]);
 $('copySubject').value=ddtCopyTemplate(subject,DDTCopies.record);$('copyBody').value=ddtCopyTemplate(body,DDTCopies.record);toast('Testo predefinito salvato per i prossimi invii N154.');
 }catch(error){$('copyMessage').textContent=error.message;}finally{$('copySaveTemplate').disabled=false;}
};
