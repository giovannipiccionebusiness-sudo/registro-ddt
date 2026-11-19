/* External Outlook/mail app handles all copy sends. No background email dispatch. */
function copieDDTSetup(){
 const ss=SpreadsheetApp.openById(DDT_HOURLY_SHEET),cfg=ss.getSheetByName('CopieDDTConfig');
 if(cfg)cfg.getRange('B5').setValue('APP_ESTERNA');
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='inviaCopieDDT').forEach(t=>ScriptApp.deleteTrigger(t));
 console.log('Invio Gmail disattivato. Le copie si preparano nell’app di posta esterna.');
}
function inviaCopieDDT(){return;}
