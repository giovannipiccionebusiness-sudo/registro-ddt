const fs=require('fs'),vm=require('vm'),assert=require('assert');
let mode='',removed=0;const triggers=[{getHandlerFunction:()=> 'inviaCopieDDT'},{getHandlerFunction:()=> 'letturaDDTOraria'}];
const ctx={console,DDT_HOURLY_SHEET:'sheet',SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getRange:()=>({setValue:v=>mode=v})})})},ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>{assert.equal(t.getHandlerFunction(),'inviaCopieDDT');removed++;}},GmailApp:{sendEmail:()=>{throw Error('Must never send')}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('gas/InvioCopieDDT.gs','utf8'),ctx);ctx.copieDDTSetup();ctx.inviaCopieDDT();assert.equal(mode,'APP_ESTERNA');assert.equal(removed,1);console.log('PASS: external mode, only Gmail copy trigger removed, dispatcher cannot send.');
