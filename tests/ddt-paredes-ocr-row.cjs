const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {parseDDT}=require('../api-v10.js');
// Exact relevant header returned by Google Drive OCR on the uploaded PDF.
const text=`PAREDES ITALIA S.p.A.
DOCUMENTO DI TRASPORTO (Dpr 472 del 14/08/96)
Fatturare a: E00991
DUSSMANN SERVICE S.R.L.
VIA STRESA 6
20125 MILANO
00124140211
Spedire a:
Z00068
DUSSMANN C/O MARTA TARANTO VIA CAVOUR 10 74100 TARANTO
AL/1/624209 DEL 26/10/2026 A mezzo VETTORE
!BOLLA !Agente 90
! Articolo
121908
4827401
501015
Zona
09
Descrizione dei beni
Ordine A 2026337695`;
const expected={company:'PAREDES',ddt:'AL/1/624209',date:'26/10/2026',cdc:'N110',order:'A2026337695',cdcFromOrder:false};
assert.deepEqual(parseDDT(text),expected);
assert.deepEqual(parseDDT(text.replace('AL/1/624209 DEL 26/10/2026 A mezzo VETTORE\n!BOLLA','!BOLLA\nAL/1/624209 DEL 26/10/2026 A mezzo VETTORE')),expected);
assert.equal(parseDDT(text.replace('AL/1/624209 DEL 26/10/2026','AL / 1 / 624209\nDEL 26 / 10 / 2026')).ddt,expected.ddt);
assert.equal(parseDDT(text.replace('26/10/2026','31/02/2026')).date,'');
assert.equal(parseDDT(text.replace('!BOLLA','AL/1/624210 DEL 27/10/2026\n!BOLLA')).ddt,'');
assert.equal(parseDDT(text.replace('AL/1/624209 DEL 26/10/2026 A mezzo VETTORE\n','')).ddt,'');
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('gas/LetturaDDTOraria.gs','utf8'),ctx);assert.equal(ctx.ddtHourlyParse_(text).ddt,expected.ddt);assert.equal(ctx.ddtHourlyParse_(text).date,expected.date);
console.log('PASS actual OCR: values before BOLLA, normal row order, spacing/line breaks, invalid date, conflicting bolla pairs, no legal-date/document-number substitution, hourly parity.');
