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
 function status(o,related,today){if(o.manual==='ANNULLATO')return 'Annullato';if(o.manual==='COMPLETATO')return 'Completato';if(o.warnings||!o.number||!o.company||!o.site||!o.cdc||!dateISO(o.date))return 'Da verificare';if(o.manual==='PARZIALE')return 'Parzialmente ricevuto';const due=dateISO(o.due);if(due&&due<today)return 'In ritardo';return related.length?'Consegna da verificare':'In attesa';}
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
 if(/Data\s+Consegna/i.test(t)&&!dateISO(due))warnings.push('Data consegna da verificare');
 return {number:ref?.full||'',company:supplier,site,cdc,date,due,address:(block||deliveryArea).replace(/\s+/g,' ').trim(),warnings:warnings.join('; ')};
 }
 const filePart=s=>String(s||'').trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').slice(0,140);
 function filename(o,hash){return filePart(o.site||'SEDE DA VERIFICARE')+'_'+filePart(o.number||('ORDINE DA VERIFICARE_'+hash.slice(0,10)))+'.pdf';}
 return {norm,orderRef,company,ddtKey,candidates,match,dateISO,status,parsePDF,filename};
})();
