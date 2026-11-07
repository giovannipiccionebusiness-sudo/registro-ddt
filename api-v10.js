/* Google APIs adapter. Tokens stay in memory and tab session storage until expiry; no credentials or document data in Git. */
'use strict';
const DDTConfig={clientId:'',sheetId:'',tab:'Foglio1',originals:'',stamped:''};
if(typeof localStorage!=='undefined'){try{Object.assign(DDTConfig,JSON.parse(localStorage.getItem('ddt-google-config')||'{}'));}catch{}}
let accessToken='',expiresAt=0,tabId=null;
const GOOGLE_SESSION_KEY='ddt-google-session';
function googleSessionScope(){return JSON.stringify([oauthClientId(),DDTConfig.sheetId,DDTConfig.originals,DDTConfig.stamped]);}
function saveGoogleSession(){try{sessionStorage.setItem(GOOGLE_SESSION_KEY,JSON.stringify({accessToken,expiresAt,scope:googleSessionScope()}));}catch{}}
function restoreGoogleSession(){try{const s=JSON.parse(sessionStorage.getItem(GOOGLE_SESSION_KEY)||'null');if(s&&s.scope===googleSessionScope()&&typeof s.accessToken==='string'&&Number.isFinite(s.expiresAt)&&s.expiresAt>Date.now()){accessToken=s.accessToken;expiresAt=s.expiresAt;}else sessionStorage.removeItem(GOOGLE_SESSION_KEY);}catch{}}
restoreGoogleSession();
const DDT_HEADERS=['Nome file','Azienda','Numero DDT','Data DDT','CDC','Ordine Dussmann','Protocollo','Stato','Link file protocollato'];
const hasSession=()=>!!accessToken&&Date.now()<expiresAt;
function oauthClientId(){return DDTConfig.clientId||localStorage.getItem('ddt-oauth-client-id')||'';}
function forgetGoogle(){accessToken='';expiresAt=0;tabId=null;try{sessionStorage.removeItem(GOOGLE_SESSION_KEY);}catch{}}
async function signInGoogle(){if(hasSession())return;const clientId=oauthClientId();if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('Apri Collegamento e inserisci il Client ID OAuth Google configurato per questo sito.');if(!window.google?.accounts?.oauth2)throw Error('Il servizio di accesso Google non è ancora disponibile. Riprova.');await new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',callback:r=>{if(r.error)return reject(Error(r.error_description||r.error));if(!google.accounts.oauth2.hasGrantedAllScopes(r,'https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive'))return reject(Error('Sono necessari i permessi per Google Sheets e Drive.'));accessToken=r.access_token;expiresAt=Date.now()+(Number(r.expires_in)-30)*1000;saveGoogleSession();resolve();},error_callback:r=>reject(Error(r.message||'Accesso annullato.'))});client.requestAccessToken();});}
async function googleRequest(url,options={}){if(!hasSession())throw Error('Sessione Google scaduta. Premi Accedi con Google. L’operazione non è stata ripetuta.');const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+accessToken},cache:'no-store'});if(response.status===401){forgetGoogle();throw Error('Autorizzazione Google scaduta. Accedi di nuovo e aggiorna il registro prima di riprovare.');}if(!response.ok){let m='Errore Google '+response.status;try{const r=await response.json();m=r.error?.message||m}catch{}throw Error(m);}if(options.binary)return response.arrayBuffer();if(options.text)return response.text();if(response.status===204)return null;return response.json();}
const sheetURL='https://sheets.googleapis.com/v4/spreadsheets/';
const driveURL='https://www.googleapis.com/drive/v3/files';
function jsonOptions(method,body){return{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}}
function literal(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
function sheetRange(range){return encodeURIComponent("'"+DDTConfig.tab.replace(/'/g,"''")+"'!"+range);}
async function sheetMetadata(){const m=await googleRequest(sheetURL+DDTConfig.sheetId+'?fields=sheets(properties)');const p=m.sheets.find(s=>s.properties.title===DDTConfig.tab)?.properties;if(!p)throw Error('Il registro non contiene il foglio atteso.');tabId=p.sheetId;return p;}
async function readValues(range){return(await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+sheetRange(range)+'?valueRenderOption=FORMATTED_VALUE')).values||[];}
function toRecord(r,index){return{row:index+2,name:String(r[0]||''),company:String(r[1]||''),ddt:String(r[2]||''),date:String(r[3]||''),cdc:String(r[4]||''),order:String(r[5]||''),protocol:String(r[6]||''),status:String(r[7]||''),url:String(r[8]||'')}}
function recordValues(r){return[r.name,r.company,r.ddt,r.date,r.cdc,r.order,r.protocol,r.status,r.url];}
async function listDDT(){if(!DDTConfig.sheetId||!DDTConfig.originals||!DDTConfig.stamped)throw Error('Completa il collegamento al foglio e alle cartelle in Collegamento.');const meta=await sheetMetadata();if(meta.gridProperties.rowCount>100000)throw Error('Registro troppo grande: occorre suddividere la lettura.');const values=await readValues('A1:I'+meta.gridProperties.rowCount);if(!DDT_HEADERS.every((s,i)=>(values[0]?.[i]||'').trim()===s))throw Error('Intestazioni del registro non corrispondenti. Nessuna modifica eseguita.');return{canProtocol:true,rows:values.slice(1).map(toRecord).filter(r=>r.name)};}
async function checkSnapshot(r){const v=(await readValues('A'+r.row+':I'+r.row))[0]||[];const actual=toRecord(v,r.row-2);if(JSON.stringify(recordValues(actual))!==JSON.stringify(recordValues(r)))throw Error('Il documento è cambiato. Aggiorna il registro prima di continuare.');return actual;}
async function listFiles(folder,name){const q="'"+literal(folder)+"' in parents and trashed=false and name='"+literal(name)+"'";return(await googleRequest(driveURL+'?q='+encodeURIComponent(q)+'&fields=files(id,name,mimeType,webViewLink,appProperties)&pageSize=100')).files;}
async function originalDDT(r){await checkSnapshot(r);let fs=await listFiles(DDTConfig.originals,r.name);if(!fs.length)fs=await listFiles(DDTConfig.originals,'✅ '+r.name);if(fs.length!==1)throw Error(fs.length?'Più originali con questo nome. Verifica Drive.':'Originale non trovato.');return fs[0];}
async function downloadDrive(id){return googleRequest(driveURL+'/'+encodeURIComponent(id)+'?alt=media',{binary:true});}
async function uploadDrive(blob,metadata,convert=false){const boundary='ddt_'+crypto.randomUUID();const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+(blob.type||'application/octet-stream')+'\r\n\r\n',blob,'\r\n--'+boundary+'--'],{type:'multipart/related; boundary='+boundary});return googleRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,appProperties'+(convert?'&ocrLanguage=it':''),{method:'POST',body});}
async function ocrDDT(blob){const doc=await uploadDrive(blob,{name:'OCR_TEMP_DDT_'+crypto.randomUUID(),mimeType:'application/vnd.google-apps.document'},true);try{return await googleRequest(driveURL+'/'+doc.id+'/export?mimeType=text%2Fplain',{text:true});}finally{try{await googleRequest(driveURL+'/'+doc.id,jsonOptions('PATCH',{trashed:true}));}catch(e){console.warn('Pulizia OCR non riuscita:',e.message);}}}
async function saveUploadedDDT(file){
 if(file.size>8388608||!['application/pdf','image/jpeg','image/png'].includes(file.type))throw Error('Carica PDF, JPG o PNG fino a 8 MB.');
 const work=async()=>{
  let fields={company:'',ddt:'',date:'',cdc:'',order:''},warning='';
  try{fields=await readDDTFields(file);}catch(e){warning='OCR non riuscito. Completa i dati nel foglio. '+e.message;}
  const current=await listDDT();
  const duplicates=duplicateDDTRows(fields,current.rows);
  if(duplicates.length)return{duplicates};
  const id=crypto.randomUUID();
  const original=await uploadDrive(file,{name:'CARICAMENTO_'+id+'_'+file.name,parents:[DDTConfig.originals],appProperties:{ddtUpload:id}});
  try{
   const ext=file.type==='application/pdf'?'.PDF':file.type==='image/png'?'.PNG':'.JPG';
   let name=fields.company&&fields.ddt?(fields.company+'_DDT_'+fields.ddt+ext).replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_').toUpperCase():file.name.replace(/\.[^.]+$/,'')+'_'+id.slice(0,8)+ext;
   if((await listFiles(DDTConfig.originals,name)).length)name=name.replace(/\.[^.]+$/,'')+'_'+id.slice(0,8)+ext;
   await googleRequest(driveURL+'/'+original.id,jsonOptions('PATCH',{name}));
   const values=[name,fields.company,fields.ddt,fields.date,fields.cdc,fields.order,'',ddtReadStatus(fields),''];
   await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+sheetRange('A:I')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',jsonOptions('POST',{values:[values]}));
   return{warning,originalId:original.id};
  }catch(e){throw Error(e.message+' File originale conservato su Drive: '+original.id+'. Non ripetere il caricamento prima della verifica.');}
 };
 return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},lock=>{if(!lock)throw Error('Un’altra operazione è in corso.');return work();}):work();
}
async function stampBytes(bytes,mime,text){if(!window.PDFLib)throw Error('Libreria PDF non caricata. Riprova dopo aver aggiornato la pagina.');const P=PDFLib;let pdf,page;if(mime==='application/pdf'){pdf=await P.PDFDocument.load(bytes);page=pdf.getPages()[0];if(!page)throw Error('PDF privo di pagine.');}else{pdf=await P.PDFDocument.create();const img=mime==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);page=pdf.addPage([img.width,img.height]);page.drawImage(img,{x:0,y:0,width:img.width,height:img.height});}const font=await pdf.embedFont(P.StandardFonts.HelveticaBold),{width,height}=page.getSize();let size=mime==='application/pdf'?12:Math.max(18,width*.025);size=Math.min(size,(width-40)/font.widthOfTextAtSize(text,1));const tw=font.widthOfTextAtSize(text,size),x=width-tw-20,y=Math.max(15,height-45);page.drawRectangle({x:x-6,y:y-5,width:tw+12,height:size+11,color:P.rgb(1,1,1),opacity:.85});page.drawText(text,{x,y,size,font,color:P.rgb(0,0,0)});return new Blob([await pdf.save()],{type:'application/pdf'});}
async function protocolDDT(r,protocol){if(!/^\d{6,20}$/.test(protocol))throw Error('Protocollo numerico richiesto, da 6 a 20 cifre.');const work=async()=>{await checkSnapshot(r);if(r.status==='PROTOCOLLATO'||r.url)throw Error('Documento già protocollato.');if(!/^N\d{3}$/.test(r.cdc)||!r.company||!r.ddt||!r.date||!r.order)throw Error('Completa i dati del DDT nel foglio prima di protocollare.');if(r.protocol&&r.protocol!==protocol)throw Error('Nel registro è presente un protocollo diverso.');const all=await listDDT();if(all.rows.some(s=>s.row!==r.row&&s.protocol===protocol))throw Error('Protocollo già utilizzato per un altro DDT.');const f=await originalDDT(r);if(!['application/pdf','image/jpeg','image/png'].includes(f.mimeType))throw Error('Formato non supportato.');const name=r.name.replace(/\.[^/.]+$/,'')+'_PROT_'+protocol+'_'+r.cdc+'.pdf';let existing=await listFiles(DDTConfig.stamped,name),out;if(existing.length){if(existing.length!==1||existing[0].appProperties?.ddtOriginal!==f.id||existing[0].appProperties?.ddtProtocol!==protocol)throw Error('PDF con questo nome già esistente. Verifica Drive.');out=existing[0];}else{const blob=await stampBytes(await downloadDrive(f.id),f.mimeType,'Prot. n. '+protocol+' - CDC '+r.cdc);await checkSnapshot(r);out=await uploadDrive(blob,{name,parents:[DDTConfig.stamped],appProperties:{ddtOriginal:f.id,ddtProtocol:protocol}});}await checkSnapshot(r);const last=await listDDT();if(last.rows.some(s=>s.row!==r.row&&s.protocol===protocol))throw Error('Protocollo assegnato nel frattempo. PDF conservato, registro non modificato.');const url=out.webViewLink||'https://drive.google.com/file/d/'+out.id+'/view';await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+sheetRange('G'+r.row+':I'+r.row)+'?valueInputOption=RAW',jsonOptions('PUT',{values:[[protocol,'PROTOCOLLATO',url]]}));let warning='';try{if(!f.name.startsWith('✅ '))await googleRequest(driveURL+'/'+f.id,jsonOptions('PATCH',{name:'✅ '+f.name}));}catch(e){warning='PDF e registro salvati. L’originale non è stato contrassegnato.';}return{url,warning};};return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},l=>{if(!l)throw Error('Un’altra operazione è in corso in questo browser.');return work();}):work();}
function parseDDT(text){
 const t=String(text||'').normalize('NFKC').replace(/[\u00a0\t]+/g,' ');
 const folded=t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 const flat=folded.replace(/\s+/g,' ');
 const suppliers=[
  ['CLINTEX',/\bCLINTEX\b/],['MONDOFFICE',/\bMOND(?:O\s+)?OFFICE\b/],
  ['ECOSI',/\bE['’]?\s*COSI\b/],['ALL SERVICE SRL',/\bALL\s+SERVICE\b/],
  ['TOP STORE',/\bTOP\s+STORE\b/],['LA CASALINDA',/\bLA\s+CASALINDA\b/]
 ];
 const company=suppliers.find(([,pattern])=>pattern.test(flat))?.[0]||'';
 const pick=pattern=>folded.match(pattern)?.[1]?.replace(/\s+/g,'')||'';
 const header=folded.split(/\r?\n/).slice(0,100).join('\n');
 let ddt='';
 switch(company){
  case 'CLINTEX': {
   const area=folded.match(/N\.?\s*DOCUMENTO[\s\S]{0,180}/)?.[0]||header;
   ddt=[...area.matchAll(/[\\/]\s*(\d{4,6})\s*[\\/]/g)].map(m=>m[1]).find(s=>!['72100','80100'].includes(s))||'';
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
 const sourceDate=ecosiDate||labelledDate||documentDate;
 const date=sourceDate?validDate(sourceDate):(dates.length===1?dates[0]:'');
 const labels=/\b(?:RIF\.?\s*(?:V\.?S\.?\s*)?ORDINE(?:\s+CLIENTE)?|V\.?S\.?\s*RIFERIMENTO|(?:NUM\.?\s+)?ORDINE\s+DUSSMANN|NUM\.?\s+ORDINE|ORD\.\s*(?=A\b|A\d))/g;
 const orderNumbers=new Set();
 for(const label of folded.matchAll(labels)){
  const tail=folded.slice(label.index+label[0].length);
  const value=tail.match(/^\s*[:#.-]?\s*(?:N(?:R|UMERO)?\.?\s*)?[:#.-]?\s*(A?\s*[/.-]?\s*20\d{2}\s*[/.-]?\s*\d{6}|A?\s*\d{6})(?![A-Z0-9/]|\s*[/.-]\s*\d)/);
  if(!value)continue;
  const digits=value[1].replace(/\D/g,'');
  orderNumbers.add(digits.length===10?'A'+digits:digits);
 }
 if(!orderNumbers.size&&company==='TOP STORE'&&!new RegExp(labels.source).test(folded)){
  for(const m of folded.matchAll(/\bA\s*(20\d{8})\b/g))orderNumbers.add('A'+m[1]);
 }
 const fullReferences=[...orderNumbers].filter(value=>value.startsWith('A'));
 for(const value of fullReferences)orderNumbers.delete(value.slice(-6));
 const order=orderNumbers.size===1?[...orderNumbers][0]:'';
 const explicit=[...new Set([...flat.matchAll(/\b(?:CDC|CENTRO DI COSTO)\s*[:.-]?\s*(N\d{3})\b/g)].map(m=>m[1]))];
 const delivery=flat.match(/\b(?:DESTINAZIONE DI CONSEGNA|INDIRIZZO DI CONSEGNA|CONSEGNA PRESSO|DESTINAZIONE MERCE)\b\s*[:.-]?\s*(.{1,280})/)?.[1]||'';
 const dePietro=/\bV(?:IA(?:LE)?|\.?LE)?\.?\s+DE\s+PIETRO\b/;
 function siteCodes(value){
  const codes=[];
  if(dePietro.test(value)||/\b(?:V(?:IA)?\.?\s+(?:BRENTA|BIRAGO|LANZ[IE]LLOTTI|MARCHE|LAG(?:O|HI) DI BOLSENA)|(?:PIAZZA|P\.?ZZA|PZ)\s+DUOMO)\b/.test(value))codes.push('N153');
  if(/\bBARONCINO\b/.test(value))codes.push('N148');
  if(/\bV(?:IA)?\.?\s+MONTERONI\b/.test(value))codes.push('N154');
  return codes;
 }
 const address=siteCodes(delivery).length?delivery:flat;
 const cdcFromOrder=company==='ECOSI'&&!explicit.length&&dePietro.test(address);
 const codes=explicit.length?explicit:siteCodes(address);
 const cdc=!cdcFromOrder&&codes.length===1?codes[0]:'';
 return{company,ddt,date,cdc,order,cdcFromOrder};
}

async function readDDTFields(file){
 const {cdcFromOrder,...fields}=await readDDTDocumentFields(file);
 if(!cdcFromOrder||!fields.order)return fields;
 try{
  const reference=OrdersCore.orderRef(fields.order);
  if(!reference)return fields;
  const rows=await ordersRead('Ordini','B2:H');
  const matches=rows.filter(([number,company,,,,,status])=>{
   const order=OrdersCore.orderRef(number);
   return order?.full&&OrdersCore.company(company)==='ECOSI'&&OrdersCore.norm(status)!=='ANNULLATO'&&
    (reference.full?order.full===reference.full:order.suffix===reference.suffix);
  });
  const cdc=OrdersCore.norm(matches.length===1?matches[0][3]:'');
  if(cdc==='N102'||cdc==='N153')fields.cdc=cdc;
 }catch(error){
  console.warn('Centro di costo non recuperato dagli ordini:',error.message);
 }
 return fields;
}

async function readDDTDocumentFields(file){
 let native=null;
 if(file.type==='application/pdf'&&typeof DDTPDFViewer!=='undefined'){
  try {
   const text=await DDTPDFViewer.extractText(await file.arrayBuffer());
   if(text.trim())native=parseDDT(text);
  } catch {}
  if(native&&native.company&&native.ddt&&native.date&&native.order&&(native.cdc||native.cdcFromOrder))return native;
 }
 try {
  const text=await ocrDDT(file);
  if(text.trim())return parseDDT(text);
  if(native)return native;
  return parseDDT('');
 } catch(error){
  if(native&&(native.company||native.ddt||native.date||native.cdc||native.order))return native;
  throw error;
 }
}
function ddtReadStatus(fields){return Object.values(fields).every(Boolean)?'DA PROTOCOLLARE':'OCR DA VERIFICARE';}
if(typeof module!=='undefined')module.exports={parseDDT,toRecord,recordValues};

async function folderDDTFiles(){const all=[];let token='';do{const q="'"+literal(DDTConfig.originals)+"' in parents and trashed=false";const p=await googleRequest(driveURL+'?q='+encodeURIComponent(q)+'&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)'+(token?'&pageToken='+encodeURIComponent(token):''));all.push(...(p.files||[]));token=p.nextPageToken||'';}while(token);return all;}
async function scanDDTFolder(progress=()=>{},shouldStop=()=>false){const work=async()=>{const registry=await listDDT(),files=await folderDDTFiles(),names=new Set(registry.rows.map(r=>r.name));const summary={registered:0,skipped:0,duplicates:[],errors:[],stopped:false};for(let i=0;i<files.length;i++){if(shouldStop()){summary.stopped=true;break;}const f=files[i];if(f.name.startsWith('✅ ')||names.has(f.name)||!['application/pdf','image/jpeg','image/png'].includes(f.mimeType)){summary.skipped++;continue;}progress({current:i+1,total:files.length,name:f.name});try{const fields=await readDDTFields(new Blob([await downloadDrive(f.id)],{type:f.mimeType}));let name=f.name;if(fields.company&&fields.ddt){const ext=f.name.match(/\.[^/.]+$/)?.[0]||(f.mimeType==='application/pdf'?'.pdf':f.mimeType==='image/png'?'.png':'.jpg');name=(fields.company+'_DDT_'+fields.ddt+ext).replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,'_').toUpperCase();}
const fresh=await listDDT();
const duplicates=duplicateDDTRows(fields,fresh.rows);
if(duplicates.length){summary.duplicates.push(...duplicates);continue;}
const nameMatches=duplicateDDTRows({name},fresh.rows);
if(nameMatches.length){
 if(!fields.company||!fields.ddt||!fields.date||nameMatches.some(r=>!r.company||!r.ddt||!r.date)){summary.duplicates.push(...nameMatches);continue;}
 const ext=name.match(/\.[^.]+$/)?.[0]||'';
 name=name.slice(0,name.length-ext.length)+'_'+f.id.slice(-8)+ext;
}const same=await listFiles(DDTConfig.originals,name);if(same.some(x=>x.id!==f.id))throw Error('Nome DDT già presente nella cartella: controlla il possibile duplicato.');if(name!==f.name)await googleRequest(driveURL+'/'+f.id,jsonOptions('PATCH',{name}));await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+sheetRange('A:I')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',jsonOptions('POST',{values:[[name,fields.company,fields.ddt,fields.date,fields.cdc,fields.order,'',ddtReadStatus(fields),'']]}));names.add(name);summary.registered++;
}catch(e){summary.errors.push({name:f.name,error:e.message});if(!hasSession()){summary.stopped=true;break;}}}return summary;};return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},l=>{if(!l)throw Error('Un’altra operazione è in corso in questo browser.');return work();}):work();}
async function saveDDTProtocolOnly(r,value){const p=String(value).trim();if(!/^\d{6,20}$/.test(p))throw Error('Inserisci il protocollo numerico da 6 a 20 cifre.');const work=async()=>{await checkSnapshot(r);if(r.status.toUpperCase()==='PROTOCOLLATO'||r.url)throw Error('Documento già protocollato.');const all=await listDDT();if(all.rows.some(x=>x.row!==r.row&&x.protocol===p))throw Error('Protocollo già assegnato a un altro DDT.');await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+sheetRange('G'+r.row)+'?valueInputOption=RAW',jsonOptions('PUT',{values:[[p]]}));};return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},l=>{if(!l)throw Error('Un’altra operazione è in corso.');return work();}):work();}
async function protocolAllDDT(progress=()=>{},shouldStop=()=>false){const list=await listDDT(),pending=list.rows.filter(r=>r.name&&r.protocol&&r.status.toUpperCase()!=='PROTOCOLLATO');const report={done:0,errors:[],total:pending.length,stopped:false};for(let i=0;i<pending.length;i++){if(shouldStop()){report.stopped=true;break;}const r=pending[i];progress({current:i+1,total:pending.length,name:r.name});try{const out=await protocolDDT(r,r.protocol);report.done++;if(out.warning)report.errors.push({name:r.name,error:out.warning});}catch(e){report.errors.push({name:r.name,error:e.message});if(!hasSession()){report.stopped=true;break;}}}return report;}



