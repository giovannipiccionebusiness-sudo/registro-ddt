/* Shared DDT scan status; hourly execution is owned by Apps Script. */
'use strict';
const DDT_SYNC_RANGE="'DDTSync'!B2:B4";
async function readDDTSync(){
 const values=(await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+encodeURIComponent(DDT_SYNC_RANGE))).values||[];
 const parse=i=>{try{return JSON.parse(values[i]?.[0]||'null');}catch{return null;}};
 return{auto:parse(0),manual:parse(1),schedule:parse(2)};
}
async function writeManualDDTSync(value){
 await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+encodeURIComponent("'DDTSync'!B3")+'?valueInputOption=RAW',jsonOptions('PUT',{values:[[JSON.stringify(value)]]}));
}
const originalDDTFolderScan=scanDDTFolder;
scanDDTFolder=async function(progress=()=>{},shouldStop=()=>false){
 const state=await readDDTSync();
 const active=r=>r?.status==='running'&&Date.now()-Date.parse(r.heartbeatAt||r.startedAt)<(r.source==='auto'?420000:120000);
 if(active(state.auto)||active(state.manual))throw Error('È già in corso una lettura DDT. Attendi il termine e aggiorna.');
 const report={source:'manual',status:'running',startedAt:new Date().toISOString(),heartbeatAt:new Date().toISOString(),lastCompletedAt:state.manual?.lastCompletedAt||'',registered:0,skipped:0,duplicates:0,errors:[]};
 await writeManualDDTSync(report);
 let heartbeatWrites=Promise.resolve();
 const timer=setInterval(()=>{report.heartbeatAt=new Date().toISOString();const snapshot={...report};heartbeatWrites=heartbeatWrites.then(()=>writeManualDDTSync(snapshot)).catch(console.warn);},30000);
 try{
  const out=await originalDDTFolderScan(progress,shouldStop);
  Object.assign(report,{status:out.stopped?'interrupted':out.errors.length?'partial':'completed',registered:out.registered,skipped:out.skipped,duplicates:out.duplicates.length,errors:out.errors.slice(0,30)});
  return out;
 }catch(error){report.status='error';report.message=error.message;throw error;}
 finally{
  clearInterval(timer);await heartbeatWrites;report.finishedAt=new Date().toISOString();
  if(report.status==='completed')report.lastCompletedAt=report.finishedAt;
  try{await writeManualDDTSync(report);}catch(error){toast('Lettura eseguita, ma salvataggio dell’orario non riuscito: '+error.message);}
  await refreshDDTSync();
 }
};
let ddtSyncReading=false,ddtSyncObserved='';
function formatDDTSyncDate(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'medium',timeZone:'Europe/Rome'}).format(d):'';}
async function refreshDDTSync(refreshRows=false){
 const box=document.getElementById('ddtSyncStatus');if(!box||ddtSyncReading)return;
 if(!hasSession()){box.textContent='Accedi con Google per vedere l’ultima lettura DDT.';return;}
 ddtSyncReading=true;
 try{
  const s=await readDDTSync(),runs=[s.auto,s.manual].filter(Boolean),finished=runs.filter(r=>r.finishedAt).sort((a,b)=>Date.parse(b.finishedAt)-Date.parse(a.finishedAt));
  const last=finished[0],completed=runs.map(r=>r.lastCompletedAt||(r.status==='completed'?r.finishedAt:'')).filter(Boolean).sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
  const running=runs.find(r=>r.status==='running'&&Date.now()-Date.parse(r.heartbeatAt||r.startedAt)<(r.source==='auto'?420000:120000));
  const lines=[s.schedule?.enabled?'Lettura automatica ogni ora · attiva anche con app chiusa':'Lettura automatica non attiva'];
  lines.push(completed?'Ultima lettura completata: '+formatDDTSyncDate(completed):'Nessuna lettura completata registrata.');
  if(running)lines.push('Lettura '+(running.source==='auto'?'automatica':'manuale')+' in corso…');
  else if(last){
   const label=last.status==='completed'?'Completata':last.status==='partial'?'Completata con elementi da verificare':last.status==='interrupted'?'Interrotta':'Non riuscita';
   lines.push('Ultimo controllo '+(last.source==='auto'?'automatico':'manuale')+': '+formatDDTSyncDate(last.finishedAt)+' · '+label+' · '+(last.registered||0)+' DDT aggiunti'+(last.duplicates?' · '+last.duplicates+' possibili duplicati':'')+(last.errors?.length?' · '+last.errors.length+' errori':''));
   if(last.message)lines.push(last.message);
  }else if(runs.some(r=>r.status==='running'))lines.push('La lettura precedente non risulta terminata. Verrà ritentata al prossimo controllo.');
  box.textContent=lines.join('\n');
  const observed=s.auto?.finishedAt||'';
  if(refreshRows&&observed&&observed!==ddtSyncObserved&&!folderBatchBusy&&!selected){ddtSyncObserved=observed;await refresh();}
  else ddtSyncObserved=observed;
 }catch(error){box.textContent='Stato lettura DDT non disponibile. Premi Aggiorna per riprovare.';console.warn('Stato DDT:',error.message);}
 finally{ddtSyncReading=false;}
}
const refreshBeforeDDTSync=refresh;
refresh=async function(){await refreshBeforeDDTSync();await refreshDDTSync();};
setInterval(()=>{if(document.visibilityState==='visible')refreshDDTSync(true);},60000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDDTSync(true);});
refreshDDTSync();
