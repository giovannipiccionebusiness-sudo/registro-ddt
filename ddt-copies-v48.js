/* Copies open the user's external mail application; no server-side sending. */
'use strict';
const DDTCopies={config:null,record:null,file:null,generation:0};
function ddtCopyEligible(r){return r&&r.cdc==='N154'&&isDone(r)&&Boolean(r.protocol&&safeDrive(r.url));}
function ddtCopyTemplate(text,r){const values={fornitore:r.company,ddt:r.ddt,data:r.date,cdc:r.cdc,protocollo:r.protocol,ordine:r.order};return String(text||'').replace(/\{(fornitore|ddt|data|cdc|protocollo|ordine)\}/g,(_,key)=>values[key]||'—');}
async function loadDDTCopies(){const cfg=await ordersRead('CopieDDTConfig','A1:B5');if(cfg[0]?.[0]!=='Voce')throw Error('Configurazione copie non disponibile.');DDTCopies.config=Object.fromEntries(cfg.slice(1));return DDTCopies;}
function ddtCopyDraft(){
 const to=$('copyTo').value.trim(),subject=$('copySubject').value.trim(),body=$('copyBody').value.trim();
 if(!/^cappelluti@dussmann\.it$/i.test(to))throw Error('Destinatario N154 non valido.');
 if(!subject||/[\r\n]/.test(subject)||!body)throw Error('Compila oggetto e messaggio.');
 return{to,subject,body};
}
function updateDDTCopyMailto(){
 const link=$('copySend');link.removeAttribute('href');link.setAttribute('aria-disabled','true');
 try{const d=ddtCopyDraft(),href=DDTMail.mailto(d.to,d.subject,d.body);if(href.length>1800)throw Error('Email lunga: premi “Copia email” e incolla il testo in Outlook.');link.href=href;link.removeAttribute('aria-disabled');$('copyMessage').textContent='“Apri email” usa l’app di posta predefinita. Imposta Outlook sul dispositivo. Scarica il PDF e allegalo al messaggio, oppure usa “Condividi PDF” se disponibile.';}
 catch(error){$('copyMessage').textContent=error.message;}
}
async function prepareDDTCopyPDF(r,generation){
 await checkSnapshot(r);const u=safeDrive(r.url),id=u?.pathname.match(/\/file\/d\/([\w-]+)/)?.[1]||u?.searchParams.get('id');
 if(!id||!/^[\w-]+$/.test(id))throw Error('PDF protocollato non trovato.');
 const meta=await googleRequest(driveURL+'/'+encodeURIComponent(id)+'?fields=name,mimeType,parents,trashed,size');
 if(meta.trashed||meta.mimeType!=='application/pdf'||!meta.parents?.includes(DDTConfig.stamped))throw Error('PDF protocollato non disponibile nella cartella prevista.');
 if(Number(meta.size)>50000000)throw Error('PDF oltre 50 MB: usa Visualizza PDF protocollato per scaricarlo.');
 const bytes=await downloadDrive(id);await checkSnapshot(r);
 if(generation!==DDTCopies.generation)return;
 DDTCopies.file=new File([bytes],meta.name.replace(/[\\/:*?"<>|]/g,'-'),{type:'application/pdf'});
 $('copyDownload').disabled=false;$('copyShare').hidden=!(navigator.canShare&&navigator.share&&navigator.canShare({files:[DDTCopies.file]}));
 $('copyAttachment').textContent='PDF pronto: '+DDTCopies.file.name;
}
async function openDDTCopy(r){
 if(!live||!hasSession()||!ddtCopyEligible(r))return toast('Seleziona un DDT protocollato N154 con registro collegato.');
 DDTCopies.record={...r};DDTCopies.file=null;const generation=++DDTCopies.generation,dialog=$('ddtCopyDialog');dialog.showModal();
 $('copySend').removeAttribute('href');$('copySend').setAttribute('aria-disabled','true');$('copyDownload').disabled=true;$('copyShare').hidden=true;$('copySaveTemplate').disabled=true;$('copyMessage').textContent='Caricamento modello…';$('copyAttachment').textContent='Preparazione PDF protocollato…';
 try{
 await loadDDTCopies();if(generation!==DDTCopies.generation||!dialog.open)return;const cfg=DDTCopies.config;
 $('copyTo').value=cfg['Destinatario N154']||'';$('copySubjectTemplate').value=cfg.Oggetto||'';$('copyBodyTemplate').value=cfg.Testo||'';
 $('copySubject').value=ddtCopyTemplate(cfg.Oggetto,r);$('copyBody').value=ddtCopyTemplate(cfg.Testo,r);$('copySaveTemplate').disabled=false;updateDDTCopyMailto();
 try{await prepareDDTCopyPDF(r,generation);}catch(error){if(generation===DDTCopies.generation)$('copyAttachment').textContent='Download PDF non riuscito: '+error.message;}
 }catch(error){if(generation===DDTCopies.generation)$('copyMessage').textContent=error.message;}
}
function mountDDTCopyAction(){let section=$('ddtCopyAction');if(!section){section=document.createElement('section');section.id='ddtCopyAction';section.className='field';$('protocolBox').before(section);}section.hidden=!ddtCopyEligible(selected);section.replaceChildren();if(section.hidden)return;const button=document.createElement('button');button.className='btn primary';button.textContent='Prepara email · CDC N154';button.disabled=!live||!hasSession();button.onclick=()=>openDDTCopy(selected);section.append(button);}
const openDetailBeforeCopies=openDetail;openDetail=function(row){openDetailBeforeCopies(row);mountDDTCopyAction();};
$('copyClose').onclick=()=>{DDTCopies.generation++;$('ddtCopyDialog').close();};$('ddtCopyDialog').addEventListener('cancel',()=>DDTCopies.generation++);
for(const id of ['copySubject','copyBody'])$(id).oninput=updateDDTCopyMailto;
$('copySend').onclick=event=>{if(!$('copySend').hasAttribute('href'))event.preventDefault();else $('copyMessage').textContent='Completa l’invio nell’app di posta. Il PDF va allegato al messaggio. L’apertura dell’email non conferma che sia stata inviata.';};
$('copyDownload').onclick=()=>{if(!DDTCopies.file)return;const url=URL.createObjectURL(DDTCopies.file),a=document.createElement('a');a.href=url;a.download=DDTCopies.file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
$('copyShare').onclick=async()=>{
 if(!DDTCopies.file)return;
 try{const d=ddtCopyDraft();await navigator.share({files:[DDTCopies.file],title:d.subject,text:'Destinatario: '+d.to+'\nOggetto: '+d.subject+'\n\n'+d.body});$('copyMessage').textContent='Completa il messaggio in Outlook e controlla destinatario e allegato. La condivisione non conferma l’invio.';}
 catch(error){if(error.name!=='AbortError')$('copyMessage').textContent='Condivisione non disponibile. Usa Scarica PDF e Apri email.';}
};
$('copyClipboard').onclick=async()=>{try{const d=ddtCopyDraft();await navigator.clipboard.writeText('A: '+d.to+'\nOggetto: '+d.subject+'\n\n'+d.body);toast('Email copiata: incollala in Outlook e allega il PDF.');}catch(error){$('copyMessage').textContent='Copia non riuscita. Seleziona e copia il testo del messaggio.';}};
$('copySaveTemplate').onclick=async()=>{
 $('copySaveTemplate').disabled=true;
 try{const subject=$('copySubjectTemplate').value.trim(),body=$('copyBodyTemplate').value.trim();if(!subject||subject.length>200||/[\r\n]/.test(subject)||!body||body.length>20000)throw Error('Compila oggetto e testo del modello.');await ordersWrite('CopieDDTConfig','B3:B4',[[subject],[body]]);$('copySubject').value=ddtCopyTemplate(subject,DDTCopies.record);$('copyBody').value=ddtCopyTemplate(body,DDTCopies.record);updateDDTCopyMailto();toast('Testo predefinito salvato.');}catch(error){$('copyMessage').textContent=error.message;}finally{$('copySaveTemplate').disabled=false;}
};
