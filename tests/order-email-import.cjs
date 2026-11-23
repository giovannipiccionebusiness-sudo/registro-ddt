const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync(require('path').join(__dirname,'../gas/ImportazioneOrdini.gs'),'utf8');
function run({subject='Ord. A/2026',pdf='valid',prior=[],logRows=[]}={}){
 const rows=[['header'],...prior.map(r=>r.slice())],logs=[['header'],...logRows];let label=false,reads=0;
 const orders={getDataRange:()=>({getDisplayValues:()=>rows}),getLastRow:()=>rows.length,getRange:()=>({setNumberFormat(){return this},setValues(v){rows.push(...v)}})};
 const log={getDataRange:()=>({getDisplayValues:()=>logs}),appendRow:r=>logs.push(r)};
 const ss={getSheetByName:n=>n==='Ordini'?orders:n==='ImportazioniOrdini'?log:{getDataRange:()=>({getDisplayValues:()=>[['header']]})}};
 const blob={getName:()=> 'Acquedotto.pdf',getContentType:()=> 'application/pdf',getBytes:()=>[1]};
 const thread={getMessages:()=>[{getSubject:()=>subject,getAttachments:()=>pdf==='none'?[]:[blob],getId:()=> 'email'}],addLabel:()=>label=true,removeLabel:()=>label=false};
 const ctx={LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},DriveApp:{getFolderById:()=>({})},PropertiesService:{getScriptProperties:()=>({getProperty:()=> '0',setProperty(){}})},GmailApp:{search:()=>[thread],getUserLabelByName:()=>({})},Utilities:{formatDate:()=> 'now',getUuid:()=> 'id'},SpreadsheetApp:{flush(){}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);Object.assign(ctx,{ordiniBook_:()=>ss,ordiniConfig_:()=>({'Ricerca Gmail':'query'}),ordiniAccount_:()=>{},ordiniSetConfig_:()=>{},ordiniDigest_:()=> 'hash',ordiniArchive_:()=>({getId:()=> 'file',getUrl:()=> 'url',getName:()=> 'order.pdf'}),ordiniText_:()=>{reads++;if(pdf==='error')throw Error('OCR failed');return pdf==='invalid'?'documento senza numero':"Spett.le\nMONDOFFICE SRL\nVia per Gattinara 17\nOrdine Numero: A 2026316718 Del: 08/10/2026\nOrdinato C/o: N154\nConsegna C/o: ACQUEDOTTO PUGLIESE SPA Via Monteroni, 118 73100 LECCE\nRiferimento: Giovanni Piccione";}});
 return {result:ctx.importaOrdiniEmail(),rows,logs,label,reads};
}
let x=run();assert.equal(x.result.imported,1);assert.equal(x.rows[1][1],'A2026316718');assert(x.label);
let y=run({prior:[x.rows[1]],logRows:[x.logs[1]]});assert.equal(y.result.imported,0);assert.equal(y.reads,0);assert(y.label);assert.equal(y.rows.length,2);
for(const pdf of ['error','invalid']){let z=run({pdf});assert.equal(z.result.errors,1);assert.equal(z.rows.length,1);assert(!z.label);assert.equal(z.logs[1][4],'ERRORE');}
assert(!run({pdf:'none'}).label);
let z=run({logRows:[x.logs[1]]});assert.equal(z.result.imported,1);assert(z.label);
let complete=run({subject:'Ord. A/2026/316718 - MONDOFFICE - N154'});assert.equal(complete.result.imported,1);
console.log('PASS: incomplete subject, full subject, duplicate, OCR failure, missing number, no PDF, stale log recovery');
