'use strict';
var DDTMail = (() => {
 const suppliers = [
  {key:'MAGRIS',name:'Magris',aliases:['MAGRIS','MAGRIS GROUP'],emails:''},
  {key:'CLINTEX',name:'Clintex',aliases:['CLINTEX'],emails:''},
  {key:'MONDOFFICE',name:'Mondoffice',aliases:['MONDOFFICE'],emails:''},
  {key:'ECOSI',name:'Ecosì',aliases:['ECOSI'],emails:''},
  {key:'LACASALINDA',name:'La Casalinda',aliases:['LA CASALINDA','LA CASALINGA'],emails:''},
  {key:'ALLSERVICE',name:'All Service',aliases:['ALL SERVICE','ALL SERVICE WEAR'],emails:''}
 ];
 const normalize = value => String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/(?:SRL|SPA|SRLS)$/,'');
 function supplier(value) {
  const normalized=normalize(value);
  const known=suppliers.find(s=>s.aliases.some(a=>normalize(a)===normalized));
  return known||{key:'CUSTOM:'+normalized,name:String(value||'Fornitore da verificare'),emails:''};
 }
 function recipients(value) {
  const addresses=String(value||'').split(/[;,]/).map(s=>s.trim()).filter(Boolean);
  if(!addresses.length||addresses.some(a=>! /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(a)))throw Error('Inserisci indirizzi email validi, separati da punto e virgola.');
  return [...new Set(addresses.map(a=>a.toLowerCase()))];
 }
 function group(orders) {
  const groups=new Map();
  for(const order of orders){const contact=supplier(order.company);if(!groups.has(contact.key))groups.set(contact.key,{...contact,orders:[]});groups.get(contact.key).orders.push(order);}
  return [...groups.values()];
 }
 function draft(orders) {
  const received=orders.every(o=>['DDT_DA_RICHIEDERE','COMPLETATO'].includes(o.manual));
  const lines=orders.map(o=>'• Ordine n. '+(o.number||'[numero da verificare]')+'\r\n  Sede: '+(o.site||'[sede da verificare]')+'\r\n  Indirizzo: '+(o.address||'[indirizzo da verificare]'));
  return {subject:orders.length===1?'Richiesta DDT – Ordine n. '+(orders[0].number||'da verificare'):'Richiesta DDT – '+orders.length+' ordini',body:'Buongiorno,\r\n\r\nchiediamo cortesemente copia dei DDT relativi ai seguenti ordini:\r\n\r\n'+lines.join('\r\n\r\n')+'\r\n\r\n'+(received?'La merce risulta ricevuta, ma non disponiamo dei relativi documenti di trasporto.':'Non disponiamo dei relativi documenti di trasporto. Per eventuali ordini non ancora evasi, chiediamo un aggiornamento sullo stato della fornitura.')+'\r\n\r\nGrazie per la collaborazione.\r\nCordiali saluti,\r\nGiovanni Piccione'};
 }
 function mailto(to,subject,body) {
  if(/[\r\n]/.test(subject))throw Error('L’oggetto deve essere su una sola riga.');
  return 'mailto:'+recipients(to).map(encodeURIComponent).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(String(body).replace(/\r?\n/g,'\r\n'));
 }
 // Keep generated links short enough for mail applications; each batch stays with one supplier.
 function batches(orders,to,limit=1800) {
  const result=[];let current=[];
  for(const order of orders){const next=[...current,order],d=draft(next);if(current.length&&mailto(to,d.subject,d.body).length>limit){result.push(current);current=[order];}else current=next;}
  if(current.length)result.push(current);
  return result;
 }
 return {suppliers,normalize,supplier,recipients,group,draft,mailto,batches};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DDTMail;
