'use strict';
(()=>{
 let visible=false,selectedOrder=null,pdfURL='';
 const section=$('ordersPanel'),dialog=$('orderDialog'),E=esc,C=OrdersCore;
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
 const related=o=>data.filter(r=>C.match(r,OrdersState.orders,OrdersState.links).order?.id===o.id);
 const state=o=>C.status(o,related(o),today());
 const options=(values,first)=>'<option value="">'+E(first)+'</option>'+[...new Set(values.filter(Boolean))].sort().map(v=>'<option>'+E(v)+'</option>').join('');
 function highlight(){document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav==='orders'));}
 function renderOrders(){
 const q=$('orderSearch').value.toLocaleLowerCase('it'),mode=$('orderFilter').value,supplier=$('orderSupplier').value,cdc=$('orderCDC').value;
 $('ordersConnection').textContent=OrdersState.error||(!OrdersState.loaded?'Accedi con Google per leggere gli ordini.':'Importazione email: '+(OrdersState.config['Stato importazione']||'NON ATTIVA')+' · Ultimo controllo: '+(OrdersState.config['Ultimo controllo']||'non ancora eseguito'));
 const all=OrdersState.orders,waiting=all.filter(o=>!related(o).length&&!['COMPLETATO','ANNULLATO'].includes(o.manual));
 $('ordersStats').innerHTML=[['Ordini',all.length],['Senza DDT',waiting.length],['In ritardo',all.filter(o=>state(o)==='In ritardo').length],['Completati',all.filter(o=>state(o)==='Completato').length]].map(([label,n])=>'<div class="stat"><small>'+label+'</small><strong>'+n+'</strong></div>').join('');
 const list=all.filter(o=>(!supplier||o.company===supplier)&&(!cdc||o.cdc===cdc)&&(!q||[o.number,o.company,o.site,o.cdc,o.date,o.notes].join(' ').toLocaleLowerCase('it').includes(q))&&(!mode||(mode==='unlinked'?!related(o).length&&!['COMPLETATO','ANNULLATO'].includes(o.manual):state(o)===mode))).slice().reverse();
 $('orderList').innerHTML=list.map(o=>{const linked=related(o),s=state(o);return '<button type="button" class="order-card" data-order="'+E(o.id)+'"><div class="order-card-top"><strong>'+E(o.number||'Numero da verificare')+'</strong><span class="badge '+(s==='Completato'?'green':'orange')+'">'+E(s)+'</span></div><b>'+E(o.site||'Sede da verificare')+'</b><p>'+E(o.company||'Fornitore da verificare')+' · '+E(o.cdc||'CDC da verificare')+'</p><div class="order-card-meta"><span>Ordine: '+E(o.date||'—')+'</span><span>Consegna: '+E(o.due||'non indicata')+'</span></div><p>'+linked.length+' DDT collegati'+(!linked.length?' · Nessuna consegna documentata':'')+'</p>'+(o.warnings?'<p class="order-warning">'+E(o.warnings)+'</p>':'')+'<span class="order-open">Consulta ordine e PDF ↗</span></button>';}).join('');
 $('ordersEmpty').hidden=list.length>0;$('ordersEmpty').textContent=all.length?'Nessun ordine corrisponde ai filtri.':'Nessun ordine importato. Completa l’attivazione della lettura email per acquisire i PDF nella casella business.';
 if(visible)highlight();
 }
 function syncFilters(){for(const[id,key,label]of [['orderSupplier','company','Tutti i fornitori'],['orderCDC','cdc','Tutti i CDC']]){const value=$(id).value;$(id).innerHTML=options(OrdersState.orders.map(o=>o[key]),label);$(id).value=value;}}
 async function load(){if(!hasSession()){OrdersState.loaded=false;OrdersState.orders=[];OrdersState.links=[];OrdersState.error='Accedi con Google per leggere gli ordini.';renderOrders();return;}
 try{await fetchOrders();syncFilters();}catch(error){OrdersState.error=error.message;}renderOrders();}
 window.orderFormDirty=()=>dialog.open&&selectedOrder&&[...dialog.querySelectorAll('[data-order-field]')].some(el=>String(el.value).trim()!==String(selectedOrder[el.dataset.orderField]||''));
 window.addEventListener('beforeunload',event=>{if(OrdersState.busy){event.preventDefault();event.returnValue='';}});
 const baseNav=nav;nav=function(mode){visible=mode==='orders';baseNav(visible?'all':mode);section.hidden=!visible;
 if(visible){$('registry').classList.add('hidden');$('help').classList.add('hidden');document.querySelector('.head h1').textContent='Ordini e consegne';highlight();renderOrders();if(!OrdersState.loaded)load();if(window.matchMedia('(max-width:720px)').matches)requestAnimationFrame(()=>section.scrollIntoView({block:'start'}));}
 else document.querySelector('.head h1').textContent='Registro documenti';
 document.querySelector('.stats').hidden=visible;
 for(const id of ['scanFolder','protocolAll','uploadDDT','import'])$(id).hidden=visible;
 };
 const baseApply=apply;apply=function(rows){baseApply(rows);if(visible){renderOrders();highlight();}};
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
 const labels=[['number','Ordine Dussmann'],['company','Fornitore'],['site','Sede destinazione'],['cdc','Centro di costo'],['date','Data ordine (gg/mm/aaaa)'],['due','Consegna prevista (gg/mm/aaaa)']];
 $('orderFields').innerHTML=labels.map(([key,label])=>'<label>'+label+'<input data-order-field="'+key+'" value="'+E(o[key])+'"></label>').join('')+'<label>Stato consegna<select data-order-field="manual">'+[['APERTO','Aperto — stato calcolato dai DDT'],['PARZIALE','Parzialmente ricevuto'],['COMPLETATO','Completato — confermato da me'],['ANNULLATO','Annullato']].map(([v,l])=>'<option value="'+v+'" '+(o.manual===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Note<textarea data-order-field="notes">'+E(o.notes)+'</textarea></label>';
 $('orderWarnings').textContent=o.warnings||'Nessuna anomalia di lettura segnalata.';$('orderVerified').checked=false;
 $('orderRelated').innerHTML=related(o).map(r=>'<button class="btn" data-related-ddt="'+r.row+'">DDT '+E(r.ddt)+' · '+E(r.company)+' · '+E(r.date)+' · '+E(r.status)+'</button>').join('')||'<p>Nessun DDT collegato. La presenza di un DDT non conferma da sola la consegna completa.</p>';
 $('orderDDTSelect').innerHTML='<option value="">Scegli un DDT dal registro…</option>'+data.map(r=>'<option value="'+r.row+'">'+E(r.company)+' · '+E(r.ddt)+' · '+E(r.date)+' · '+E(r.cdc)+' · riga '+r.row+'</option>').join('');
 $('orderAddress').textContent=o.address||'Indirizzo non rilevato';$('openOrderPDF').disabled=!o.fileId;
 if(!dialog.open)dialog.showModal();
 }
 $('orderList').onclick=e=>{const button=e.target.closest('[data-order]');if(button)openOrder(button.dataset.order);};
 $('orderRelated').onclick=e=>{const button=e.target.closest('[data-related-ddt]');if(button){dialog.close();openDetail(Number(button.dataset.relatedDdt));}};
 $('saveOrder').onclick=async()=>{if(!selectedOrder)return;const values=Object.fromEntries([...dialog.querySelectorAll('[data-order-field]')].map(el=>[el.dataset.orderField,el.value]));
 values.verified=$('orderVerified').checked;
 const changed=['number','company','site','date'].some(key=>values[key].trim()!==selectedOrder[key]);
 if(changed&&!window.confirm('Confermi la correzione e la nuova archiviazione del PDF per sede, anno, mese e fornitore?'))return;
 $('saveOrder').disabled=true;try{await saveOrderDetails(selectedOrder,values);const id=selectedOrder.id;await load();openOrder(id);toast('Ordine aggiornato nel registro e su Drive.');}catch(error){toast(error.message);}finally{$('saveOrder').disabled=false;}};
 $('openOrderPDF').onclick=async()=>{if(!selectedOrder?.fileId)return;const button=$('openOrderPDF');button.disabled=true;const id=selectedOrder.id;try{const bytes=await downloadDrive(selectedOrder.fileId);if(!dialog.open||selectedOrder.id!==id)return;releasePDF();pdfURL=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const link=document.createElement('a');link.href=pdfURL;link.target='_blank';link.rel='noopener';link.className='btn';link.textContent='Apri PDF in una nuova finestra ↗';const iframe=document.createElement('iframe');iframe.className='preview';iframe.title='PDF ordine';iframe.src=pdfURL;$('orderPDF').replaceChildren(link,iframe);}catch(error){toast(error.message);}finally{button.disabled=false;}};
 $('linkOrderDDT').onclick=async()=>{const r=data.find(x=>x.row===Number($('orderDDTSelect').value));if(!r||!selectedOrder)return toast('Seleziona il DDT da collegare.');
 if(!window.confirm('Collegare il DDT '+r.ddt+' ('+r.company+') all’ordine '+selectedOrder.number+'? L’eventuale collegamento precedente verrà sostituito.'))return;
 $('linkOrderDDT').disabled=true;try{await linkDDTToOrder(r,selectedOrder);const id=selectedOrder.id;await load();openOrder(id);toast('DDT collegato all’ordine.');}catch(error){toast(error.message);}finally{$('linkOrderDDT').disabled=false;}};
 $('saveOrderSite').onclick=async()=>{const button=$('saveOrderSite');button.disabled=true;try{await addOrderSite($('newOrderSite').value,$('newOrderCDC').value,$('newOrderAddress').value);await load();for(const id of ['newOrderSite','newOrderCDC','newOrderAddress'])$(id).value='';toast('Sede salvata per le prossime importazioni.');}catch(error){toast(error.message);}finally{button.disabled=false;}};
 $('refreshOrders').onclick=()=>refresh();
 for(const id of ['orderSearch','orderFilter','orderSupplier','orderCDC'])$(id).addEventListener(id==='orderSearch'?'input':'change',renderOrders);
 $('ordersFolder').onclick=()=>{const id=OrdersState.config['Cartella ordini'];if(id&&/^[\w-]{10,}$/.test(id))window.open('https://drive.google.com/drive/folders/'+id,'_blank','noopener');else toast('Accedi con Google e aggiorna gli ordini.');};
 if(hasSession())load();
})();