async function saveDDTDetails(r,changes){
 const work=async()=>{
  await checkSnapshot(r);
  if(r.status.toUpperCase()==='PROTOCOLLATO'||r.url)throw Error('Documento già protocollato: i dati sono bloccati per mantenere coerente il PDF.');
  const next={...r};for(const k of ['name','company','ddt','date','cdc','order'])next[k]=String(changes[k]??'').trim();
  if(!next.name||/[\\/:*?"<>|\x00-\x1f]/.test(next.name)||next.name.startsWith('✅'))throw Error('Nome file non valido. Mantieni anche l’estensione originale.');
  const ext=r.name.match(/\.[^/.]+$/)?.[0]||'';
  if(ext&&next.name.slice(-ext.length).toLowerCase()!==ext.toLowerCase())throw Error('Mantieni l’estensione originale '+ext+'.');
  if(next.cdc&&!/^N\d{3}$/.test(next.cdc))throw Error('Centro di costo non valido: usa il formato N153.');
  if(next.date){const m=next.date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!m)throw Error('Data richiesta nel formato gg/mm/aaaa.');const d=new Date(+m[3],+m[2]-1,+m[1]);if(d.getFullYear()!==+m[3]||d.getMonth()!==+m[2]-1||d.getDate()!==+m[1])throw Error('Data documento non valida.');}
  const renamed=next.name!==r.name;let f;
  if(renamed){const all=await listDDT();if(all.rows.some(x=>x.row!==r.row&&x.name.toLowerCase()===next.name.toLowerCase()))throw Error('Nome già usato nel registro.');f=await originalDDT(r);if((await listFiles(DDTConfig.originals,next.name)).some(x=>x.id!==f.id))throw Error('Esiste già un altro file con questo nome nella cartella.');await checkSnapshot(r);await googleRequest(driveURL+'/'+f.id,jsonOptions('PATCH',{name:next.name}));}
  try{await checkSnapshot(r);await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+sheetRange('A'+r.row+':F'+r.row)+'?valueInputOption=RAW',jsonOptions('PUT',{values:[[next.name,next.company,next.ddt,next.date,next.cdc,next.order]]}));}
  catch(e){if(renamed){try{await checkSnapshot(r);await googleRequest(driveURL+'/'+f.id,jsonOptions('PATCH',{name:f.name}));}catch{throw Error('Salvataggio non confermato. Verifica la riga '+r.row+' e il file su Drive prima di riprovare. Nome richiesto: '+next.name);}}throw e;}
  return next;
 };return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},l=>{if(!l)throw Error('Un’altra operazione è in corso.');return work();}):work();
}

