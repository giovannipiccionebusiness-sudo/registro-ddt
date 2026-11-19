// Lettura DDT ogni ora. Parser condiviso con api-v10.js, versione 46.
const DDT_HOURLY_SHEET = '1ymyHq8S2xe2VSja6M4zPF81cpKCxFDeRegjM44nXci4';
function ddtSyncSheet_() {
 const ss=SpreadsheetApp.openById(DDT_HOURLY_SHEET);
 let sheet=ss.getSheetByName('DDTSync');
 if(!sheet){sheet=ss.insertSheet('DDTSync');sheet.getRange('A1:B4').setValues([['Voce','Valore'],['Automatica',''],['Manuale',''],['Pianificazione','']]);}
 return sheet;
}
function ddtSyncRead_(row){try{return JSON.parse(ddtSyncSheet_().getRange(row,2).getValue()||'null');}catch(e){return null;}}
function ddtSyncWrite_(row,value){ddtSyncSheet_().getRange(row,2).setValue(JSON.stringify(value));SpreadsheetApp.flush();}
function attivaLetturaDDTOgniOra(){
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try{
 const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='letturaDDTOraria');
 if(!existing.length)ScriptApp.newTrigger('letturaDDTOraria').timeBased().everyHours(1).create();
 existing.slice(1).forEach(t=>ScriptApp.deleteTrigger(t));
 ddtSyncWrite_(4,{enabled:true,everyHours:1,timezone:'Europe/Rome',activatedAt:new Date().toISOString()});
 console.log('Lettura DDT automatica attiva ogni ora.');
 }finally{lock.releaseLock();}
}
function ddtHourlyRows_(sheet){return sheet.getDataRange().getDisplayValues().slice(1).filter(r=>r[0]).map((r,i)=>({row:i+2,name:r[0],company:r[1],ddt:r[2],date:r[3],cdc:r[4],order:r[5]}));}
function letturaDDTOraria(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
 const start=Date.now(),report={source:'auto',startedAt:new Date(start).toISOString(),status:'running',registered:0,skipped:0,duplicates:0,errors:[]};
 let acquired=false;
 try{
 const manual=ddtSyncRead_(3);
 if(manual&&manual.status==='running'&&Date.now()-Date.parse(manual.heartbeatAt||manual.startedAt)<120000)return;
 const previous=ddtSyncRead_(2);report.lastCompletedAt=previous?.lastCompletedAt||(previous?.status==='completed'?previous.finishedAt:'')||'';
 ddtSyncWrite_(2,report);acquired=true;
 const sheet=SpreadsheetApp.openById(DDT_HOURLY_SHEET).getSheetByName('Foglio1');
 if(!sheet)throw Error('Foglio1 non trovato.');
 const headers=['Nome file','Azienda','Numero DDT','Data DDT','CDC','Ordine Dussmann','Protocollo','Stato','Link file protocollato'];
 if(!headers.every((v,i)=>sheet.getRange(1,i+1).getDisplayValue().trim()===v))throw Error('Intestazioni registro non corrispondenti.');
 const folder=DriveApp.getFolderById('1t-T952zwloSN1CHAfnXxpv0bIOFmuvpp');
 const files=folder.getFiles();let rows=ddtHourlyRows_(sheet);
 while(files.hasNext()){
 if(Date.now()-start>240000){report.status='partial';report.message='Limite di esecuzione: i file rimanenti saranno controllati alla prossima lettura.';break;}
 const f=files.next(),old=f.getName();
 if(old.startsWith('✅ ')||rows.some(r=>r.name===old)||!['application/pdf','image/jpeg','image/png'].includes(f.getMimeType())){report.skipped++;continue;}
 try{
 const fields=ddtHourlyParse_(estraiTestoOCR(f));
 if(fields.cdcFromOrder&&fields.order){
 const ordersSheet=SpreadsheetApp.openById(DDT_HOURLY_SHEET).getSheetByName('Ordini');
 const ref=String(fields.order).replace(/\D/g,'');
 const orders=ordersSheet?ordersSheet.getDataRange().getDisplayValues().slice(1):[];
 const found=orders.filter(r=>r[2].replace(/[^A-Z]/gi,'').toUpperCase().replace(/(?:SRL|SPA)$/,'')==='ECOSI'&&r[7]!=='ANNULLATO'&&(ref.length===10?r[1].replace(/\D/g,'')===ref:r[1].replace(/\D/g,'').slice(-6)===ref));
 if(found.length===1&&/^N(?:102|153)$/.test(found[0][4]))fields.cdc=found[0][4];
 }
 delete fields.cdcFromOrder;
 let name=old;
 if(fields.company&&fields.ddt){const ext=old.match(/\.[^/.]+$/);name=(fields.company+'_DDT_'+fields.ddt+(ext?ext[0]:'.pdf')).replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_').toUpperCase();}
 rows=ddtHourlyRows_(sheet);
 if(rows.some(r=>r.name===old)||ddtHourlyDuplicates_(fields,rows).length){report.duplicates++;continue;}
 const same=ddtHourlyDuplicates_({name},rows);
 if(same.length){
 if(!fields.company||!fields.ddt||!fields.date||same.some(r=>!r.company||!r.ddt||!r.date)){report.duplicates++;continue;}
 const ext=name.match(/\.[^.]+$/)?.[0]||'';name=name.slice(0,name.length-ext.length)+'_'+f.getId().slice(-8)+ext;
 }
 const collisions=folder.getFilesByName(name);let collision=false;while(collisions.hasNext()){if(collisions.next().getId()!==f.getId())collision=true;}
 if(collision)throw Error('Nome già presente: controllare il duplicato.');
 if(name!==old)f.setName(name);
 sheet.appendRow([name,fields.company,fields.ddt,fields.date,fields.cdc,fields.order,'',Object.values(fields).every(Boolean)?'DA PROTOCOLLARE':'OCR DA VERIFICARE','']);
 rows.push({name,...fields});report.registered++;
 }catch(e){report.errors.push({name:old,error:String(e.message||e).slice(0,300)});}
 }
 if(report.status==='running')report.status=report.errors.length?'partial':'completed';
 }catch(e){report.status='error';report.message=String(e.message||e).slice(0,500);}
 finally{
 if(acquired){report.finishedAt=new Date().toISOString();if(report.status==='completed')report.lastCompletedAt=report.finishedAt;report.errors=report.errors.slice(0,30);ddtSyncWrite_(2,report);console.log(JSON.stringify(report));}
 lock.releaseLock();
 }
}

function ddtHourlyParse_(text){
 const t=String(text||'').normalize('NFKC').replace(/[\u00a0\t]+/g,' ');
 const folded=t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const flat=folded.replace(/\s+/g,' ');
 const suppliers=[
  ['CLINTEX',/\bCLINTEX\b/],['MONDOFFICE',/\bMOND(?:O\s+)?OFFICE\b/],
  ['ECOSI',/\bE['’]?\s*COSI\b/],['ALL SERVICE SRL',/\bALL\s+SERVICE\b/],
  ['TOP STORE',/\bTOP\s+STORE\b/],['LA CASALINDA',/\bLA\s+CASALINDA\b/],
  ['PAREDES',/\bPAREDES\b/],['PANZERI',/\bPANZERI\b/],
  ['MAGRIS',/\bMAGRIS\b|\bMAGRISGROUP\s*\.\s*COM\b/]
 ];
 const company=suppliers.find(([,pattern])=>pattern.test(flat))?.[0]||'';
 const pick=pattern=>folded.match(pattern)?.[1]?.replace(/\s+/g,'')||'';
 const header=folded.split(/\r?\n/).slice(0,100).join('\n');
 let ddt='';
 switch(company){
  case 'PAREDES':
   ddt=pick(/\bBOLLA\s*[:#.-]?\s*([A-Z]{1,3}\s*\/\s*\d{1,3}\s*\/\s*\d{3,10})\b/);
   break;
  case 'PANZERI':
   ddt=pick(/DOCUMENTO\s+DI\s+TRASPORTO[\s\S]{0,120}?\bNUMERO\s*[:#.-]?\s*(?:DEL\s*)?([A-Z]{0,3}\s*\d{3,10})\b(?!\s*\/)/);
   break;
  case 'CLINTEX': {
   const area=folded.match(/N\.?\s*DOCUMENTO[\s\S]{0,180}/)?.[0]||header;
   ddt=[...area.matchAll(/[\\/]\s*(\d{4,6})\s*[\\/]/g)].map(m=>m[1]).find(s=>!['72100','80100'].includes(s))||'';
   break;
  }
  case 'MAGRIS': {
   const area=folded.match(/\bNUMERO\s+DOCUMENTO\b[\s\S]{0,180}/)?.[0]||'';
   const numbers=[...new Set([...area.matchAll(/\b(100\d{7})\b/g)].map(match=>match[1]))];
   if(numbers.length===1)ddt=numbers[0];
   if(!area&&/\bDDT\s+DI\s+VENDITA\b/.test(folded)){
    const rows=[...new Set([...header.matchAll(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\s*[|:]?\s*(100\d{7})\b/g)].map(match=>match[1]))];
    if(rows.length===1)ddt=rows[0];
   }
   break;
  }
  case 'MONDOFFICE':
   ddt=pick(/DOCUMENTO\s+DI\s+TRASPORTO\s*(?:N(?:R|UMERO)?\.?\s*)?[:#-]?\s*(\d{5,15})\b/);
   break;
  case 'ECOSI':
   ddt=pick(/NUMERO\s+DOCUMENTO[\s\S]{0,100}?(\b\d{3,10}\s*\/\s*[A-Z]\b)/);
   break;
  case 'ALL SERVICE SRL':
   ddt=pick(/BOLLA\s+ACCOMPAG[\s\S]{0,150}?\bN\.?\s*(\d+\s*\/\s*\d+)\b/);
   break;
  case 'TOP STORE':
   ddt=pick(/\bNUMERO\s*[:#-]?\s*(\d{4,10})\b/);
   break;
  case 'LA CASALINDA':
   ddt=pick(/\bN\.?\s*DOCUMENTO\s*(?:DATA\s+DOCUMENTO\s*)?[:#-]?\s*(\d{3,10})\b(?![\d./])/);
   break;
 }
 const datePattern='(\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*(?:\\d{4}|\\d{2}))(?!\\d)';
 const labelledDate=pick(new RegExp('DATA\\s+(?:DEL\\s+)?DOCUMENTO(?:\\s+DI\\s+TRASPORTO)?[^0-9]{0,70}'+datePattern));
 const ecosiDate=company==='ECOSI'?pick(new RegExp('DATA\\s+DOCUMENTO\\s+NUMERO\\s+DOCUMENTO[^\\n]*\\n[^\\n]{0,120}?\\b'+datePattern+'\\s+\\d{3,10}\\s*/\\s*[A-Z]\\b')):'';
 const documentDate=company==='ALL SERVICE SRL'
  ?pick(new RegExp('BOLLA\\s+ACCOMPAG[\\s\\S]{0,150}?\\bN\\.?\\s*\\d+\\s*[/]\\s*\\d+\\s+DEL\\s*'+datePattern))
  :company==='TOP STORE'?pick(new RegExp('\\bNUMERO\\s*[:#-]?\\s*\\d{4,10}\\s+DEL\\s*'+datePattern)):'';
 function validDate(value){
  if(!value)return '';
  const parts=value.replace(/\s+/g,'').split(/[./-]/);
  const [day,month,year]=parts.map(Number);
  const yyyy=parts[2]?.length===2?2000+year:year;
  if(yyyy<2000||yyyy>2099)return '';
  const d=new Date(Date.UTC(yyyy,month-1,day));
  return d.getUTCFullYear()===yyyy&&d.getUTCMonth()===month-1&&d.getUTCDate()===day
   ?String(day).padStart(2,'0')+'/'+String(month).padStart(2,'0')+'/'+yyyy:'';
 }
 const dates=[...new Set([...header.matchAll(new RegExp('\\b'+datePattern,'g'))].map(m=>validDate(m[1])).filter(Boolean))];
 const ecosiDateBlock=company==='ECOSI'
  ?(folded.match(/\bDATA\s+DOCUMENTO\b([\s\S]{0,400})/)?.[1]||'')
   .split(/\b(?:DESCRIZIONE|RIF\.?\s*V\.?S\.?\s*ORDINE|DATA\s+E\s+ORA|CODICE\s+ARTICOLO)\b/)[0]:'';
 const ecosiDates=[...new Set([...ecosiDateBlock.matchAll(new RegExp('\\b'+datePattern,'g'))].map(match=>match[1].replace(/\s+/g,'')))];
 const ecosiColumnDate=ecosiDates.length===1?ecosiDates[0]:'';
 const ecosiDocumentNumber=ddt?ddt.replace('/','\\s*/\\s*'):'\\d{3,10}\\s*/\\s*[A-Z]';
 const ddtDateRows=company==='ECOSI'
  ?[...folded.matchAll(new RegExp('\\b'+datePattern+'\\s*[|;:]?\\s*'+ecosiDocumentNumber+'\\b','g'))]
   .map(match=>match[1].replace(/\s+/g,'')):[];
 const ddtDates=[...new Set(ddtDateRows)];
 const ecosiRowDate=ddtDates.length===1?ddtDates[0]:'';
 const supplierDate=company==='PAREDES'
  ?pick(new RegExp('\\bBOLLA\\s*[:#.-]?\\s*[A-Z]{1,3}\\s*/\\s*\\d{1,3}\\s*/\\s*\\d{3,10}\\s+DEL\\s*'+datePattern))
  :company==='PANZERI'?pick(new RegExp('DOCUMENTO\\s+DI\\s+TRASPORTO[\\s\\S]{0,160}?\\b(?:NUMERO\\s*)?(?:DEL\\s*)?[A-Z]{0,3}\\s*\\d{3,10}\\s+(?:DEL\\s*)?'+datePattern)):'';
 const sourceDate=supplierDate||ecosiRowDate||ecosiDate||ecosiColumnDate||labelledDate||documentDate;
 const date=sourceDate?validDate(sourceDate):(company!=='ECOSI'&&dates.length===1?dates[0]:'');
 const labels=/\b(?:RIF\.?\s*(?:V\.?S\.?\s*)?ORDINE(?:\s+CLIENTE)?|V\.?S\.?\s*RIFERIMENTO|(?:NUM\.?\s+)?ORDINE\s+DUSSMANN|NUM\.?\s+ORDINE|ORD\.\s*(?=A\b|A\d))/g;
 const orderNumbers=new Set();
 for(const label of folded.matchAll(labels)){
  const tail=folded.slice(label.index+label[0].length);
  const value=tail.match(/^\s*[:#.-]?\s*(?:N(?:R|UMERO)?\.?\s*)?[:#.-]?\s*(A?\s*[/.-]?\s*20\d{2}\s*[/.-]?\s*\d{6}|A?\s*\d{6})(?![A-Z0-9/]|\s*[/.-]\s*\d)/);
  if(!value)continue;
  const digits=value[1].replace(/\D/g,'');
  orderNumbers.add(digits.length===10?'A'+digits:digits);
 }
 if(!orderNumbers.size&&['TOP STORE','CLINTEX'].includes(company)&&!new RegExp(labels.source).test(folded)){
  for(const m of folded.matchAll(/\bA\s*[/.-]?\s*(20\d{2})\s*[/.-]?\s*(\d{6})\b/g))orderNumbers.add('A'+m[1]+m[2]);
 }
 if(company==='MONDOFFICE'){
  // OCR can return the labels first and the corresponding values as a separate column.
  const customerLabel=/\b(?:RIF\.?\s*ORDINE\s*CLIENTE|V\.?S\.?\s*RIFERIMENTO)\b/;
  const orderHeader=folded.split(/\b(?:CODICE\s+ARTICOLO|DESCRIZIONE\s+ARTICOLO)\b/)[0];
  if(customerLabel.test(orderHeader)){
   const references=[...orderHeader.matchAll(/\bA?\s*(20\d{2})\s*[/.-]?\s*(\d{6})\b/g)];
   for(const reference of references)orderNumbers.add('A'+reference[1]+reference[2]);
  }
 }
 if(company==='MAGRIS'){
  const referenceHeader=header.split(/\\b(?:CODICE\\s+DESCRIZIONE|DESCRIZIONE\\s+MERCE)\\b/)[0];
  if(/\\bDDT\\s+DI\\s+VENDITA\\b/.test(referenceHeader)){
   for(const value of referenceHeader.matchAll(/\\bA(?:\\s*A)?\\s*[/.-]?\\s*(20\\d{2})\\s*[/.-]?\\s*(\\d{6})\\b/g)){
    orderNumbers.add('A'+value[1]+value[2]);
   }
  }
  for(const label of folded.matchAll(/\bV\.?S\.?\s*RIFERIMENTO\b/g)){
   const area=folded.slice(label.index+label[0].length,label.index+label[0].length+180);
   for(const value of area.matchAll(/\b(?:A\s*[/.-]?\s*){0,2}(20\d{2})\s*[/.-]?\s*(\d{6})\b/g)){
    orderNumbers.add('A'+value[1]+value[2]);
   }
  }
 }
 if(company==='ALL SERVICE SRL'){
  for(const label of folded.matchAll(/\bN\s*[.°O'’]?\s*ORDINE\b/g)){
   const tail=folded.slice(label.index+label[0].length);
   const reference=tail.match(/^\s*[:#.-]?\s*(A?\s*[/.-]?\s*20\d{2}\s*[/.-]?\s*\d{6})(?![A-Z0-9/])/);
   if(reference)orderNumbers.add('A'+reference[1].replace(/\D/g,''));
  }
 }
 if(company==='PANZERI'){
  // Only the customer's reference, never 'Ns. Ord.' (the supplier's order).
  for(const m of folded.matchAll(/\bV\.?S\.?\s*\.?\s*ORD(?:INE)?\.?\s*[:#.-]?\s*(A?\s*20\d{2}\s*[/.-]?\s*\d{6}|A?\s*\d{6})(?!\d)/g)){
   const digits=m[1].replace(/\D/g,'');orderNumbers.add(digits.length===10?'A'+digits:digits);
  }
 }
 if(company==='PAREDES'){
  for(const m of folded.matchAll(/\bORDINE\s*[:#.-]?\s*A?\s*(20\d{2})\s*[/.-]?\s*(\d{6})\b/g))orderNumbers.add('A'+m[1]+m[2]);
 }
 const fullReferences=[...orderNumbers].filter(value=>value.startsWith('A'));
 for(const value of fullReferences)orderNumbers.delete(value.slice(-6));
 const order=orderNumbers.size===1?[...orderNumbers][0]:'';
 const explicit=[...new Set([...flat.matchAll(/\b(?:CDC|CENTRO DI COSTO|CONTO PRESSO CLIENTE)\s*[:.-]?\s*(N\d{3})\b/g)].map(m=>m[1]))];
 const delivery=flat.match(/\b(?:DESTINAZIONE DI CONSEGNA|INDIRIZZO DI CONSEGNA|CONSEGNA PRESSO|DESTINAZIONE MERCE)\b\s*[:.-]?\s*(.{1,280})/)?.[1]||'';
 const dePietro=/\bV(?:IA(?:LE)?|\.?LE)?\.?\s+(?:MICHELE\s+)?DE\s+PIETRO\b/;
 function siteCodes(value){
  const codes=[];
  if(/\bMARTA\s+TARANTO\b/.test(value)||(/\bV(?:IA|\.)\s+(?:CAMILLO(?:\s+BENSO)?\s+)?CAVOUR\s*[,.-]?\s*(?:N[.°]?\s*)?10\b/.test(value)&&/\bTARANTO\b/.test(value)))codes.push('N110');
  if(dePietro.test(value)||/\b(?:V(?:IA)?\.?\s+(?:BRENTA|BIRAGO|LANZ[IE]LLOTTI|MARCHE|LAG(?:O|HI) DI BOLSENA)|(?:PIAZZA|P\.?ZZA|PZ)\s+DUOMO)\b/.test(value))codes.push('N153');
  if(/\bBARONCINO\b/.test(value))codes.push('N148');
  const university=/\b(?:ECOTEKNE|STUDIUM\s*2000|VALESIO)\b/.test(value)||
   (/\bUNIVERSITA['’]?\s+(?:DEL\s+)?SALENTO\b/.test(value)&&/\bMONTERONI\b/.test(value));
  if(university)codes.push('N157');
  else if(/\bV(?:IA)?\.?\s+MONTERONI\b/.test(value))codes.push('N154');
  return codes;
 }
 const address=siteCodes(delivery).length?delivery:flat;
 const cdcFromOrder=company==='ECOSI'&&!explicit.length&&dePietro.test(address);
 const codes=explicit.length?explicit:siteCodes(address);
 const cdc=!cdcFromOrder&&codes.length===1?codes[0]:'';
 return{company,ddt,date,cdc,order,cdcFromOrder};
}

function ddtHourlyDuplicates_(record,rows){
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
 const supplier=v=>norm(v).replace(/[^A-Z0-9]/g,'').replace(/(?:SRL|SPA)$/,'').replace(/^PAREDESITALIA$/,'PAREDES');
 const date=v=>norm(v).replace(/[-.]/g,'/').split('/').map(part=>part.padStart(2,'0')).join('/');
 const filename=v=>norm(v).replace(/^✅\s*/,'');
 const number=v=>norm(v).replace(/[\\/]/g,'-').replace(/\s/g,'');
 return rows.filter(other=>other.row!==record.row&&(
 (record.name&&filename(record.name)===filename(other.name))||
 (record.company&&record.ddt&&record.date&&
 supplier(record.company)===supplier(other.company)&&number(record.ddt)===number(other.ddt)&&
 date(record.date)===date(other.date))));
}
