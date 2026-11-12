'use strict';
(()=>{
 let visible=false,selectedOrder=null,pdfURL='';
 const section=$('ordersPanel'),dialog=$('orderDialog'),E=esc,C=OrdersCore,M=DDTMail;
 const requestSelection=new Set();let visibleOrders=[],requestDrafts=[],mailBookDirty=false;
 let mailOverrides={};
 const emailFor=contact=>Object.prototype.hasOwnProperty.call(mailOverrides,contact.key)?String(mailOverrides[contact.key]):contact.emails;
 const eligibleForRequest=o=>Boolean(o.number&&o.company)&&o.manual!=='ANNULLATO'&&!related(o).length;

 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
 const related=o=>data.filter(r=>C.match(r,OrdersState.orders,OrdersState.links).order?.id===o.id);
 const state=o=>C.status(o,related(o),today());
 const needsRequest=o=>state(o).endsWith('DDT da richiedere');
 const options=(values,first)=>'<option value="">'+E(first)+'</option>'+[...new Set(values.filter(Boolean))].sort().map(v=>'<option>'+E(v)+'</option>').join('');
 function historyFilter(id,values,label){
  const select=$(id),previous=select.value;
  select.innerHTML=options(values,label);
  select.value=values.includes(previous)?previous:'';
 }
 let historyPDFs=[],exportingHistory=false;
 function renderSiteHistory(){
  if($('siteHistory').hidden)return;
  const status=$('historyStatus'),list=$('historyList');
  historyPDFs=[];$('downloadSiteDDTs').disabled=true;
  list.replaceChildren();
  const orders=OrdersState.orders;
  historyFilter('historySite',orders.map(o=>o.site),'Scegli una sede');
  const site=$('historySite').value;
  const siteOrders=orders.filter(o=>o.site===site&&site);
  const entries=siteOrders.map(o=>({order:o,date:o.date,company:o.company,cdc:o.cdc}));
  const selectedIds=new Set(siteOrders.map(o=>o.id));
  if(siteOrders.length){
   for(const ddt of data){
    const order=C.match(ddt,orders,OrdersState.links).order;
    if(order&&selectedIds.has(order.id))entries.push({order,ddt,date:ddt.date,company:order.company||ddt.company,cdc:ddt.cdc||order.cdc});
   }
  }
  historyFilter('historySupplier',entries.map(entry=>entry.company),'Tutti i fornitori');
  historyFilter('historyCDC',entries.map(entry=>entry.cdc),'Tutti i CDC');
  if(!OrdersState.loaded||OrdersState.error){status.textContent=OrdersState.error||'Caricamento degli ordini…';return;}
  if(!site){status.textContent='Scegli una sede per consultare lo storico.';return;}
  const supplier=$('historySupplier').value,cdc=$('historyCDC').value;
  const from=$('historyFrom').value,to=$('historyTo').value;
  if(from&&to&&from>to){status.textContent='La data finale precede quella iniziale.';return;}
  const shown=entries.filter(entry=>{
   const date=C.dateISO(entry.date);
   return (!supplier||entry.company===supplier)&&(!cdc||entry.cdc===cdc)&&
    ((!from&&!to)||(date&&(!from||date>=from)&&(!to||date<=to)));
  }).sort((a,b)=>C.dateISO(b.date).localeCompare(C.dateISO(a.date)));
  historyPDFs=shown.map(entry=>entry.ddt).filter(ddt=>ddt&&isDone(ddt)&&ddt.url);
  $('downloadSiteDDTs').disabled=exportingHistory||!historyPDFs.length;
  status.textContent=shown.length?shown.length+' documenti · '+site:'Nessun documento corrisponde ai filtri.';
  for(const entry of shown){
   const {order,ddt}=entry;
   const title=ddt?'DDT '+(ddt.ddt||ddt.name):'Ordine '+order.number;
   const details=[entry.date,entry.company,entry.cdc,ddt?(ddt.protocol?'Prot. '+ddt.protocol:'Da protocollare'):''].filter(Boolean);
   const button=document.createElement('button');
   button.type='button';button.className='order-card';
   button.innerHTML='<strong>'+E(title)+'</strong><p>'+E(details.join(' · '))+'</p>'+(ddt?'<p>Ordine '+E(order.number)+'</p>':'');
   button.onclick=()=>ddt?openDetail(ddt.row):openOrder(order.id);
   list.append(button);
  }
 }
 const history=$('siteHistory'),historyButton=$('openSiteHistory');
 historyButton.onclick=()=>{
  history.hidden=!history.hidden;
  historyButton.setAttribute('aria-expanded',String(!history.hidden));
  if(!history.hidden){renderSiteHistory();$('historySite').focus();history.scrollIntoView({block:'start'});}
 };
 for(const id of ['historySite','historySupplier','historyCDC','historyFrom','historyTo'])$(id).onchange=renderSiteHistory;
 $('downloadSiteDDTs').onclick=async()=>{
  if(exportingHistory||!historyPDFs.length)return;
  const status=$('historyExportStatus');
  if(!hasSession()){status.textContent='Accedi con Google per scaricare i PDF.';return;}
  if(!window.JSZip){status.textContent='Funzione ZIP non disponibile. Aggiorna la pagina e riprova.';return;}
  const files=historyPDFs.slice(),site=$('historySite').value;
  exportingHistory=true;$('downloadSiteDDTs').disabled=true;
  try{
   const zip=new JSZip(),seen=new Set();
   let size=0;
   for(const [index,ddt] of files.entries()){
    status.textContent='Scaricamento PDF '+(index+1)+' di '+files.length+'…';
    const url=safeDrive(ddt.url);
    const id=url?.pathname.match(/^\/file\/d\/([\w-]+)(?:\/|$)/)?.[1]||url?.searchParams.get('id');
    if(!id||!/^[\w-]{10,}$/.test(id))throw Error('Link al PDF non valido per il DDT '+ddt.ddt+'.');
    if(seen.has(id))continue;
    const bytes=await downloadDrive(id);
    size+=bytes.byteLength;
    if(size>100*1024*1024)throw Error('Lo ZIP supera 100 MB. Seleziona un periodo più breve.');
    seen.add(id);
    const filename=[ddt.company,'DDT',ddt.ddt,ddt.protocol?'Prot_'+ddt.protocol:''].filter(Boolean).join('_').replace(/[^\w.-]+/g,'-');
    zip.file(String(index+1).padStart(3,'0')+'_'+filename+'.pdf',bytes);
   }
   status.textContent='Preparazione dello ZIP…';
   const blob=await zip.generateAsync({type:'blob'});
   const href=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=href;link.download='DDT_'+site.replace(/[^\w-]+/g,'_')+'.zip';
   document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(href),60000);
   status.textContent='ZIP pronto · '+seen.size+' PDF.';
  }catch(error){status.textContent='Scaricamento interrotto. '+error.message;}
  finally{exportingHistory=false;$('downloadSiteDDTs').disabled=!historyPDFs.length;}
 };

 const monthSummary=$('monthSummary'),summaryButton=$('openMonthSummary');
 const summaryColumns=[
  ['orders','Ordini'],['linked','Ordini con DDT'],['requests','DDT da richiedere'],['pending','DDT da protocollare']
 ];
 let summarySelection=null;
 function monthlyGroups(month,orders,documents,links,currentDate){
  const linkedByOrder=new Map();
  for(const document of documents){
   const order=C.match(document,orders,links).order;
   if(!order)continue;
   if(!linkedByOrder.has(order.id))linkedByOrder.set(order.id,[]);
   linkedByOrder.get(order.id).push(document);
  }
  const groups=new Map();
  for(const order of orders){
   if(order.manual==='ANNULLATO'||C.dateISO(order.date).slice(0,7)!==month)continue;
   const site=order.site||'Sede da verificare',cdc=order.cdc||'CDC da verificare';
   const key=JSON.stringify([site,cdc]);
   if(!groups.has(key))groups.set(key,{key,site,cdc,orders:[],linked:[],requests:[],pending:[]});
   const group=groups.get(key),documents=linkedByOrder.get(order.id)||[];
   group.orders.push(order);
   if(documents.length)group.linked.push(order);
   if(C.status(order,documents,currentDate).endsWith('DDT da richiedere'))group.requests.push(order);
   group.pending.push(...documents.filter(document=>!isDone(document)&&!document.url));
  }
  return [...groups.values()].sort((a,b)=>a.site.localeCompare(b.site,'it')||a.cdc.localeCompare(b.cdc,'it'));
 }
 function renderMonthlySummary(){
  if(monthSummary.hidden)return;
  const body=$('summaryGroups'),detail=$('summaryDetails'),list=$('summaryDetailList'),status=$('summaryStatus');
  body.replaceChildren();list.replaceChildren();detail.hidden=true;
  if(!OrdersState.loaded||OrdersState.error){status.textContent=OrdersState.error||'Accedi con Google e aggiorna gli ordini.';return;}
  const month=$('summaryMonth').value;
  if(!/^\d{4}-\d{2}$/.test(month)){status.textContent='Seleziona un mese.';return;}
  const groups=monthlyGroups(month,OrdersState.orders,data,OrdersState.links,today());
  status.textContent=groups.length?'Seleziona un conteggio per aprire l’elenco.':'Nessun ordine per il mese selezionato.';
  for(const group of groups){
   const row=document.createElement('tr');
   for(const [label,value] of [['Sede',group.site],['CDC',group.cdc]]){
    const cell=document.createElement('td');cell.dataset.label=label;cell.textContent=value;row.append(cell);
   }
   for(const [key,label] of summaryColumns){
    const cell=document.createElement('td'),count=group[key].length;
    cell.dataset.label=label;
    if(count){
     const button=document.createElement('button');
     button.type='button';button.className='btn';button.textContent=count;
     button.setAttribute('aria-label',label+' · '+group.site+' · '+group.cdc+' · '+count);
     button.onclick=()=>{
      summarySelection={group:group.key,key};
      renderMonthlySummary();
      $('summaryDetailTitle').focus();
     };
     cell.append(button);
    }else cell.textContent='0';
    row.append(cell);
   }
   body.append(row);
  }
  const group=groups.find(item=>item.key===summarySelection?.group);
  if(!group||!group[summarySelection.key].length)return;
  const key=summarySelection.key,ddt=key==='pending';
  $('summaryDetailTitle').textContent=summaryColumns.find(column=>column[0]===key)[1]+' · '+group.site+' · '+group.cdc;
  for(const record of group[key].slice().sort((a,b)=>C.dateISO(b.date).localeCompare(C.dateISO(a.date)))){
   const button=document.createElement('button');
   button.type='button';button.className='order-card';
   const title=ddt?'DDT '+(record.ddt||record.name):'Ordine '+(record.number||'da verificare');
   const info=[record.company,record.date,ddt&&record.protocol?'Prot. '+record.protocol:''].filter(Boolean).join(' · ');
   button.innerHTML='<strong>'+E(title)+'</strong><p>'+E(info)+'</p>';
   button.onclick=()=>ddt?openDetail(record.row):openOrder(record.id);
   list.append(button);
  }
  detail.hidden=false;
 }
 summaryButton.onclick=()=>{
  monthSummary.hidden=!monthSummary.hidden;
  summaryButton.setAttribute('aria-expanded',String(!monthSummary.hidden));
  if(monthSummary.hidden)return;
  if(!$('summaryMonth').value)$('summaryMonth').value=today().slice(0,7);
  renderMonthlySummary();$('summaryMonth').focus();
 };
 $('summaryMonth').onchange=()=>{summarySelection=null;renderMonthlySummary();};

 function highlight(){document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav==='orders'));}
 function renderOverview(){
 const all=OrdersState.orders,ready=OrdersState.loaded&&!OrdersState.error;
 const metrics=[['Ordini totali',all.length,''],['Senza DDT',all.filter(o=>!related(o).length&&o.manual!=='ANNULLATO').length,'unlinked'],['DDT da richiedere',all.filter(needsRequest).length,'request'],['Consegnati',all.filter(o=>state(o)==='Consegnato').length,'Consegnato']];
 $('overviewMetrics').innerHTML=metrics.map(([label,n,mode])=>'<button class="overview-metric" data-order-quick="'+E(mode)+'"><span>'+label+'</span><strong>'+(ready?n:'—')+'</strong><small>Apri ordini →</small></button>').join('');
 $('overviewHint').textContent=OrdersState.error||(!ready?'Accedi con Google e aggiorna per visualizzare gli ordini.':'Un DDT collegato documenta la consegna. Senza DDT, verifica la merce o richiedi il documento.');
 }
 function renderOrders(){
 renderOverview();renderSiteHistory();renderMonthlySummary();
 document.querySelectorAll('.order-quick-filters [data-order-quick]').forEach(b=>{const active=b.dataset.orderQuick===$('orderFilter').value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const q=$('orderSearch').value.toLocaleLowerCase('it'),mode=$('orderFilter').value,supplier=$('orderSupplier').value,cdc=$('orderCDC').value;
 $('ordersConnection').textContent=OrdersState.error||(!OrdersState.loaded?'Accedi con Google per leggere gli ordini.':'Importazione email: '+(OrdersState.config['Stato importazione']||'NON ATTIVA')+' · Ultimo controllo: '+(OrdersState.config['Ultimo controllo']||'non ancora eseguito'));
 const all=OrdersState.orders,waiting=all.filter(o=>!related(o).length&&o.manual!=='ANNULLATO');
 $('ordersStats').innerHTML=[['Ordini',all.length],['Senza DDT',waiting.length],['DDT da richiedere',all.filter(needsRequest).length],['Consegnati',all.filter(o=>state(o)==='Consegnato').length]].map(([label,n])=>'<div class="stat"><small>'+label+'</small><strong>'+(OrdersState.loaded&&!OrdersState.error?n:'—')+'</strong></div>').join('');
 for(const id of requestSelection){const o=all.find(o=>o.id===id);if(!o||!eligibleForRequest(o))requestSelection.delete(id);}
 const list=all.filter(o=>(!supplier||o.company===supplier)&&(!cdc||o.cdc===cdc)&&(!q||[o.number,o.company,o.site,o.cdc,o.date,o.notes,o.address].join(' ').toLocaleLowerCase('it').includes(q))&&(!mode||(mode==='unlinked'?!related(o).length&&o.manual!=='ANNULLATO':mode==='request'?needsRequest(o):state(o)===mode))).slice().reverse();
 visibleOrders=list;
 $('orderList').innerHTML=list.map(o=>{const linked=related(o),s=state(o);return '<article class="order-select-card">'+(eligibleForRequest(o)?'<label class="ddt-order-select"><input type="checkbox" data-request-order="'+E(o.id)+'" '+(requestSelection.has(o.id)?'checked':'')+'>Seleziona per richiesta DDT</label>':'')+'<button type="button" class="order-card" data-order="'+E(o.id)+'"><div class="order-card-top"><strong>'+E(o.number||'Numero da verificare')+'</strong><span class="badge '+(s==='Consegnato'?'green':'orange')+'">'+E(s)+'</span></div><b>'+E(o.site||'Sede da verificare')+'</b><p class="order-delivery-address">'+E(C.deliveryAddress(o.address)||o.address||'Indirizzo di consegna da verificare')+'</p><p>'+E(o.company||'Fornitore da verificare')+' · '+E(o.cdc||'CDC da verificare')+'</p><div class="order-card-meta"><span>Ordine: '+E(o.date||'—')+'</span></div><p>'+linked.length+' DDT collegati'+(!linked.length?' · Nessuna consegna documentata':'')+'</p>'+(o.warnings?'<p class="order-warning">'+E(o.warnings)+'</p>':'')+'<span class="order-open">Consulta ordine e PDF ↗</span></button></article>';}).join('');
 $('ordersEmpty').hidden=list.length>0;$('ordersEmpty').textContent=!OrdersState.loaded?'Accedi con Google e aggiorna per visualizzare gli ordini.':all.length?'Nessun ordine corrisponde ai filtri.':'Nessun ordine importato. Completa l’attivazione della lettura email per acquisire i PDF nella casella business.';
 syncMailBook();renderRequestSelection();renderMailBook();
 if(visible)highlight();
 }
 function renderRequestSelection(){
 const orders=OrdersState.orders.filter(o=>requestSelection.has(o.id)&&eligibleForRequest(o));
 const groups=M.group(orders);
 $('ddtSelectionCount').textContent=orders.length?orders.length+' ordini selezionati · '+groups.length+' fornitori (anche fuori dai filtri attuali)':'Nessun ordine selezionato';
 $('prepareDDTRequests').disabled=!orders.length||!OrdersState.loaded||Boolean(OrdersState.error);
 $('clearDDTSelection').disabled=!orders.length;
 $('selectMissingDDT').disabled=!OrdersState.loaded||Boolean(OrdersState.error)||!visibleOrders.some(eligibleForRequest);
 }
 function renderMailBook(){
 if(mailBookDirty||$('supplierMailFields').contains(document.activeElement))return;
 const contacts=new Map(M.suppliers.map(s=>[s.key,s]));
 for(const o of OrdersState.orders){if(o.company){const c=M.supplier(o.company);contacts.set(c.key,c);}}
 $('supplierMailFields').innerHTML=[...contacts.values()].map(c=>'<label>'+E(c.name)+'<input type="text" autocomplete="off" data-supplier-mail="'+E(c.key)+'" value="'+E(emailFor(c))+'" placeholder="Email separate da punto e virgola"></label>').join('');
 }
 function syncMailBook(){
 if(mailBookDirty)return;
 try{const saved=JSON.parse(OrdersState.config['Email fornitori']||'{}');mailOverrides=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{mailOverrides={};}
 }
 $('supplierMailFields').addEventListener('input',()=>{mailBookDirty=true;});
 $('saveSupplierEmails').onclick=async()=>{
 const button=$('saveSupplierEmails');
 if(!hasSession()||!OrdersState.loaded||OrdersState.error)return toast('Accedi con Google e aggiorna gli ordini prima di salvare la rubrica.');
 try{
 const next={...mailOverrides};for(const input of $('supplierMailFields').querySelectorAll('[data-supplier-mail]')){const value=input.value.trim();next[input.dataset.supplierMail]=value?M.recipients(value).join('; '):'';}
 const serialized=JSON.stringify(next),previous=OrdersState.config['Email fornitori']||'';
 button.disabled=true;
 await withOrdersLock(async()=>{
 const rows=await ordersRead('OrdiniConfig','A1:B'+(OrdersState.bounds?.OrdiniConfig||1000));
 const matching=rows.map((row,i)=>({row,i})).filter(x=>x.row[0]==='Email fornitori');
 if(matching.length>1)throw Error('Rubrica duplicata nel registro: verifica OrdiniConfig.');
 if(String(matching[0]?.row[1]||'')!==previous)throw Error('La rubrica è cambiata da un altro dispositivo. Aggiorna gli ordini prima di salvare.');
 if(matching.length)await ordersWrite('OrdiniConfig','A'+(matching[0].i+1)+':B'+(matching[0].i+1),[['Email fornitori',serialized]]);
 else await ordersAppend('OrdiniConfig',[['Email fornitori',serialized]]);
 });
 OrdersState.config['Email fornitori']=serialized;mailOverrides=next;mailBookDirty=false;toast('Email fornitori salvate nel registro Google privato.');
 }catch(error){toast(error.message||'Impossibile salvare gli indirizzi.');}finally{button.disabled=false;}
 };
 $('importSupplierEmails').onclick=()=>$('supplierEmailsFile').click();
 $('supplierEmailsFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
 if(file.size>100000)throw Error('Il file della rubrica è troppo grande.');
 const book=JSON.parse(await file.text());if(book.format!=='ddt-supplier-emails-v1'||!Array.isArray(book.suppliers)||book.suppliers.length>100)throw Error('Scegli il file email fornitori DDT.');
 const entries=book.suppliers.map(entry=>{if(!entry||typeof entry.supplier!=='string'||!entry.supplier.trim()||typeof entry.emails!=='string')throw Error('Voce fornitore non valida.');return {contact:M.supplier(entry.supplier),emails:M.recipients(entry.emails).join('; ')};});
 const fields=$('supplierMailFields');
 for(const {contact,emails}of entries){let input=[...fields.querySelectorAll('[data-supplier-mail]')].find(el=>el.dataset.supplierMail===contact.key);if(!input){const label=document.createElement('label');label.textContent=contact.name;input=document.createElement('input');input.dataset.supplierMail=contact.key;input.autocomplete='off';label.append(input);fields.append(label);}input.value=emails;}
 mailBookDirty=true;toast('Rubrica importata. Premi Salva email fornitori per conservarla nel registro Google privato.');
 }catch(error){toast(error.message||'File rubrica non valido.');}finally{e.target.value='';}
 };
 $('orderList').addEventListener('change',e=>{const checkbox=e.target.closest('[data-request-order]');if(!checkbox)return;const o=OrdersState.orders.find(o=>o.id===checkbox.dataset.requestOrder);if(!o||!eligibleForRequest(o))return;checkbox.checked?requestSelection.add(o.id):requestSelection.delete(o.id);renderRequestSelection();});
 $('selectMissingDDT').onclick=()=>{visibleOrders.filter(eligibleForRequest).forEach(o=>requestSelection.add(o.id));renderOrders();};
 $('clearDDTSelection').onclick=()=>{requestSelection.clear();renderOrders();};
 $('closeDDTRequests').onclick=()=>$('ddtRequestDialog').close();
 function updateDraftLink(card){
 const draft=requestDrafts[Number(card.dataset.draft)],to=card.querySelector('[data-mail-to]').value,subject=card.querySelector('[data-mail-subject]').value,body=card.querySelector('[data-mail-body]').value;
 const link=card.querySelector('[data-open-mail]'),hint=card.querySelector('[data-mail-hint]');
 draft.to=to;draft.subject=subject;draft.body=body;
 try{const href=M.mailto(to,subject,body);if(href.length>1800)throw Error('Email lunga: usa “Copia email” e incolla il testo in Outlook.');link.href=href;link.removeAttribute('aria-disabled');hint.textContent='';}
 catch(error){link.removeAttribute('href');link.setAttribute('aria-disabled','true');hint.textContent=error.message;}
 }
 $('prepareDDTRequests').onclick=()=>{
 const orders=OrdersState.orders.filter(o=>requestSelection.has(o.id)&&eligibleForRequest(o));if(!orders.length)return toast('Seleziona almeno un ordine senza DDT.');
 requestDrafts=[];
 for(const group of M.group(orders)){
 const to=emailFor(group);let parts=[group.orders];try{parts=M.batches(group.orders,to);}catch{}
 for(const [i,part]of parts.entries())requestDrafts.push({...M.draft(part.map(o=>({...o,address:C.deliveryAddress(o.address)||o.address}))),to,supplier:group.name,part:parts.length>1?' · richiesta '+(i+1)+' di '+parts.length:'',ids:part.map(o=>o.id)});
 }
 $('ddtRequestHint').textContent=requestDrafts.length+' email preparate. Gli ordini di fornitori diversi rimangono separati. Le richieste lunghe vengono suddivise.';
 $('ddtRequestDrafts').innerHTML=requestDrafts.map((d,i)=>'<section class="ddt-mail-draft" data-draft="'+i+'"><h3>'+E(d.supplier)+E(d.part)+'</h3><label>Destinatari<input data-mail-to value="'+E(d.to)+'" placeholder="Inserisci l’email del fornitore"></label><label>Oggetto<input data-mail-subject value="'+E(d.subject)+'"></label><label>Messaggio<textarea data-mail-body rows="12">'+E(d.body)+'</textarea></label><p class="order-note" data-mail-hint role="status"></p><div class="actions"><a class="btn primary" data-open-mail>Apri email</a><button class="btn" data-copy-mail>Copia email</button></div></section>').join('');
 $('ddtRequestDrafts').querySelectorAll('[data-draft]').forEach(updateDraftLink);
 $('ddtRequestDialog').showModal();
 };
 $('ddtRequestDrafts').addEventListener('input',e=>{const card=e.target.closest('[data-draft]');if(card)updateDraftLink(card);});
 $('ddtRequestDrafts').addEventListener('click',async e=>{
 const card=e.target.closest('[data-draft]');if(!card)return;
 if(e.target.closest('[data-open-mail]')){
 updateDraftLink(card);const d=requestDrafts[Number(card.dataset.draft)];
 if(d.ids.some(id=>{const o=OrdersState.orders.find(o=>o.id===id);return !o||!eligibleForRequest(o);})){e.preventDefault();return toast('Gli ordini sono cambiati: chiudi e prepara di nuovo la richiesta.');}
 if(!card.querySelector('[data-open-mail]').hasAttribute('href'))e.preventDefault();
 }
 if(e.target.closest('[data-copy-mail]')){
 updateDraftLink(card);const d=requestDrafts[Number(card.dataset.draft)];
 try{await navigator.clipboard.writeText('Destinatari: '+d.to+'\nOggetto: '+d.subject+'\n\n'+d.body);toast('Email copiata. Incollala in Outlook.');}catch{toast('Copia non disponibile: seleziona il testo del messaggio.');}
 }
 });
 function syncFilters(){for(const[id,key,label]of [['orderSupplier','company','Tutti i fornitori'],['orderCDC','cdc','Tutti i CDC']]){const value=$(id).value;$(id).innerHTML=options(OrdersState.orders.map(o=>o[key]),label);$(id).value=value;}}
 async function load(){if(!hasSession()){OrdersState.loaded=false;OrdersState.orders=[];OrdersState.links=[];OrdersState.error='Accedi con Google per leggere gli ordini.';renderOrders();return;}
 try{await fetchOrders();syncFilters();}catch(error){OrdersState.error=error.message;}renderOrders();if(selected&&!$('overlay').classList.contains('hidden'))renderDDTOrderInfo(selected);}
 window.orderFormDirty=()=>dialog.open&&selectedOrder&&[...dialog.querySelectorAll('[data-order-field]')].some(el=>String(el.value).trim()!==String(selectedOrder[el.dataset.orderField]||''));
 window.addEventListener('beforeunload',event=>{if(OrdersState.busy){event.preventDefault();event.returnValue='';}});
 const baseNav=nav;nav=function(mode){visible=mode==='orders';baseNav(visible?'all':mode);section.hidden=!visible;
 if(!visible){history.hidden=true;historyButton.setAttribute('aria-expanded','false');monthSummary.hidden=true;summaryButton.setAttribute('aria-expanded','false');}
 if(visible){$('registry').classList.add('hidden');$('help').classList.add('hidden');document.querySelector('.head h1').textContent='Ordini e consegne';highlight();renderOrders();if(!OrdersState.loaded)load();if(window.matchMedia('(max-width:720px)').matches)requestAnimationFrame(()=>section.scrollIntoView({block:'start'}));}
 else document.querySelector('.head h1').textContent='Registro documenti';
 $('ddtStats').hidden=visible||mode==='help';
 $('orderOverview').hidden=mode!=='all';
 const titles={all:'Ordini e DDT',pending:'DDT da protocollare',done:'DDT protocollati',issues:'DDT da verificare',orders:'Ordini e consegne',help:'Impostazioni'};
 document.querySelector('.head h1').textContent=titles[mode]||'Ordini e DDT';
 $('pageIntro').textContent=visible?'Controlla sede, indirizzo e DDT collegati a ogni ordine.':mode==='help'?'Gestisci il collegamento al registro e ai documenti.':'Controlla gli ordini, verifica i DDT e ritrova le consegne per sede.';
 document.body.dataset.view=mode;
 document.querySelectorAll('[data-nav]').forEach(b=>{if(b.classList.contains('active'))b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 for(const id of ['scanFolder','protocolAll','uploadDDT','import'])$(id).hidden=visible;
 };
 const baseApply=apply;apply=function(rows){baseApply(rows);renderOrders();if(visible)highlight();};
 const baseRefresh=refresh;refresh=async()=>{await baseRefresh();await load();};$('refresh').onclick=refresh;
 const baseEditor=renderDetailEditor;
 renderDetailEditor=function(r){baseEditor(r);renderDDTOrderInfo(r);};
 function renderDDTOrderInfo(r){
  $('ddtOrderInfo')?.remove();
  const box=document.createElement('div');
  box.id='ddtOrderInfo';box.className='notice';
  const match=C.match(r,OrdersState.orders,OrdersState.links);
  box.innerHTML=match.order
   ?'<div><b>Ordine collegato: '+E(match.order.number)+'</b>'+E(match.order.site)+' · '+(match.manual?'collegamento manuale':'riconosciuto automaticamente')+'</div><button type="button" class="btn">Consulta ordine</button>'
   :'<div><b>Ordine non collegato</b>'+E(OrdersState.loaded?match.warning:'Aggiorna gli ordini per cercare una corrispondenza.')+'</div>';
  if(match.order)box.querySelector('button').onclick=()=>openOrder(match.order.id);
  if(!match.order&&hasSession()&&live){
   const chooser=document.createElement('details');
   chooser.innerHTML='<summary>Collega a un ordine</summary><p>Cerca per numero, sede, fornitore o CDC e verifica i dati prima di collegare.</p><label>Cerca ordine <input type="search" placeholder="Numero, sede, fornitore o CDC"></label><div class="order-list"></div><p role="status"></p>';
   box.append(chooser);
   const search=chooser.querySelector('input'),list=chooser.querySelector('.order-list'),status=chooser.querySelector('[role=status]');
   const supplier=C.company(r.company);
   const renderCandidates=()=>{
    const query=C.norm(search.value);
    const exact=new Set(C.candidates(r,OrdersState.orders).map(order=>order.id));
    const rank=o=>exact.has(o.id)?3:supplier&&C.company(o.company)===supplier?(C.norm(o.cdc)===C.norm(r.cdc)?2:1):0;
    const found=OrdersState.orders.filter(o=>o.number&&C.norm(o.manual)!=='ANNULLATO'&&
     (query?C.norm([o.number,o.site,o.address,o.company,o.cdc].join(' ')).includes(query):rank(o)>0))
     .sort((a,b)=>rank(b)-rank(a)||C.dateISO(b.date).localeCompare(C.dateISO(a.date)));
    list.replaceChildren();
    status.textContent=!found.length?'Nessun ordine trovato. Prova a cercare per numero.':found.length>20?'Sono mostrati i primi 20 risultati. Restringi la ricerca per vederne altri.':'';
    for(const order of found.slice(0,20)){
     const button=document.createElement('button');button.type='button';button.className='order-card';
     button.innerHTML='<strong>'+E(order.number)+'</strong><p>'+E([order.company,order.site,order.cdc,order.date].filter(Boolean).join(' · '))+'</p>';
     button.onclick=async()=>{
      if(!window.confirm('Collegare il DDT '+r.ddt+' all’ordine '+order.number+'?'))return;
      search.disabled=true;
      list.querySelectorAll('button').forEach(item=>item.disabled=true);
      try{await linkDDTToOrder(r,order);await load();toast('DDT collegato all’ordine '+order.number+'.');}
      catch(error){status.textContent=error.message;}
      finally{search.disabled=false;list.querySelectorAll('button').forEach(item=>item.disabled=false);}
     };
     list.append(button);
    }
   };
   search.oninput=renderCandidates;
   chooser.ontoggle=async()=>{
    if(!chooser.open)return;
    if(!OrdersState.loaded||OrdersState.error){
     status.textContent='Caricamento degli ordini…';
     try{await fetchOrders();syncFilters();renderOrders();}catch(error){status.textContent=error.message;return;}
    }
    renderCandidates();search.focus();
   };
  }
  $('preview').before(box);
 }
 function releasePDF(){if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL='';}
 dialog.addEventListener('close',()=>{releasePDF();$('orderPDF').innerHTML='';});
 $('closeOrder').onclick=()=>dialog.close();
 function openOrder(id){const o=OrdersState.orders.find(x=>x.id===id);if(!o)return;selectedOrder=o;releasePDF();$('orderPDF').innerHTML='';$('orderDialogTitle').textContent=o.number||'Ordine da verificare';
 const labels=[['number','Ordine Dussmann'],['company','Fornitore'],['site','Sede destinazione'],['address','Indirizzo di consegna (via, civico e città)'],['cdc','Centro di costo'],['date','Data ordine (gg/mm/aaaa)']];
 $('orderFields').innerHTML=labels.map(([key,label])=>'<label>'+label+'<input data-order-field="'+key+'" value="'+E(o[key])+'"></label>').join('')+'<label>Stato consegna<select data-order-field="manual">'+[['APERTO','Automatico — DDT collegati e fine mese'],['DDT_FINE_MESE','DDT da richiedere — fine mese'],['DDT_DA_RICHIEDERE','Merce ricevuta, DDT da richiedere'],['PARZIALE','Parzialmente ricevuto'],['COMPLETATO','Merce ricevuta — registrazione precedente'],['ANNULLATO','Annullato']].map(([v,l])=>'<option value="'+v+'" '+(o.manual===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Note<textarea data-order-field="notes">'+E(o.notes)+'</textarea></label>';
 $('orderWarnings').textContent=o.warnings||'Nessuna anomalia di lettura segnalata.';$('orderVerified').checked=false;
 $('orderRelated').innerHTML=related(o).map(r=>'<button class="btn" data-related-ddt="'+r.row+'">DDT '+E(r.ddt)+' · '+E(r.company)+' · '+E(r.date)+' · '+E(r.status)+'</button>').join('')||'<p>Nessun DDT collegato: verifica se la merce deve ancora arrivare oppure richiedi il DDT al fornitore.</p>';
 $('orderDDTSelect').innerHTML='<option value="">Scegli un DDT dal registro…</option>'+data.map(r=>'<option value="'+r.row+'">'+E(r.company)+' · '+E(r.ddt)+' · '+E(r.date)+' · '+E(r.cdc)+' · riga '+r.row+'</option>').join('');
 const reminder=$('orderDdtReminder'),push=$('orderDdtPush');
 const canRemind=o.fileId&&o.site&&C.orderRef(o.number)?.full&&!o.warnings&&o.manual!=='ANNULLATO'&&!related(o).length;
 reminder.hidden=!canRemind;
 push.hidden=!canRemind;
 if(canRemind){
  const url=new URL('https://giovannipiccionebusiness-sudo.github.io/magazzini-dussmann/');
  url.searchParams.set('sollecita-ddt',o.id);
  push.href=url.href;
  url.searchParams.delete('sollecita-ddt');
  url.searchParams.set('ordine-ddt',o.id);
  const message=['📦 *MAGAZZINI DUSSMANN*','*Verifica consegna e caricamento DDT*','',
    '📍 *Sede:* '+o.site,'📄 *Ordine:* '+o.number,'🏢 *Fornitore:* '+o.company,'',
    'Ciao! Puoi verificare se è arrivata la merce di questo ordine?',
    '✅ *Merce arrivata:* carica il DDT nell’app.',
    '⚠️ *DDT mancante o merce non arrivata:* contatta il responsabile.','',
    '👇 *Apri il PDF dell’ordine e carica il DDT*',url.href,
    '', 'Accedi con il tuo account Magazzini Dussmann.'].join('\n');
  reminder.href='https://wa.me/?text='+encodeURIComponent(message);
 }else{reminder.removeAttribute('href');push.removeAttribute('href');}
 $('orderAddress').textContent='Consegna: '+(C.deliveryAddress(o.address)||o.address||'Indirizzo non rilevato');$('openOrderPDF').disabled=!o.fileId;
 if(!dialog.open)dialog.showModal();
 }
 $('orderList').onclick=e=>{const button=e.target.closest('[data-order]');if(button)openOrder(button.dataset.order);};
 $('orderRelated').onclick=e=>{const button=e.target.closest('[data-related-ddt]');if(button){dialog.close();openDetail(Number(button.dataset.relatedDdt));}};
 $('saveOrder').onclick=async()=>{if(!selectedOrder)return;const values=Object.fromEntries([...dialog.querySelectorAll('[data-order-field]')].map(el=>[el.dataset.orderField,el.value]));
 values.verified=$('orderVerified').checked;
 const changed=['number','company','site','date'].some(key=>values[key].trim()!==selectedOrder[key]);
 if(changed&&!window.confirm('Confermi la correzione e la nuova archiviazione del PDF per sede, anno, mese e fornitore?'))return;
 $('saveOrder').disabled=true;try{await saveOrderDetails(selectedOrder,values);const id=selectedOrder.id;await load();openOrder(id);toast('Ordine aggiornato nel registro e su Drive.');}catch(error){toast(error.message);}finally{$('saveOrder').disabled=false;}};
 $('openOrderPDF').onclick=()=>{
 if(!selectedOrder?.fileId)return;
 const order=selectedOrder;
 DDTPDFViewer.open({load:()=>downloadDrive(order.fileId),filename:'Ordine-'+(order.number||'documento')+'.pdf',title:'Ordine '+(order.number||'')});
};
 $('linkOrderDDT').onclick=async()=>{const r=data.find(x=>x.row===Number($('orderDDTSelect').value));if(!r||!selectedOrder)return toast('Seleziona il DDT da collegare.');
 if(!window.confirm('Collegare il DDT '+r.ddt+' ('+r.company+') all’ordine '+selectedOrder.number+'? L’eventuale collegamento precedente verrà sostituito.'))return;
 $('linkOrderDDT').disabled=true;try{await linkDDTToOrder(r,selectedOrder);const id=selectedOrder.id;await load();openOrder(id);toast('DDT collegato all’ordine.');}catch(error){toast(error.message);}finally{$('linkOrderDDT').disabled=false;}};
 $('saveOrderSite').onclick=async()=>{const button=$('saveOrderSite');button.disabled=true;try{await addOrderSite($('newOrderSite').value,$('newOrderCDC').value,$('newOrderAddress').value);await load();for(const id of ['newOrderSite','newOrderCDC','newOrderAddress'])$(id).value='';toast('Sede salvata per le prossime importazioni.');}catch(error){toast(error.message);}finally{button.disabled=false;}};
 $('refreshOrders').onclick=()=>refresh();
 for(const id of ['orderSearch','orderFilter','orderSupplier','orderCDC'])$(id).addEventListener(id==='orderSearch'?'input':'change',renderOrders);
 $('ordersFolder').onclick=()=>{const id=OrdersState.config['Cartella ordini'];if(id&&/^[\w-]{10,}$/.test(id))window.open('https://drive.google.com/drive/folders/'+id,'_blank','noopener');else toast('Accedi con Google e aggiorna gli ordini.');};
 $('overviewOrders').onclick=()=>{ $('orderFilter').value='';nav('orders'); };
 document.addEventListener('click',e=>{const b=e.target.closest('[data-order-quick]');if(!b)return;$('orderFilter').value=b.dataset.orderQuick;nav('orders');});
 for(const [id,mode] of [['total','all'],['pending','pending'],['done','done'],['issues','issues']]){const card=$(id).closest('.stat');card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Mostra '+card.querySelector('small').textContent);card.onclick=()=>nav(mode);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();nav(mode);}};}
 renderOverview();renderRequestSelection();renderMailBook();
 if(hasSession())load();
})();