function duplicateDDTRows(record,rows){
 const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
 const supplier=v=>norm(v).replace(/[^A-Z0-9]/g,'').replace(/(?:SRL|SPA)$/,'');
 const date=v=>norm(v).replace(/[-.]/g,'/').split('/').map(part=>part.padStart(2,'0')).join('/');
 const filename=v=>norm(v).replace(/^✅\s*/,'');
 const number=v=>norm(v).replace(/[\\/]/g,'-').replace(/\s/g,'');
 return rows.filter(other=>other.row!==record.row&&(
 (record.name&&filename(record.name)===filename(other.name))||
 (record.company&&record.ddt&&record.date&&
 supplier(record.company)===supplier(other.company)&&number(record.ddt)===number(other.ddt)&&
 date(record.date)===date(other.date))));
}

async function deletePendingDDTRow(record){
 const work=async()=>{
 const current=await listDDT();
 await checkSnapshot(record);
 if(String(record.status||'').trim().toUpperCase()==='PROTOCOLLATO'||record.url)throw Error('I documenti già protocollati non possono essere eliminati.');
 const metadata=await sheetMetadata();
 const normalName=v=>String(v||'').replace(/^✅\s*/,'').trim().toLowerCase();
 const shared=current.rows.some(r=>r.row!==record.row&&normalName(r.name)===normalName(record.name));
 let original=null,trashed=false;
 if(!shared){
 original=await originalDDT(record);
 await checkSnapshot(record);
 await googleRequest(driveURL+'/'+encodeURIComponent(original.id),jsonOptions('PATCH',{trashed:true}));
 trashed=true;
 }
 try{
 await checkSnapshot(record);
 await googleRequest(sheetURL+DDTConfig.sheetId+':batchUpdate',jsonOptions('POST',{
 requests:[{deleteDimension:{range:{sheetId:metadata.sheetId,dimension:'ROWS',startIndex:record.row-1,endIndex:record.row}}}]
 }));
 }catch(error){
 if(trashed){
 try{await googleRequest(driveURL+'/'+encodeURIComponent(original.id),jsonOptions('PATCH',{trashed:false}));}
 catch{throw Error('Eliminazione non confermata. Verifica il foglio e il Cestino Drive: '+record.name);}
 }
 throw error;
 }
 return{shared,trashed};
 };
 return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},lock=>{
 if(!lock)throw Error('Un’altra operazione è in corso.');return work();
 }):work();
}
