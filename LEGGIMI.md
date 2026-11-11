# Agenda B&B

App per gestire le prenotazioni del B&B. Funziona **senza internet** e si installa sull'iPhone come un'app normale (icona nella schermata Home). I dati restano **solo sul telefono**.

## Cosa si registra per ogni prenotazione

- Casa in cui alloggia
- Nome (e telefono, facoltativo) e colore del cliente nel calendario (scelto in automatico, si può cambiare)
- Giorno di arrivo e di partenza (le notti si calcolano da sole)
- Numero di persone
- Servizi: biancheria, Wi‑Fi, colazione e altri aggiunti nel menu Prezzi; il loro costo si calcola da solo
- Spesa giornaliera e totale (totale = spesa giornaliera × notti + servizi; si può anche scrivere a mano)
- Acconto: se è stato versato e quanto; l'app calcola quanto resta da saldare
- **Casa di un altro proprietario**: nome del proprietario, quanto gli spetta (in % sul totale oppure in euro) e se è già stato pagato; l'app mostra quanto resta a voi
- Note

## Le schermate

- **Agenda**: arrivi e partenze di oggi, elenco delle prenotazioni (prossime, passate, tutte), filtro per casa, ricerca.
- **Calendario**: due viste, *Tutte le case* oppure *Per casa*. Ogni cliente è una barra colorata (un colore per cliente) che va dal giorno di arrivo al giorno di partenza; nella vista totale lo stesso giorno può avere più barre. Toccando una barra si apre la prenotazione, toccando un giorno si vede l'elenco. Sotto c'è il riepilogo del mese (notti, occupazione, incasso, quote proprietari, quanto resta a voi).
- **Case**: elenco delle case con prezzo a notte, eventuale proprietario e quota %. Questi dati vengono proposti in automatico quando si crea una prenotazione in quella casa.
- **Conti**: quanto c'è da dare a ogni proprietario (prenotazione per prenotazione), totali dell'anno e per casa, backup.
- **Prezzi**: cifra base di ogni servizio e come si paga (a soggiorno, a notte, a persona, a persona a notte). Si possono aggiungere altri servizi (es. tassa di soggiorno, pulizia finale). In alto si sceglie *Prezzi base* oppure una casa: ogni casa può avere i suoi prezzi per i servizi (se un prezzo è lasciato vuoto, la casa usa quello base). Nella prenotazione il costo dei servizi si calcola con i prezzi della casa scelta. Cambiare i prezzi non modifica le prenotazioni già salvate.

Se si inseriscono due prenotazioni sovrapposte nella stessa casa, l'app avvisa prima di salvare.

## Riepilogo PDF per il cliente

Dentro una prenotazione, il pulsante **📄 Riepilogo PDF per il cliente** salva la prenotazione e crea un PDF con:
intestazione della struttura, dati del soggiorno (ospite, alloggio, date, notti, persone), tabella delle spese
(pernottamento, ogni servizio con il dettaglio del calcolo, eventuale sconto o costo aggiuntivo se il totale è stato scritto a mano),
totale, acconto già versato e quanto resta da saldare.
Sull'iPhone si apre il foglio di condivisione: si può salvare in File o mandare direttamente via WhatsApp o mail.

Il PDF **non** contiene i dati interni (proprietario, quote, note) e riporta in fondo "Documento riepilogativo, non valido ai fini fiscali".
Il PDF viene creato nel telefono, funziona anche senza internet.

Nome della struttura, indirizzo, telefono, email e un testo finale (es. IBAN, orario di check-out) si impostano in **Conti → Dati per il riepilogo PDF ai clienti**.

## Installazione sull'iPhone

L'app va messa online **una sola volta** su un indirizzo `https://` (serve all'iPhone per scaricarla e installarla). Dopo il primo avvio funziona anche senza connessione.

1. Caricare la cartella su un hosting gratuito, ad esempio:
   - **Netlify Drop**: aprire https://app.netlify.com/drop e trascinarci la cartella dell'app; si ottiene un indirizzo tipo `https://nome-a-caso.netlify.app`.
   - oppure **GitHub Pages**.
   
   Bastano questi file: `index.html`, `style.css`, `app.js`, `pdf.js`, `sw.js`, `manifest.webmanifest` e la cartella `icons`.
2. Sull'iPhone aprire quell'indirizzo con **Safari**.
3. Toccare **Condividi** (il quadrato con la freccia) → **Aggiungi alla schermata Home**.
4. Aprire l'app dall'icona. Da qui in poi funziona anche in modalità aereo.

> Le prenotazioni non vengono mai inviate all'hosting: il sito contiene solo l'app vuota, i dati si salvano nel telefono.

## Backup (importante)

Siccome i dati stanno solo nel telefono, conviene fare ogni tanto un backup dalla schermata **Conti → Esporta backup** e salvarlo in File / iCloud Drive o mandarlo per mail. Con **Ripristina da backup** si recuperano i dati (es. su un telefono nuovo).

C'è anche **Esporta per Excel (CSV)** per avere l'elenco in un foglio di calcolo.

Attenzione: se si elimina l'icona dell'app dalla schermata Home, iOS cancella anche i dati. Fare prima un backup.

## Provarla sul computer

```bash
python -m http.server 8765
```

poi aprire http://localhost:8765 nel browser.

## Aggiornare l'app

Dopo aver modificato i file, aumentare il numero di versione in `sw.js` (es. `agenda-beb-v2` → `agenda-beb-v3`) e ricaricare i file sull'hosting. L'iPhone scarica la nuova versione la prima volta che apre l'app con internet (a volte serve chiuderla e riaprirla due volte). I dati non vengono toccati.

Le icone si rigenerano con `python tools/make_icons.py`.
