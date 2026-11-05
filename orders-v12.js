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
 const options=(values,first)=>'<option value="">'+E(first)+'</option>'+[...new Set(values.filter(Boolean))].sort().map(v=>'<option>'+E(v)+'</option>').join('');
 function highlight(){document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav==='orders'));}
 function renderOverview(){
 const all=OrdersState.orders,ready=OrdersState.loaded&&!OrdersState.error;
 const metrics=[['Ordini totali',all.length,''],['Senza DDT',all.filter(o=>!related(o).length&&o.manual!=='ANNULLATO').length,'unlinked'],['DDT da richiedere',all.filter(o=>state(o)==='Merce ricevuta, DDT da richiedere').length,'Merce ricevuta, DDT da richiedere'],['Consegnati',all.filter(o=>state(o)==='Consegnato').length,'Consegnato']];
 $('overviewMetrics').innerHTML=metrics.map(([label,n,mode])=>'<button class="overview-metric" data-order-quick="'+E(mode)+'"><span>'+label+'</span><strong>'+(ready?n:'—')+'</strong><small>Apri ordini →</small></button>').join('');
 $('overviewHint').textContent=OrdersState.error||(!ready?'Accedi con Google e aggiorna per visualizzare gli ordini.':'Un DDT collegato documenta la consegna. Senza DDT, verifica la merce o richiedi il documento.');
 }
 function renderOrders(){
 renderOverview();
 document.querySelectorAll('.order-quick-filters [data-order-quick]').forEach(b=>{const active=b.dataset.orderQuick===$('orderFilter').value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 const q=$('orderSearch').value.toLocaleLowerCase('it'),mode=$('orderFilter').value,supplier=$('orderSupplier').value,cdc=$('orderCDC').value;
 $('ordersConnection').textContent=OrdersState.error||(!OrdersState.loaded?'Accedi con Google per leggere gli ordini.':'Importazione email: '+(OrdersState.config['Stato importazione']||'NON ATTIVA')+' · Ultimo controllo: '+(OrdersState.config['Ultimo controllo']||'non ancora eseguito'));
 const all=OrdersState.orders,waiting=all.filter(o=>!related(o).length&&o.manual!=='ANNULLATO');
 $('ordersStats').innerHTML=[['Ordini',all.length],['Senza DDT',waiting.length],['DDT da richiedere',all.filter(o=>state(o)==='Merce ricevuta, DDT da richiedere').length],['Consegnati',all.filter(o=>state(o)==='Consegnato').length]].map(([label,n])=>'<div class="stat"><small>'+label+'</small><strong>'+(OrdersState.loaded&&!OrdersState.error?n:'—')+'</strong></div>').join('');
 for(const id of requestSelection){const o=all.find(o=>o.id===id);if(!o||!eligibleForRequest(o))requestSelection.delete(id);}
 const list=all.filter(o=>(!supplier||o.company===supplier)&&(!cdc||o.cdc===cdc)&&(!q||[o.number,o.company,o.site,o.cdc,o.date,o.notes,o.address].join(' ').toLocaleLowerCase('it').includes(q))&&(!mode||(mode==='unlinked'?!related(o).length&&o.manual!=='ANNULLATO':state(o)===mode))).slice().reverse();
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
 try{await fetchOrders();syncFilters();}catch(error){OrdersState.error=error.message;}renderOrders();}
 window.orderFormDirty=()=>dialog.open&&selectedOrder&&[...dialog.querySelectorAll('[data-order-field]')].some(el=>String(el.value).trim()!==String(selectedOrder[el.dataset.orderField]||''));
 window.addEventListener('beforeunload',event=>{if(OrdersState.busy){event.preventDefault();event.returnValue='';}});
 const baseNav=nav;nav=function(mode){visible=mode==='orders';baseNav(visible?'all':mode);section.hidden=!visible;
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
 const baseEditor=renderDetailEditor;renderDetailEditor=function(r){baseEditor(r);$('ddtOrderInfo')?.remove();const box=document.createElement('div');box.id='ddtOrderInfo';box.className='notice';const match=C.match(r,OrdersState.orders,OrdersState.links);
 box.innerHTML=match.order?'<div><b>Ordine collegato: '+E(match.order.number)+'</b>'+E(match.order.site)+' · '+(match.manual?'collegamento manuale':'riconosciuto automaticamente')+'</div><button type="button" class="btn">Consulta ordine</button>':'<div><b>Ordine non collegato</b>'+E(!OrdersState.loaded?'Apri Ordini e aggiorna il registro.':match.warning)+'. Puoi collegarlo dalla scheda dell’ordine.</div><button type="button" class="btn">Vai agli ordini</button>';
 box.querySelector('button').onclick=()=>{if(match.order)openOrder(match.order.id);else{closeDetail();nav('orders');}};
 $('preview').before(box);
 };
 const baseParse=parseDDT;parseDDT=function(text){const r=baseParse(text);const areas=String(text).match(/(?:RIF\.?\s*VS\.?\s*ORDINE(?:\s*N\.?)?|Rif\.?\s*Ordine\s*Cliente|Vs\.?\s*riferimento|ORD\.?\s*A|Ordine\s+Dussmann)[\s\S]{0,90}/gi)||[];
 for(const area of areas){const full=area.match(/\bA\s*[/ ]?\s*20\d{2}\s*[/ ]?\s*\d{6}\b/i);if(full){r.order=C.orderRef(full[0]).full;break;}}
 return r;};
 function releasePDF(){if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL='';}
 dialog.addEventListener('close',()=>{releasePDF();$('orderPDF').innerHTML='';});
 $('closeOrder').onclick=()=>dialog.close();
 function openOrder(id){const o=OrdersState.orders.find(x=>x.id===id);if(!o)return;selectedOrder=o;releasePDF();$('orderPDF').innerHTML='';$('orderDialogTitle').textContent=o.number||'Ordine da verificare';
 const labels=[['number','Ordine Dussmann'],['company','Fornitore'],['site','Sede destinazione'],['address','Indirizzo di consegna (via, civico e città)'],['cdc','Centro di costo'],['date','Data ordine (gg/mm/aaaa)']];
 $('orderFields').innerHTML=labels.map(([key,label])=>'<label>'+label+'<input data-order-field="'+key+'" value="'+E(o[key])+'"></label>').join('')+'<label>Stato consegna<select data-order-field="manual">'+[['APERTO','Automatico — in base ai DDT collegati'],['DDT_DA_RICHIEDERE','Merce ricevuta, DDT da richiedere'],['PARZIALE','Parzialmente ricevuto'],['COMPLETATO','Merce ricevuta — registrazione precedente'],['ANNULLATO','Annullato']].map(([v,l])=>'<option value="'+v+'" '+(o.manual===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Note<textarea data-order-field="notes">'+E(o.notes)+'</textarea></label>';
 $('orderWarnings').textContent=o.warnings||'Nessuna anomalia di lettura segnalata.';$('orderVerified').checked=false;
 $('orderRelated').innerHTML=related(o).map(r=>'<button class="btn" data-related-ddt="'+r.row+'">DDT '+E(r.ddt)+' · '+E(r.company)+' · '+E(r.date)+' · '+E(r.status)+'</button>').join('')||'<p>Nessun DDT collegato: verifica se la merce deve ancora arrivare oppure richiedi il DDT al fornitore.</p>';
 $('orderDDTSelect').innerHTML='<option value="">Scegli un DDT dal registro…</option>'+data.map(r=>'<option value="'+r.row+'">'+E(r.company)+' · '+E(r.ddt)+' · '+E(r.date)+' · '+E(r.cdc)+' · riga '+r.row+'</option>').join('');
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
 $('openOrderPDF').onclick=async()=>{if(!selectedOrder?.fileId)return;if(useExternalPDF()){releasePDF();mobilePDFLinks($('orderPDF'),selectedOrder.fileId);return;}const button=$('openOrderPDF');button.disabled=true;const id=selectedOrder.id;try{const bytes=await downloadDrive(selectedOrder.fileId);if(!dialog.open||selectedOrder.id!==id)return;releasePDF();pdfURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const link=document.createElement('a');link.href='https://drive.google.com/file/d/'+encodeURIComponent(selectedOrder.fileId)+'/view';link.target='_blank';link.rel='noopener';link.className='btn';link.textContent='Apri PDF su Google Drive ↗';const iframe=document.createElement('iframe');iframe.className='preview';iframe.title='PDF ordine';iframe.src=pdfURL;$('orderPDF').replaceChildren(link,iframe);}catch(error){toast(error.message);}finally{button.disabled=false;}};
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
