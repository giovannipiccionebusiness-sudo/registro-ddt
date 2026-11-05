/* Pure order recognition and matching shared with the Google importer. */
var OrdersCore=(()=>{
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
 function orderRef(value){const raw=norm(value).replace(/[\/\s-]/g,'');let m=raw.match(/^A?(20\d{2})(\d{6})$/);if(m)return {full:'A'+m[1]+m[2],suffix:m[2],year:m[1]};if(/^\d{6}$/.test(raw))return {full:'',suffix:raw,year:''};return null;}
 const company=value=>norm(value).replace(/[^A-Z0-9]/g,'').replace(/(?:SRL|SPA)$/,'');
 const ddtKey=r=>JSON.stringify([String(r.name||''),norm(r.company),norm(r.ddt),norm(r.date),norm(r.cdc)]);
 function candidates(ddt,orders){
 const ref=orderRef(ddt.order);if(!ref)return [];
 return orders.filter(o=>{if(o.manual==='ANNULLATO')return false;const target=orderRef(o.number);if(!target?.full)return false;
 if(ref.full&&ref.full!==target.full)return false;if(!ref.full&&ref.suffix!==target.suffix)return false;
 if(ddt.company&&o.company&&company(ddt.company)!==company(o.company))return false;
 if(ddt.cdc&&o.cdc&&norm(ddt.cdc)!==norm(o.cdc))return false;
 if(!ref.full&&(!ddt.company||!o.company||!ddt.cdc||!o.cdc))return false;
 return true;});
 }
 function match(ddt,orders,links){const key=ddtKey(ddt),manual=(links||[]).find(x=>x.key===key);if(manual){const order=orders.find(o=>o.id===manual.orderId);return order?{order,manual:true,candidates:[order]}:{order:null,candidates:[],warning:'Collegamento manuale da verificare'};}
 const found=candidates(ddt,orders);return {order:found.length===1?found[0]:null,candidates:found,warning:found.length>1?'Più ordini compatibili: scegli il collegamento':'Nessun ordine compatibile'};}
 function dateISO(value){const m=String(value||'').match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(!m)return '';const y=+m[3],mo=+m[2],d=+m[1],date=new Date(Date.UTC(y,mo-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d?String(y)+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'):'';}
 function status(o,related,today){if(o.manual==='ANNULLATO')return 'Annullato';if(o.manual==='COMPLETATO')return 'Completato';if(o.warnings||!o.number||!o.company||!o.site||!o.cdc||!dateISO(o.date))return 'Da verificare';if(o.manual==='PARZIALE')return 'Parzialmente ricevuto';return related.length?'Consegna da verificare':'In attesa';}
 function parsePDF(text,subject,sites){
 const t=String(text||'').replace(/\u00a0/g,' '),warnings=[];
 const numberMatch=t.match(/Ordine\s+Numero\s*:\s*(A\s*[/ ]?\s*20\d{2}\s*[/ ]?\s*\d{6})/i);
 const subjectRef=String(subject||'').match(/\bA\s*[/ ]?\s*20\d{2}\s*[/ ]?\s*\d{6}\b/i);
 const ref=orderRef(numberMatch?.[1]||'');
 if(!ref?.full)warnings.push('Numero ordine non letto nel PDF');
 if(ref?.full&&subjectRef&&orderRef(subjectRef[0])?.full!==ref.full)warnings.push('Numero ordine diverso dall’oggetto email');
 const supplierBlock=(t.match(/Spett\.?le([\s\S]*?)(?:VIA(?:LE)?\b|CORSO\b|PIAZZA\b|Ordine\s+Numero)/i)?.[1]||'').split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^\d+$/.test(s));
 const supplier=(supplierBlock.find(s=>/[A-Za-zÀ-ÿ]{3}/.test(s))||'').replace(/^\d+\s+/,'');
 const cdc=(t.match(/Ordinato\s+C[\\\/]o\s*:\s*(N\d{3})/i)||t.match(/\b(N\d{3})\b/))?.[1]||'';
 const block=t.match(/Consegna\s+C[\\\/]o\s*:\s*([\s\S]*?)(?:Riferimento\s*:|Orari\s*:|Articolo\b)/i)?.[1]?.trim()||'';
 const deliveryArea=t.match(/Ordinato\s+C[\\\/]o[\s\S]*?(?=Articolo\b|$)/i)?.[0]||'';
 const normalized=norm(block||deliveryArea),matches=(sites||[]).filter(s=>s.site&&s.pattern&&(!cdc||!s.cdc||norm(s.cdc)===cdc)&&normalized.includes(norm(s.pattern)));
 const unique=[...new Set(matches.map(s=>s.site))];const site=unique.length===1?unique[0]:'';
 if(!site)warnings.push(unique.length>1?'Più sedi compatibili':'Sede di consegna da verificare');
 if(!supplier)warnings.push('Fornitore da verificare');if(!cdc)warnings.push('CDC da verificare');
 const date=t.match(/Ordine\s+Numero[\s\S]{0,100}?\bDel\s*:\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i)?.[1]?.replace(/[.-]/g,'/')||'';
 const due=t.match(/Data\s+Consegna\s*:\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i)?.[1]?.replace(/[.-]/g,'/')||'';
 if(!dateISO(date))warnings.push('Data ordine da verificare');
 return {number:ref?.full||'',company:supplier,site,cdc,date,due,address:(block||deliveryArea).replace(/\s+/g,' ').trim(),warnings:warnings.join('; ')};
 }
 const filePart=s=>String(s||'').trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').slice(0,140);
 function filename(o,hash){return filePart(o.site||'SEDE DA VERIFICARE')+'_'+filePart(o.number||('ORDINE DA VERIFICARE_'+hash.slice(0,10)))+'.pdf';}
 return {norm,orderRef,company,ddtKey,candidates,match,dateISO,status,parsePDF,filename};
})();

/* Add this as a NEW .gs file in the existing spreadsheet-bound Apps Script.
   Run attivaImportazioneOrdini once with the business account.
   No web-app deployment and no changes to existing DDT functions are required. */
function ordiniBook_(){
 const id=PropertiesService.getScriptProperties().getProperty('ordini_spreadsheet');
 const ss=id?SpreadsheetApp.openById(id):SpreadsheetApp.getActiveSpreadsheet();
 if(!ss)throw new Error('Apri lo script dal registro Google Sheets.');
 return ss;
}
function ordiniConfig_(ss){const sh=ss.getSheetByName('OrdiniConfig');if(!sh)throw new Error('Manca la scheda OrdiniConfig.');return Object.fromEntries(sh.getDataRange().getDisplayValues().slice(1).filter(r=>r[0]));}
function ordiniSetConfig_(ss,key,value){const sh=ss.getSheetByName('OrdiniConfig'),rows=sh.getDataRange().getDisplayValues();const index=rows.findIndex(r=>r[0]===key);if(index<0)throw new Error('Impostazione mancante: '+key);sh.getRange(index+1,2).setNumberFormat('@').setValue(String(value));}
function ordiniAccount_(cfg){const email=Session.getEffectiveUser().getEmail().toLowerCase();if(!email||email!==String(cfg['Account importazione']).toLowerCase())throw new Error('Esegui e autorizza lo script con l’account indicato in OrdiniConfig, non con quello personale.');}
function attivaImportazioneOrdini(){
 const ss=ordiniBook_(),cfg=ordiniConfig_(ss);ordiniAccount_(cfg);
 DriveApp.getFolderById(cfg['Cartella ordini']).getName();
 PropertiesService.getScriptProperties().setProperty('ordini_spreadsheet',ss.getId());
 importaOrdiniEmail();
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='importaOrdiniEmail').forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger('importaOrdiniEmail').timeBased().everyMinutes(10).create();
 ordiniSetConfig_(ss,'Stato importazione','ATTIVA');
 ss.toast('Importazione ordini attiva ogni 10 minuti.','Ordini Dussmann',8);
}
function disattivaImportazioneOrdini(){
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='importaOrdiniEmail').forEach(t=>ScriptApp.deleteTrigger(t));
 ordiniSetConfig_(ordiniBook_(),'Stato importazione','NON ATTIVA');
}
function ordiniLog_(sheet,row){sheet.appendRow(row.map(v=>typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v));}
function ordiniDigest_(bytes){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(n=>('0'+((n+256)%256).toString(16)).slice(-2)).join('');}
function ordiniText_(blob){
 const boundary='ordini_'+Utilities.getUuid();
 const metadata={name:'OCR_TEMP_ORDINI_'+Utilities.getUuid(),mimeType:'application/vnd.google-apps.document'};
 const begin=Utilities.newBlob('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/pdf\r\n\r\n').getBytes();
 const end=Utilities.newBlob('\r\n--'+boundary+'--').getBytes();
 const response=UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=it&fields=id',{
 method:'post',contentType:'multipart/related; boundary='+boundary,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:begin.concat(blob.getBytes(),end),muteHttpExceptions:true});
 if(response.getResponseCode()>=300)throw new Error('Conversione PDF non riuscita: '+response.getResponseCode());
 const id=JSON.parse(response.getContentText()).id;
 try{let text='';for(let i=0;i<4;i++){try{text=DocumentApp.openById(id).getBody().getText();if(text.trim())return text;}catch(error){}Utilities.sleep(700*(i+1));}throw new Error('Testo del PDF non disponibile.');}
 finally{try{DriveApp.getFileById(id).setTrashed(true);}catch(error){}}
}
function ordiniFolder_(parent,name){const fs=parent.getFoldersByName(name);if(fs.hasNext()){const f=fs.next();if(fs.hasNext())throw new Error('Cartella duplicata: '+name);return f;}return parent.createFolder(name);}
function ordiniArchive_(root,fields,hash,blob){
 const date=OrdersCore.dateISO(fields.date);
 let folder;if(date){const y=ordiniFolder_(root,date.slice(0,4)),months=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];const month=ordiniFolder_(y,date.slice(5,7)+' - '+months[Number(date.slice(5,7))-1]);folder=ordiniFolder_(month,OrdersCore.filename({site:fields.company||'FORNITORE DA VERIFICARE',number:'X'},hash).replace(/_X\.pdf$/,''));}
 else folder=ordiniFolder_(root,'DA VERIFICARE');
 let name=OrdersCore.filename(fields,hash),files=folder.getFilesByName(name),collision=false;
 while(files.hasNext()){const f=files.next();if(ordiniDigest_(f.getBlob().getBytes())===hash)return f;collision=true;}
 if(collision){name=name.replace(/\.pdf$/,'_REV_'+hash.slice(0,10)+'.pdf');files=folder.getFilesByName(name);if(files.hasNext()){const f=files.next();if(ordiniDigest_(f.getBlob().getBytes())===hash)return f;throw new Error('Nome revisione già presente con contenuto diverso.');}}
 return folder.createFile(blob.copyBlob().setName(name)).setDescription('Registro Ordini - SHA256: '+hash);
}
function importaOrdiniEmail(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 const start=Date.now();let ss,cfg;
 try{
 ss=ordiniBook_();cfg=ordiniConfig_(ss);ordiniAccount_(cfg);
 const orders=ss.getSheetByName('Ordini'),log=ss.getSheetByName('ImportazioniOrdini');
 if(!orders||!log)throw new Error('Mancano le tabelle Ordini e ImportazioniOrdini.');
 const root=DriveApp.getFolderById(cfg['Cartella ordini']);
 const sites=ss.getSheetByName('SediOrdini').getDataRange().getDisplayValues().slice(1).map(r=>({site:r[0],cdc:r[1],pattern:r[2]}));
 const previous=orders.getDataRange().getDisplayValues().slice(1),hashes=new Set(previous.map(r=>r[12]).filter(Boolean));
 const done=new Set(log.getDataRange().getDisplayValues().slice(1).filter(r=>['IMPORTATO','GIA PRESENTE'].includes(r[4])).map(r=>r[0]));
 const props=PropertiesService.getScriptProperties(),offset=Number(props.getProperty('ordini_cursor')||0);
 const threads=GmailApp.search(cfg['Ricerca Gmail'],offset,30);
 const label=GmailApp.getUserLabelByName('Ordini Dussmann/Acquisiti')||GmailApp.createLabel('Ordini Dussmann/Acquisiti');
 let imported=0,errors=0,completedThreads=0,stopped=false;
 outer:for(const thread of threads){
 let threadOK=true;
 for(const message of thread.getMessages()){
 if(!/\bA\s*[/ ]?\s*20\d{2}\s*[/ ]?\s*\d{6}\b/i.test(message.getSubject()))continue;
 const attachments=message.getAttachments({includeInlineImages:false,includeAttachments:true});
 for(let index=0;index<attachments.length;index++){
 if(Date.now()-start>230000){stopped=true;break outer;}
 const attachment=attachments[index];if(!/\.pdf$/i.test(attachment.getName())&&attachment.getContentType()!=='application/pdf')continue;
 const hash=ordiniDigest_(attachment.getBytes()),key=message.getId()+':'+index+':'+hash;if(done.has(key))continue;
 const now=Utilities.formatDate(new Date(),'Europe/Rome','yyyy-MM-dd HH:mm:ss');
 try{
 if(attachment.getBytes().length>8388608)throw new Error('Allegato oltre 8 MB: acquisizione manuale richiesta.');
 if(hashes.has(hash)){ordiniLog_(log,[key,now,message.getId(),attachment.getName(),'GIA PRESENTE','PDF identico già registrato']);done.add(key);continue;}
 let fields;try{fields=OrdersCore.parsePDF(ordiniText_(attachment),message.getSubject(),sites);}catch(error){fields={number:'',company:'',site:'',cdc:'',date:'',due:'',address:'',warnings:'Lettura PDF non riuscita: '+error.message};}
 if(fields.number&&previous.some(r=>r[1]===fields.number&&r[12]!==hash))fields.warnings=[fields.warnings,'Possibile revisione di un ordine esistente: verificare'].filter(Boolean).join('; ');
 const file=ordiniArchive_(root,fields,hash,attachment),row=[Utilities.getUuid(),fields.number,fields.company,fields.site,fields.cdc,fields.date,fields.due,'APERTO',file.getId(),file.getUrl(),file.getName(),message.getId(),hash,now,fields.warnings,'',now,fields.address];
 // RAW string values prevent supplier text beginning with '=' from becoming formulas.
 orders.getRange(orders.getLastRow()+1,1,1,18).setNumberFormat('@').setValues([row.map(v=>typeof v==='string'&&/^[=+@]/.test(v)?"'"+v:v)]);
 SpreadsheetApp.flush();previous.push(row);hashes.add(hash);
 ordiniLog_(log,[key,now,message.getId(),attachment.getName(),'IMPORTATO',fields.warnings||'OK']);done.add(key);imported++;
 }catch(error){threadOK=false;errors++;ordiniLog_(log,[key,now,message.getId(),attachment.getName(),'ERRORE',String(error.message).slice(0,1000)]);}
 }
 }
 if(threadOK)thread.addLabel(label);completedThreads++;
 }
 props.setProperty('ordini_cursor',threads.length<30&&!stopped?'0':String(offset+completedThreads));
 ordiniSetConfig_(ss,'Ultimo controllo',Utilities.formatDate(new Date(),'Europe/Rome','yyyy-MM-dd HH:mm:ss'));
 ordiniSetConfig_(ss,'Ultimo esito',imported+' ordini importati; '+errors+' errori'+(stopped?'; proseguimento al prossimo controllo':''));
 return {imported,errors};
 }catch(error){if(ss){try{ordiniSetConfig_(ss,'Ultimo esito',String(error.message));}catch(ignore){}}throw error;}
 finally{lock.releaseLock();}
}
