# Pure Promemoria Aziendale — MVP iOS + Android

Prima versione del progetto React Native / Expo SDK 55, sviluppato come app **separata** da VARGA CANTIERI.

## Funzioni implementate

- **Timbratura entrata e uscita** con fasce orarie modificabili e selezione giorni lavorativi.
- **Ufficio** salvato con pulsante per acquisire latitudine e longitudine dal GPS, oppure inserimento manuale; raggio 100/150/300/500 metri.
- **Geofencing**: quando il telefono rileva un ingresso nell'area dell'ufficio, prepara gli avvisi delle fasce successive; quando rileva un'uscita, annulla quelli programmati. Se l'app è aperta, verifica anche la posizione attuale.
- **Avvisi ripetuti ogni 5, 10 o 15 minuti** nella fascia, fino a conferma manuale **Ho timbrato**, o alla fine della fascia. Suoneria originale inclusa.
- **Modalità solo orario** (senza GPS) per chi preferisce promemoria non condizionati dalla posizione.
- **Promemoria personalizzati** con titolo, note, data e ora; una volta oppure tutti i giorni.
- **Registro locale** delle conferme di timbratura. Nessun backend o account necessario.

> IMPORTANTE: l'app **non effettua materialmente la timbratura aziendale**. Ricorda all'utente di effettuarla sull'app/terminale ufficiale e permette di confermarla manualmente.

## Limitazioni tecniche e privacy

1. Le notifiche iOS non possono suonare in modo continuo come una chiamata in ingresso senza interrompersi al tocco. Qui si usano notifiche acustiche ripetute; modalità Silenzioso, Non disturbare/Full immersion, batteria, permessi e sistema operativo possono ritardarle o silenziarle.
2. Il geofencing **non è esatto al metro né immediato** e dipende dal servizio di localizzazione. Un evento di uscita può arrivare con ritardo; questo può causare un avviso dopo l'uscita. Non usare il sistema come prova di presenza o controllo del dipendente.
3. Serve il permesso posizione **Sempre** per il geofencing in background; su Android possono essere necessarie autorizzazioni dalle Impostazioni del sistema. La localizzazione precisa deve essere attiva.
4. Dopo il rilevamento della posizione vengono programmate fino a **36 ore di promemoria** e non più di **48 notifiche di timbratura**; la pianificazione si rinnova all'avvio/rientro nell'app o al successivo ingresso nell'ufficio. Non è garantita la consegna di tutti gli avvisi in ogni circostanza.
5. Le impostazioni e il registro risiedono nel solo dispositivo (`AsyncStorage`), senza sincronizzazione tra più telefoni, senza backup cloud automatico e senza tracciamento del percorso.
6. Promemoria molto numerosi possono incontrare limiti del sistema alla programmazione di notifiche locali, soprattutto su iOS.
7. Le fasce possono attraversare mezzanotte, ma il registro di conferma è organizzato per **giorno solare**, non per turno: da migliorare prima dell'uso per turni notturni reali.

## Come installare e compilare

Requisiti: Node.js 20.19+, Android Studio per compilazioni Android locali, oppure ambiente Expo Application Services (EAS); account Apple Developer per iOS / TestFlight.

```sh
unzip Pure-Promemoria-Aziendale.zip
cd pure-promemoria-aziendale
npm install
npx expo install --fix
npx expo start --dev-client
```

Per testare veramente GPS in background usare **development build** su un dispositivo fisico. **Expo Go non supporta il geofencing in background**.

Per compilazioni cloud:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Per distribuzione App Store/TestFlight e Google Play servono credenziali, icone e descrizioni, una policy privacy pubblica e test reali. La pubblicazione non è stata eseguita.

**Nota:** `ios.bundleIdentifier` e `android.package` sono identificatori tecnici proposti. Verificare che siano disponibili prima di pubblicare.

## Prima configurazione sul telefono

1. Aprire **Impostazioni** dentro l'app.
2. Quando si è in ufficio, premere **Usa la mia posizione GPS**.
3. Impostare il raggio e le fasce **Entrata** e **Uscita**, selezionare i giorni e la frequenza di avviso.
4. Premere **Salva impostazioni**.
5. Premere **Autorizza posizione in background**, concedendo la posizione **Sempre** e autorizzando le notifiche. Se il permesso non viene concesso, gli avvisi GPS non saranno affidabili/attivi.
6. Provare **Prova il suono di notifica**; poi testare sul posto un ingresso/uscita reale.

## Struttura

- `App.tsx` — interfaccia: Oggi, Altri promemoria, Registro, Impostazioni.
- `src/model.ts` — tipi e valori predefiniti.
- `src/storage.ts` — archiviazione locale.
- `src/notifications.ts` — notifiche e pianificazione condizionata.
- `src/geofence.ts` — task geofence e permessi.
- `assets/alert.wav` — segnale acustico originale.
- `app.json` — impostazioni iOS/Android e permessi.

## Test prima di una pubblicazione

- Concedere e revocare permessi GPS/notifiche in background su iOS e Android; riprovare dopo riavvio.
- Verificare arrivo e uscita dall'area con schermo spento e app in background.
- Testare Entrata/Uscita nelle diverse fasce e il pulsante **Ho timbrato**.
- Testare app chiusa forzatamente e impostazioni di risparmio batteria; i risultati dipendono dalla piattaforma.
- Testare giorni diversi, cambi d'ora, fusi orari, fasce a cavallo di mezzanotte e promemoria molto numerosi.
- Controllare che la revisione Apple/Google accetti le motivazioni richieste per posizione background.

## Documentazione API di riferimento

- Expo Location: https://docs.expo.dev/versions/v55.0.0/sdk/location/
- Expo Notifications: https://docs.expo.dev/versions/v55.0.0/sdk/notifications/
- Apple Core Location: https://developer.apple.com/documentation/CoreLocation/monitoring-the-user-s-proximity-to-geographic-regions