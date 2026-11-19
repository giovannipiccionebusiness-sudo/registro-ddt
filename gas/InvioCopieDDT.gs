/* Copies are sent only after an explicit request from the app. */
function copieDDTSS_(){return SpreadsheetApp.openById(DDT_HOURLY_SHEET);}
function copieDDTSetup(){
 const ss=copieDDTSS_();
 let cfg=ss.getSheetByName('CopieDDTConfig');
 if(!cfg){cfg=ss.insertSheet('CopieDDTConfig');cfg.getRange('A1:B5').setValues([
 ['Voce','Valore'],['Destinatario N154','Cappelluti@dussmann.it'],
 ['Oggetto','DDT protocollato {fornitore} n. {ddt} – CDC {cdc}'],
 ['Testo','Ciao Giovanni,\n\nin allegato il DDT {fornitore} n. {ddt} del {data}, protocollato con n. {protocollo}, relativo al CDC {cdc} – Acquedotto Pugliese Lecce.\nOrdine Dussmann: {ordine}.\n\nCordiali saluti.'],['Stato','ATTIVO']]);}
 let queue=ss.getSheetByName('CopieDDTInvii');
 if(!queue){queue=ss.insertSheet('CopieDDTInvii');queue.getRange(1,1,1,18).setValues([['ID documento','Richiesto il','Riga registro','Nome file','Fornitore','Numero DDT','Data DDT','CDC','Ordine','Protocollo','PDF','Destinatario','Oggetto','Testo','Stato','Inviato il','Esito','Avviato il']]);}
 const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='inviaCopieDDT');
 if(!existing.length)ScriptApp.newTrigger('inviaCopieDDT').timeBased().everyMinutes(5).create();
 existing.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
 console.log('Invio copie DDT configurato. Nessuna email inviata: serve una richiesta dall’app.');
}
function copieDDTKey_(r){return JSON.stringify([r[0],r[2],r[4],r[6],r[8]].map(String));}
function copieDDTValidate_(q,rows,recipient){
 if(q[7]!=='N154'||String(q[11]).toLowerCase()!==String(recipient).toLowerCase()||!/^cappelluti@dussmann\.it$/i.test(recipient))throw Error('Destinatario o CDC non consentito.');
 const matches=rows.filter(r=>copieDDTKey_(r)===q[0]);
 if(matches.length!==1)throw Error('Documento modificato o non univoco: aggiornare il registro.');
 const r=matches[0];
 if(r[7]!=='PROTOCOLLATO'||!r[6]||r[4]!=='N154'||r[0]!==q[3]||r[1]!==q[4]||r[2]!==q[5]||r[3]!==q[6]||r[5]!==q[8]||r[6]!==q[9]||r[8]!==q[10])throw Error('Il DDT deve essere protocollato N154 e corrispondere ai dati richiesti.');
 if(!q[12]||q[12].length>200||/[\r\n]/.test(q[12])||!q[13]||q[13].length>20000)throw Error('Oggetto o testo email non valido.');
 const url=String(r[8]);
 if(!/^https:\/\/drive\.google\.com\//.test(url))throw Error('Link PDF non valido.');
 const id=url.match(/\/file\/d\/([\w-]+)/)?.[1]||url.match(/[?&]id=([\w-]+)/)?.[1];
 if(!id)throw Error('Identificativo PDF mancante.');
 return id;
}
function inviaCopieDDT(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 try{
 if(Session.getEffectiveUser().getEmail().toLowerCase()!=='giovanni.piccione.business@gmail.com')throw Error('Account di invio diverso da quello del registro.');
 const ss=copieDDTSS_(),sheet=ss.getSheetByName('CopieDDTInvii'),cfg=ss.getSheetByName('CopieDDTConfig');
 if(!sheet||!cfg||cfg.getRange('B5').getDisplayValue()!=='ATTIVO')return;
 const recipient=cfg.getRange('B2').getDisplayValue().trim(),queue=sheet.getDataRange().getDisplayValues();
 const registry=ss.getSheetByName('Foglio1').getDataRange().getDisplayValues().slice(1),start=Date.now();
 for(let i=1;i<queue.length&&Date.now()-start<120000;i++){
 const q=queue[i],row=i+1;
 if(q[14]==='IN_INVIO'&&Date.now()-Date.parse(q[17])>600000){sheet.getRange(row,15).setValue('DA_VERIFICARE');sheet.getRange(row,17).setValue('Esecuzione interrotta: controllare la Posta inviata prima di riprovare.');continue;}
 if(q[14]!=='IN_CODA')continue;
 let attempted=false;
 try{
 const other=queue.some((x,j)=>j!==i&&x[0]===q[0]&&(['INVIATO','IN_INVIO','DA_VERIFICARE'].includes(x[14])||(j<i&&x[14]==='IN_CODA')));
 if(other){sheet.getRange(row,15).setValue('ANNULLATO');sheet.getRange(row,17).setValue('Richiesta duplicata: documento già gestito.');continue;}
 const id=copieDDTValidate_(q,registry,recipient),file=DriveApp.getFileById(id);
 if(file.isTrashed()||file.getMimeType()!=='application/pdf')throw Error('PDF protocollato non disponibile.');
 const parents=file.getParents();let allowed=false;while(parents.hasNext())if(parents.next().getId()===FOLDER_PROTOCOLLATI_ID)allowed=true;
 if(!allowed)throw Error('Il PDF non è nella cartella dei protocollati.');
 if(file.getSize()>18000000)throw Error('PDF oltre 18 MB: inviare manualmente.');
 const attachment=file.getBlob().setName(file.getName());
 // Persist before the external side effect; an uncertain send is never retried automatically.
 sheet.getRange(row,15).setValue('IN_INVIO');sheet.getRange(row,18).setValue(new Date().toISOString());SpreadsheetApp.flush();
 q[14]='IN_INVIO';attempted=true;
 GmailApp.sendEmail(recipient,q[12],q[13],{attachments:[attachment]});
 sheet.getRange(row,15,1,3).setValues([['INVIATO',new Date().toISOString(),'Copia inviata con PDF allegato.']]);q[14]='INVIATO';
 }catch(error){const status=attempted?'DA_VERIFICARE':'ERRORE';sheet.getRange(row,15).setValue(status);sheet.getRange(row,17).setValue(String(error.message||error).slice(0,500));q[14]=status;}
 }
 }finally{lock.releaseLock();}
}
