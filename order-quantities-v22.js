'use strict';

var OrderQuantities = (() => {
 const units = 'NR|PZ|KG|G|L|LT|ML|CF|CT|SC|CONF|MT|M|MQ|PA';
 const number = '(?:\\d{1,3}(?:\\.\\d{3})+,\\d{1,6}|\\d{1,9}(?:[,.]\\d{1,6})?)';

 function quantity(value) {
  const raw = String(value).trim();
  if (!new RegExp('^' + number + '$').test(raw)) throw Error('Inserisci una quantità valida con un massimo di sei decimali.');
  const decimal = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const [whole, fraction = ''] = decimal.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
 }

 function format(value) {
  const positive = value < 0n ? -value : value;
  const fraction = (positive % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return (value < 0n ? '−' : '') + positive / 1000000n + (fraction ? ',' + fraction : '');
 }

 function suggest(text, isOrder) {
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows = [];
  let inTable = false;
  let closed = false;
  let unknown = false;
  const orderStart = new RegExp('^\\d{1,3}\\s+(' + number + ')\\s*(' + units + ')\\s*([A-Z0-9][A-Z0-9./-]*)$', 'i');
  const orderQuantity = new RegExp('^\\d[\\d.]+\\s+(' + units + ')\\s+(' + number + ')$', 'i');
  const orderLayout = new RegExp('^\\d{1,3}\\s+([A-Z0-9][A-Z0-9./_-]*)\\s+(.+?)\\s+(' + units + ')\\s+(' + number + ')$', 'i');
  const ddtLayout = new RegExp('^([A-Z0-9][A-Z0-9./_-]*)\\s+(.+?)\\s+(' + number + ')\\s+(' + units + ')$', 'i');
  for (let i = 0; i < lines.length; i++) {
   const line = lines[i];
   if (/(?:articolo|codice).*descrizione.*(?:quantit|q\.?\s*t[àa]|q\.ta)/i.test(line)) {
    inTable = true;
    closed = false;
    continue;
   }
   if (/^(?:totale|imponibile|firma|pagina|trasporto)\b|\bpagina\s+\d+\s+di\s+\d+\s*$/i.test(line) && inTable) {
    inTable = false;
    closed = true;
   }
   if (!inTable) continue;
   const positioned = isOrder && line.match(orderLayout);
   if (positioned) {
    if (Number(line.match(/^\d+/)[0]) !== rows.length + 1) unknown = true;
    rows.push({code:positioned[1],description:positioned[2],qty:positioned[4],unit:positioned[3]});
    continue;
   }
   const orderCode = isOrder && line.match(orderStart);
   const following = orderCode && (lines[i + 1] || '').match(orderQuantity);
   if (following) {
    if (Number(line.match(/^\d+/)[0]) !== rows.length + 1) unknown = true;
    rows.push({code:orderCode[3], description:lines[i + 2] || '', qty:orderCode[1], unit:orderCode[2]});
    i++;
    continue;
   }
   const row = !isOrder && line.match(ddtLayout);
   if (row && /\d/.test(row[1])) rows.push({code:row[1],description:row[2],qty:row[3],unit:row[4]});
   else if (!isOrder || /^\d{1,3}\s+/.test(line)) unknown = true;
  }
  return {rows,complete:rows.length > 0 && closed && !unknown};
 }

 function compare(ordered, deliveries) {
  const result = new Map();
  for (const [items, side] of [[ordered,'ordered'], [deliveries.flat(),'delivered']]) {
   for (const item of items) {
    const code = item.code.trim().toUpperCase();
    const unit = item.unit.trim().toUpperCase().replace(/\./g, '');
    if (!code || !unit) throw Error('Completa codice articolo e unità di misura in ogni riga.');
    const key = JSON.stringify([code, unit]);
    if (!result.has(key)) result.set(key, {code, unit, description:item.description.trim(), ordered:0n, delivered:0n});
    const row = result.get(key);
    row[side] += quantity(item.qty);
    if (!row.description) row.description = item.description.trim();
   }
  }
  const rows = [...result.values()];
  const shortages = rows.filter(row => row.ordered > row.delivered);
  if (shortages.some(row => rows.some(other => other.code === row.code && other.unit !== row.unit && other.delivered > other.ordered))) {
   throw Error('Controlla le unità di misura nelle righe da confrontare.');
  }
  return shortages.map(row => ({...row,missing:row.ordered-row.delivered}));
 }

 let dialog, active;
 function element(tag, value, parent) {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (parent) parent.append(node);
  return node;
 }
 function button(label, parent, handler) {
  const node = element('button', label, parent);
  node.type = 'button';
  node.className = 'btn';
  node.onclick = handler;
  return node;
 }
 function open(order, linked) {
  if (dialog?.open) return;
  if (!dialog) {
   dialog = element('dialog', '', document.body);
   dialog.className = 'order-dialog qty-dialog';
   dialog.setAttribute('aria-label','Verifica quantità');
   dialog.addEventListener('keydown', event => event.stopPropagation());
   dialog.addEventListener('close', () => {
    if (dialog.open) return;
    for (const url of active?.images || []) URL.revokeObjectURL(url);
    active = null;
    dialog.replaceChildren();
   });
  }
  dialog.replaceChildren();
  const session = active = {images:new Set()};
  const header = element('div','',dialog);
  header.className = 'order-dialog-header';
  element('h2','Verifica quantità · ' + order.number,header);
  button('Chiudi ×',header,() => dialog.close());
  const output = element('section','',dialog);
  output.setAttribute('aria-live','polite');
  const docs = [];
  function documentEditor(title, loadFile, isOrder) {
   const section = element('details','',dialog);
   section.className = 'qty-document';
   element('summary',title,section);
   const controls = element('div','',section);
   controls.className = 'qty-actions';
   const message = element('p','',section);
   message.setAttribute('role','status');
   const rows = element('div','',section);
   const label = element('label','',section);
   const confirm = element('input','',label);
   confirm.type = 'checkbox';
   label.append(' Ho verificato tutte le righe del documento');
   const source = element('details','',section);
   source.hidden = true;
   element('summary','Testo rilevato',source);
   const raw = element('pre','',source);
   const preview = element('div','',section);
   let imageUrl;
   const inputs = [];
   function changed() {
    confirm.checked = false;
    complete = false;
    if (!session.reading) {
     output.replaceChildren();
     run.hidden = false;
    }
   }
   function add(item = {}) {
    const row = element('div','',rows);
    row.className = 'qty-line';
    const fields = {};
    for (const [key, caption] of [['code','Codice'],['description','Descrizione'],['qty','Quantità'],['unit','U.M.']]) {
     const l = element('label',caption,row);
     const input = element('input','',l);
     input.value = item[key] || '';
     if (key === 'qty') input.inputMode = 'decimal';
     input.oninput = changed;
     fields[key] = input;
    }
    inputs.push(fields);
    button('Rimuovi',row,() => {
     inputs.splice(inputs.indexOf(fields),1);
     row.remove();
     changed();
    });
   }
   button('Aggiungi riga',controls,() => {add();changed();});
   const view = button('Visualizza documento',controls,async () => {
    view.disabled = true;
    try {
     const file = await loadFile();
     if (active !== session || !dialog.open) return;
     if (file.mime === 'application/pdf') {
      DDTPDFViewer.open({load:async () => file.bytes, filename:title+'.pdf', title});
      return;
     }
     if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.mime)) throw Error('Formato non visualizzabile.');
     if (imageUrl) {URL.revokeObjectURL(imageUrl);session.images.delete(imageUrl);}
     imageUrl = URL.createObjectURL(new Blob([file.bytes],{type:file.mime}));
     session.images.add(imageUrl);
     preview.replaceChildren();
     const image = element('img','',preview);
     image.src = imageUrl;
     image.alt = title;
    } catch (error) {message.textContent = error.message;}
    finally {view.disabled = false;}
   });
   let complete = false;
   const read = button('Leggi articoli',controls,() => readDocument());
   async function readDocument() {
    if (inputs.some(fields => Object.values(fields).some(input => input.value.trim())) &&
        !window.confirm('Sostituire le righe presenti con le nuove proposte di lettura?')) return;
    read.disabled = true;
    message.textContent = 'Lettura del documento…';
    try {
     const file = await loadFile();
     let text = '';
     if (file.mime === 'application/pdf') {
      try {text = await DDTPDFViewer.extractText(file.bytes.slice(0));} catch {}
     }
     if (!text.trim()) text = await ocrDDT(new Blob([file.bytes],{type:file.mime}));
     if (active !== session || !dialog.open) return;
     const parsed = suggest(text,isOrder);
     const proposed = parsed.rows;
     raw.textContent = text;
     source.hidden = !text.trim();
     if (proposed.length) {
      rows.replaceChildren();
      inputs.length = 0;
      proposed.forEach(add);
      changed();
     }
     complete = parsed.complete;
     message.textContent = proposed.length
      ? proposed.length + ' righe proposte. Controlla codici, quantità e unità sul documento.'
      : 'Controlla il testo rilevato e aggiungi le righe da confrontare.';
    } catch (error) {
     message.textContent = 'Lettura non riuscita. Puoi inserire le righe a mano. ' + error.message;
    } finally {read.disabled = false;}
   }
   confirm.onchange = () => {output.replaceChildren();run.hidden = false;};
   add();
   docs.push({title,section,confirm,read,readDocument,get complete(){return complete;},get rows() {
    return inputs.map(fields => Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()])))
     .filter(item => Object.values(item).some(Boolean));
   }});
  }
  documentEditor('Ordine ' + order.number,async () => {
   if (!order.fileId) throw Error('PDF dell’ordine assente.');
   return {bytes:await downloadDrive(order.fileId),mime:'application/pdf'};
  },true);
  for (const ddt of linked) documentEditor('DDT ' + ddt.ddt + ' · ' + ddt.date,async () => {
   const file = await originalDDT(ddt);
   return {bytes:await downloadDrive(file.id),mime:file.mimeType};
  },false);
  if (!linked.length) element('p','Collega almeno un DDT per confrontare le quantità.',dialog);
  function showResult(automatic) {
   output.replaceChildren();
   try {
    for (const doc of docs) {
     if (doc.read.disabled) throw Error('Attendi la fine della lettura.');
     if (!doc.rows.length || !(automatic ? doc.complete : doc.confirm.checked)) throw Error('Controlla le righe dei documenti per completare la verifica.');
    }
    const rows = compare(docs[0].rows,docs.slice(1).map(doc=>doc.rows));
    element('strong',rows.length ? 'Quantità mancanti' : 'DDT e ordine combaciano',output);
    if (!rows.length) return;
    const scroll = element('div','',output);
    scroll.className = 'qty-result-scroll';
    const table = element('table','',scroll);
    const tr = element('tr','',element('thead','',table));
    for (const caption of ['Articolo','U.M.','Ordinato','Consegnato','Mancano']) element('th',caption,tr);
    const body = element('tbody','',table);
    for (const row of rows) {
     const line = element('tr','',body);
     for (const value of [row.code + (row.description ? ' · ' + row.description : ''),row.unit,format(row.ordered),
      format(row.delivered),format(row.missing)]) element('td',value,line);
    }
   } catch (error) {
    element('p',error.message,output);
    run.hidden = false;
    if (automatic) docs.forEach(doc => {doc.section.open = true;});
   }
   output.scrollIntoView({block:'nearest'});
  }
  const run = button('Conferma confronto',dialog,() => showResult(false));
  run.classList.add('primary');
  run.disabled = !linked.length;
  run.hidden = true;
  dialog.showModal();
  if (linked.length) void (async () => {
   session.reading = true;
   run.disabled = true;
   output.textContent = 'Verifica dei documenti in corso…';
   for (const doc of docs) {
    if (active !== session || !dialog.open) return;
    await doc.readDocument();
   }
   if (active !== session || !dialog.open) return;
   session.reading = false;
   run.disabled = false;
   if (docs.every(doc => doc.complete)) {
    docs.forEach(doc => {doc.confirm.checked = true;});
    showResult(true);
   } else {
    run.hidden = false;
    output.textContent = 'Controlla le righe rilevate e conferma il confronto.';
    docs.filter(doc => !doc.complete).forEach(doc => {doc.section.open = true;});
   }
  })();
 }
 return {open,compare,suggest,format};
})();
