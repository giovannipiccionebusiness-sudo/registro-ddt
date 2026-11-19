/* Read-only OCR verification: no registry edits or file renames. */
function verificaParedesOCR(){
 const files=DriveApp.getFolderById(FOLDER_ORIGINALI_ID).getFilesByName('paredes marta.pdf');
 if(!files.hasNext())throw Error('PDF Paredes non trovato con il nome di prova.');
 const file=files.next();if(files.hasNext())throw Error('Nome file non univoco.');
 const text=estraiTestoOCR(file);
 console.log('OCR PAREDES: '+text.slice(0,4500));
 console.log('DATI RILEVATI: '+JSON.stringify(ddtHourlyParse_(text)));
}
