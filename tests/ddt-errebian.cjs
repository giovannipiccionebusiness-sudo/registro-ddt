const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {parseDDT}=require('../api-v10.js');
const text=`ERREBIAN SpA
www.errebian.it
NUMERO E DATA COD. CLIENTE MODALITA DI PAGAMENTO
V1/070701 17/11/2026 153603 BONIFICO BANCARIO
TIPO DI DOCUMENTO FATTURA ACCOMPAGNATORIA
DESTINAZIONE MERCE VIALE DE PIETRO LECCE
ORDINE CLIENTE: 2026368581 del 17/11/2026
RIFERIMENTO MAG.: 00008659207
N. ORD. 700627
RIF. ORD WEB 1020562_1-20261`;
const expected={company:'ERREBIAN',ddt:'V1/070701',date:'17/11/2026',cdc:'N153',order:'A2026368581',cdcFromOrder:false};
assert.deepEqual(parseDDT(text),expected);
assert.deepEqual(parseDDT(text.replace('V1/070701 17/11/2026','V 1 / 070701\n17 / 11 / 2026')),expected);
assert.deepEqual(parseDDT(text.replace('V1/070701','VI/070701')),expected);
assert.equal(parseDDT(text.replace('V1/070701','V1/070101')).ddt,'V1/070101');
assert.equal(parseDDT(text.replace('ORDINE CLIENTE: 2026368581','ORDINE CLIENTE: A/2026/368581')).order,expected.order);
assert.equal(parseDDT(text.replace('ORDINE CLIENTE: 2026368581 del 17/11/2026','')).order,'');
assert.equal(parseDDT(text.replace('V1/070701 17/11/2026','V1/070701 31/02/2026')).date,'');
assert.equal(parseDDT(text.replace('V1/070701 17/11/2026','V1/070701 17/11/2026\nV1/070702 18/11/2026')).ddt,'');
assert.equal(parseDDT(text.replace('ORDINE CLIENTE: 2026368581','ORDINE CLIENTE: 2026368581\nORDINE CLIENTE: 2026368582')).order,'');
const actualOCR='ERREBIAN SPA\nCOD, CLIENTE 153603\nNUMERO E DATA\nV1/070101 17/11/2026\nTIPO DI DOCUMENTO\nCOD. AGENTE 165\nDESTINAZIONE MERCE. CORTE DI APPELLO\nVIALE DE PIETRO 73100 LECCE\nORDINE CLIENTE: 2026368581 del 17112026\nRIFERIMENTO MAG.: 00008659207\nRIF. ORD WEB 1020562_1-20261';
assert.deepEqual(parseDDT(actualOCR),{...expected,ddt:'V1/070101'});
const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('gas/LetturaDDTOraria.gs','utf8'),ctx);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.ddtHourlyParse_(text))),expected);
console.log('PASS Errebian document/date, customer order without A, unrelated references excluded, invalid/ambiguous fields, hourly parity');
