'use strict';
(()=>{
 const bar=document.getElementById('pwaBar'),install=document.getElementById('installApp'),update=document.getElementById('updateApp'),dialog=document.getElementById('installHelp');
 let deferred=null,registration=null,reloadForUpdate=false;
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const sync=()=>{install.hidden=standalone();bar.hidden=standalone()&&update.hidden;document.getElementById('networkNote').hidden=navigator.onLine;};
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;install.textContent='Installa app';sync();});
 window.addEventListener('appinstalled',()=>{deferred=null;sync();});
 install.onclick=async()=>{if(deferred){const prompt=deferred;deferred=null;await prompt.prompt();await prompt.userChoice;sync();}else dialog.showModal();};
 document.getElementById('closeInstallHelp').onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 window.addEventListener('online',sync);window.addEventListener('offline',sync);sync();
 const available=()=>{update.hidden=false;bar.hidden=false;};
 update.onclick=()=>{
 if(typeof folderBatchBusy!=='undefined'&&folderBatchBusy)return toast('Completa l’operazione in corso prima di aggiornare.');
 if(typeof detailDirty==='function'&&detailDirty()&&!window.confirm('Hai modifiche non salvate. Aggiornare e scartarle?'))return;
 if(registration?.waiting){reloadForUpdate=true;registration.waiting.postMessage('ACTIVATE_UPDATE');}else location.reload();
 };
 if('serviceWorker' in navigator&&location.protocol==='https:'){

 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloadForUpdate)location.reload();});

 navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
 registration=reg;if(reg.waiting)available();reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)available();});});
 }).catch(()=>{document.getElementById('pwaText').textContent='Puoi usare il sito. Installazione non disponibile in questo browser.';});
 }
})();
