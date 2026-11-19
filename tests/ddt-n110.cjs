const fs=require('fs'),vm=require('vm'),assert=require('assert');
const api=require('../api-v10.js');const ctx={console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('orders-core-v12.js','utf8'),ctx);
const site=[{site:'Marta Taranto',cdc:'N110',pattern:'VIA CAVOUR 10'},{site:'Marta Taranto',cdc:'N110',pattern:'MARTA TARANTO'}];
for(const address of ['Via Cavour 10 74123 Taranto','VIA CAVOUR, 10 TARANTO','V. CAVOUR N. 10 TARANTO','Marta Taranto']){
 assert.equal(api.parseDDT('MONDOFFICE\nDestinazione di consegna: '+address).cdc,'N110',address);
 const fields=ctx.OrdersCore.parsePDF('Spett.le MONDOFFICE\nVIA ROMA\nOrdine Numero: A2026363694 Del: 19/11/2026\nConsegna C/o: '+address+'\nArticolo','',site);
 assert.equal(fields.cdc,'N110',address);assert.equal(fields.site,'Marta Taranto',address);
}
for(const address of ['VIA CAVOUR 100 TARANTO','VIA CAVOUR 10 LECCE','VIA CAVOUR 11 TARANTO']){assert.notEqual(api.parseDDT(address).cdc,'N110',address);const f=ctx.OrdersCore.parsePDF('Consegna C/o: '+address+'\nArticolo','',site);assert.notEqual(f.cdc,'N110',address);}
assert.equal(api.parseDDT('MONDOFFICE CDC N153 VIA CAVOUR 10 TARANTO').cdc,'N153');
assert.equal(api.parseDDT('MONDOFFICE VIA MARCHE TARANTO').cdc,'N153');
assert.equal(api.parseDDT('MONDOFFICE VIA MONTERONI LECCE').cdc,'N154');
const gas={console};vm.createContext(gas);vm.runInContext(fs.readFileSync('gas/LetturaDDTOraria.gs','utf8'),gas);assert.equal(gas.ddtHourlyParse_('MONDOFFICE VIA CAVOUR 10 TARANTO').cdc,'N110');
console.log('PASS N110: address punctuation, short road name, site name, exact street number/city, explicit CDC priority, other sites, hourly parser.');
