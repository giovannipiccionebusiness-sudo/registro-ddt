# Attivare il collegamento Google

Il sito GitHub è pronto; l'accesso ai dati richiede una configurazione OAuth Google. Non impostare il foglio o le cartelle come pubblici.

1. Aprire Google Cloud Console con l'account che possiede il registro.
2. Scegliere un progetto dedicato; abilitare **Google Sheets API** e **Google Drive API**.
3. In Google Auth Platform configurare nome applicazione, email supporto e audience. Se l'app resta in test, aggiungere l'account business come utente di test.
4. Creare un client OAuth 2.0 di tipo **Applicazione web**.
5. Aggiungere l'origine JavaScript autorizzata `https://giovannipiccionebusiness-sudo.github.io` (senza percorso). Il flusso popup token non richiede un Client Secret nel sito.
6. Copiare il **Client ID**, terminante in `.apps.googleusercontent.com`, nella sezione Collegamento del sito, insieme agli ID del foglio e delle due cartelle Drive. Questi riferimenti sono conservati nel browser, non nel repository. Non copiare Client Secret, password o token.
7. Premere **Accedi con Google**, scegliere l'account che accede al foglio e alle cartelle e autorizzare Sheets e Drive. Il token resta in memoria, senza localStorage o repository.

La configurazione del consenso e gli eventuali avvisi dipendono dallo stato del progetto Google. Non pubblicare un'app esterna senza gestire i requisiti di verifica previsti da Google. Per l'utilizzo personale di test configurare l'utente di test.

## Prima verifica operativa

- Controllare che il registro mostri i documenti esistenti.
- Provare ricerca, aggiornamento e anteprima (i file vengono scaricati via API e mostrati nel browser, evitando iframe di login Drive).
- Caricare un nuovo DDT reale e controllare OCR, dati, numero ordine e CDC.
- Completare eventuali campi mancanti nel foglio, aggiornare il sito, inserire il vero protocollo e generare il PDF.
- Verificare la riga G:I e la presenza del PDF nella cartella dei protocollati e dell'originale nella sua cartella.

## Limiti espliciti

L'accesso live, l'OCR su Google e le scritture sul registro devono ancora essere verificati dopo la configurazione del Client ID. Nessun dato aziendale è incluso nel repository.

Il sito usa le API Google direttamente: il progetto Apps Script esistente e il menu nel foglio rimangono disponibili. Il riconoscimento automatico conserva i sei fornitori e gli indirizzi N153/N148 configurati; gli altri fornitori e i CDC N154/N102 già presenti vengono consultati normalmente e, per i nuovi DDT, vanno completati manualmente.

I controlli prima delle scritture rilevano modifiche intervenute dall'ultima lettura. Web Locks impedisce operazioni simultanee solo fra schede dello stesso browser. Non è una transazione distribuita: usare un solo operatore/dispositivo per protocollare e non avviare contemporaneamente il menu Apps Script. Un uso multioperatore richiede un backend con blocco lato server.

Se una richiesta di scrittura fallisce o scade non viene ripetuta automaticamente. Controllare il foglio e Drive prima di riprovare. I PDF creati dalla nuova interfaccia riportano metadati che permettono di riprendere una protocollazione incompleta senza rigenerare il file, quando nome e originale corrispondono.
