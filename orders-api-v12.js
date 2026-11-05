'use strict';
const ORDERS_HEADERS=['ID','Ordine Dussmann','Fornitore','Sede destinazione','CDC','Data ordine','Consegna prevista','Stato manuale','File ID','Link PDF','Nome file','Email ID','Hash PDF','Importato il','Avvisi','Note','Aggiornato il','Indirizzo'];
const OrdersState={orders:[],links:[],config:{},sites:[],loaded:false,error:'',busy:false};
const orderColumns=['id','number','company','site','cdc','date','due','manual','fileId','url','filename','emailId','hash','imported','warnings','notes','updated','address'];
const orderRange=(tab,range)=>encodeURIComponent("'"+tab.replace(/'/g,"''")+"'!"+range);
async function ordersRead(tab,range){return (await googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+orderRange(tab,range)+'?valueRenderOption=FORMATTED_VALUE')).values||[];}
async function ordersWrite(tab,range,values){return googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+orderRange(tab,range)+'?valueInputOption=RAW',jsonOptions('PUT',{values}));}
async function ordersAppend(tab,values){return googleRequest(sheetURL+DDTConfig.sheetId+'/values/'+orderRange(tab,tab==='Ordini'?'A:R':tab==='OrdiniConfig'?'A:B':'A:C')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',jsonOptions('POST',{values}));}
function orderRecord(values,index){const r={row:index+2};orderColumns.forEach((key,i)=>r[key]=String(values[i]||''));return r;}
const orderValues=o=>orderColumns.map(key=>String(o[key]||''));
async function fetchOrders(){
 if(!hasSession())throw Error('Accedi con Google per leggere gli ordini.');
 const metadata=await googleRequest(sheetURL+DDTConfig.sheetId+'?fields=sheets(properties)');
 const names=['Ordini','CollegamentiOrdini','OrdiniConfig','SediOrdini'];
 const tabs=names.map(name=>{const tab=metadata.sheets.find(x=>x.properties.title===name)?.properties;if(!tab)throw Error('Scheda '+name+' non disponibile nel registro.');if(tab.gridProperties.rowCount>20000)throw Error('Registro ordini troppo grande per questa versione.');return tab;});
 const rows=await Promise.all(tabs.map((tab,i)=>ordersRead(tab.title,'A1:'+(i===0?'R':i===1?'C':i===2?'B':'C')+tab.gridProperties.rowCount)));
 if(!ORDERS_HEADERS.every((h,i)=>rows[0][0]?.[i]===h))throw Error('Intestazioni Ordini diverse da quelle previste.');
 const orders=rows[0].slice(1).map(orderRecord).filter(o=>o.id);
 if(new Set(orders.map(o=>o.id)).size!==orders.length)throw Error('ID ordine duplicati: verifica il foglio prima di modificare.');
 Object.assign(OrdersState,{orders,links:rows[1].slice(1).map((r,i)=>({row:i+2,key:r[0]||'',orderId:r[1]||'',updated:r[2]||''})).filter(r=>r.key),config:Object.fromEntries(rows[2].slice(1).filter(r=>r[0])),sites:rows[3].slice(1).map(r=>({site:r[0]||'',cdc:r[1]||'',pattern:r[2]||''})).filter(r=>r.site),loaded:true,error:'',bounds:Object.fromEntries(tabs.map(t=>[t.title,t.gridProperties.rowCount]))});
 return OrdersState;
}
async function checkOrderSnapshot(o){const values=(await ordersRead('Ordini','A'+o.row+':R'+o.row))[0]||[];const actual=orderRecord(values,o.row-2);if(JSON.stringify(orderValues(actual))!==JSON.stringify(orderValues(o)))throw Error('L’ordine è cambiato. Aggiorna prima di salvare.');}
function withOrdersLock(work){if(OrdersState.busy||typeof folderBatchBusy!=='undefined'&&folderBatchBusy)throw Error('Un’altra operazione è in corso.');const run=async()=>{OrdersState.busy=true;try{return await work();}finally{OrdersState.busy=false;}};return navigator.locks?navigator.locks.request('ddt-write-'+DDTConfig.sheetId,{ifAvailable:true},lock=>{if(!lock)throw Error('Un’altra operazione è in corso.');return run();}):run();}
async function orderFolder(parent,name){
 const response=await googleRequest(driveURL+'?q='+encodeURIComponent("'"+literal(parent)+"' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='"+literal(name)+"'")+'&fields=files(id)&pageSize=10');
 if(response.files.length>1)throw Error('Cartella duplicata: '+name);
 if(response.files.length)return response.files[0].id;
 return (await googleRequest(driveURL+'?fields=id',jsonOptions('POST',{name,mimeType:'application/vnd.google-apps.folder',parents:[parent]}))).id;
}
async function orderDestination(o){const root=OrdersState.config['Cartella ordini'];if(!root)throw Error('Cartella ordini non configurata.');const date=OrdersCore.dateISO(o.date);if(!date)throw Error('Data ordine non valida.');const names=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];const year=await orderFolder(root,date.slice(0,4)),month=await orderFolder(year,date.slice(5,7)+' - '+names[+date.slice(5,7)-1]);const supplier=OrdersCore.filename({site:o.company,number:'X'},o.hash).replace(/_X\.pdf$/,'');return orderFolder(month,supplier);}
async function saveOrderDetails(o,changes){
 return withOrdersLock(async()=>{
 await checkOrderSnapshot(o);
 const next={...o};for(const key of ['number','company','site','cdc','date','due','manual','notes'])next[key]=String(changes[key]??o[key]??'').trim();
 const ref=OrdersCore.orderRef(next.number);if(!ref?.full)throw Error('Inserisci il numero ordine completo, con anno.');next.number=ref.full;
 if(!next.company||!next.site||!/^N\d{3}$/.test(next.cdc)||!OrdersCore.dateISO(next.date))throw Error('Completa fornitore, sede, CDC e data valida.');
 if(next.due&&!OrdersCore.dateISO(next.due))throw Error('Data consegna non valida.');
 if(!['APERTO','PARZIALE','COMPLETATO','ANNULLATO'].includes(next.manual))throw Error('Stato non valido.');
 if(changes.verified)next.warnings='';
 next.updated=new Date().toISOString();
 const renamed=['number','company','site','date'].some(key=>next[key]!==o[key]);
 let original=null,moved=false;
 if(renamed&&o.fileId){
 original=await googleRequest(driveURL+'/'+encodeURIComponent(o.fileId)+'?fields=id,name,parents,trashed');
 if(original.trashed)throw Error('Il PDF è nel Cestino Drive.');
 const parent=await orderDestination(next);
 next.filename=OrdersCore.filename(next,next.hash);
 const same=await listFiles(parent,next.filename);if(same.some(f=>f.id!==o.fileId))next.filename=next.filename.replace(/\.pdf$/,'_REV_'+next.hash.slice(0,10)+'.pdf');
 const collision=await listFiles(parent,next.filename);if(collision.some(f=>f.id!==o.fileId))throw Error('Esiste già un altro PDF con il nuovo nome.');
 await checkOrderSnapshot(o);
 const remove=(original.parents||[]).filter(p=>p!==parent);
 await googleRequest(driveURL+'/'+encodeURIComponent(o.fileId)+'?fields=id'+(!(original.parents||[]).includes(parent)?'&addParents='+encodeURIComponent(parent):'')+(remove.length?'&removeParents='+encodeURIComponent(remove.join(',')):''),jsonOptions('PATCH',{name:next.filename}));
 moved=true;
 }
 try{await checkOrderSnapshot(o);await ordersWrite('Ordini','A'+o.row+':R'+o.row,[orderValues(next)]);}
 catch(error){
 if(moved)try{const current=await googleRequest(driveURL+'/'+encodeURIComponent(o.fileId)+'?fields=parents');await googleRequest(driveURL+'/'+encodeURIComponent(o.fileId)+'?fields=id&addParents='+encodeURIComponent((original.parents||[]).join(','))+'&removeParents='+encodeURIComponent((current.parents||[]).filter(p=>!(original.parents||[]).includes(p)).join(',')),jsonOptions('PATCH',{name:original.name}));}catch(ignore){throw Error('Salvataggio non confermato. Verifica ordine e PDF prima di riprovare.');}
 throw error;
 }
 return next;
 });
}
async function linkDDTToOrder(ddt,order){
 return withOrdersLock(async()=>{
 await checkSnapshot(ddt);await checkOrderSnapshot(order);
 const rows=await ordersRead('CollegamentiOrdini','A1:C'+(OrdersState.bounds?.CollegamentiOrdini||1000)),key=OrdersCore.ddtKey(ddt),existing=rows.map((r,i)=>({r,i})).filter(x=>x.i>0&&x.r[0]===key);
 if(existing.length>1)throw Error('Collegamenti duplicati: verifica il foglio.');
 const values=[[key,order.id,new Date().toISOString()]];
 if(existing.length)await ordersWrite('CollegamentiOrdini','A'+(existing[0].i+1)+':C'+(existing[0].i+1),values);else await ordersAppend('CollegamentiOrdini',values);
 });
}
async function addOrderSite(site,cdc,pattern){return withOrdersLock(async()=>{if(!site.trim()||!/^N\d{3}$/.test(cdc.trim())||pattern.trim().length<4)throw Error('Inserisci sede, CDC e almeno 4 caratteri dell’indirizzo.');await ordersAppend('SediOrdini',[[site.trim(),cdc.trim(),pattern.trim()]]);});}
