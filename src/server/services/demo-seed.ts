import { getDb, uuid, type Db } from "../db.js";
import { hashPassword } from "../security.js";
import { config } from "../config.js";

/**
 * Seed dimostrativo: TUTTI i dati sono fittizi e marcati DEMO.
 * Non usare questo file per dati reali. Le anagrafiche usano nomi di fantasia.
 */
export const DEMO_MARKER = "[DEMO]";

export async function resetDemoData(db: Db = getDb()): Promise<void> {
  // I condomini DEMO sono identificati dal marcatore nelle note.
  await db.query(
    `delete from condomini where note like $1 or codice like 'DEMO-%'`,
    [`%${DEMO_MARKER}%`],
  );
  await db.query(`delete from persone where note like $1`, [
    `%${DEMO_MARKER}%`,
  ]);
  await db.query(`delete from consumi where note like $1`, [
    `%${DEMO_MARKER}%`,
  ]);
  await db.query(`delete from import_batches where nome_file like 'demo%'`);
}

export async function seedDemo(
  db: Db = getDb(),
): Promise<{ userId: string; email: string }> {
  await resetDemoData(db);

  const email = config.demoAdmin.email;
  const existing = await db.query<{ id: string }>(
    "select id from users where lower(email) = lower($1)",
    [email],
  );
  let userId = existing[0]?.id;
  if (!userId) {
    userId = uuid();
    await db.query(
      `insert into users (id, email, nome, cognome, password_hash, ruolo, must_change_password)
       values ($1,$2,$3,$4,$5,'amministratore',false)`,
      [
        userId,
        email,
        "Francesca",
        "Demo",
        await hashPassword(config.demoAdmin.password),
      ],
    );
  }

  const demoNotes = `${DEMO_MARKER} Dati sintetici generati per la demo. Nessun dato reale.`;

  const condomini = [
    {
      id: uuid(),
      codice: "DEMO-0001",
      denominazione: "Condominio Demo Via delle Rose 12",
      indirizzo: "Via delle Rose 12",
      cap: "40100",
      comune: "Bologna",
      provincia: "BO",
      stato: "attivo",
      inizio: "2022-01-01",
    },
    {
      id: uuid(),
      codice: "DEMO-0002",
      denominazione: "Condominio Demo Via Verdi 8",
      indirizzo: "Via Verdi 8",
      cap: "40100",
      comune: "Bologna",
      provincia: "BO",
      stato: "attivo",
      inizio: "2023-04-01",
    },
    {
      id: uuid(),
      codice: "DEMO-0003",
      denominazione: "Condominio Demo Piazza Esempio 3",
      indirizzo: "Piazza Esempio 3",
      cap: "41100",
      comune: "Modena",
      provincia: "MO",
      stato: "potenziale",
      inizio: null,
    },
  ];

  for (const c of condomini) {
    await db.query(
      `insert into condomini (id, codice, denominazione, indirizzo, cap, comune, provincia, stato, data_inizio_incarico, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        c.id,
        c.codice,
        c.denominazione,
        c.indirizzo,
        c.cap,
        c.comune,
        c.provincia,
        c.stato,
        c.inizio,
        demoNotes,
        userId,
      ],
    );
  }

  const [demo1, demo2] = condomini;

  const persone = [
    {
      id: uuid(),
      nome: "Mario",
      cognome: "Rossi Demo",
      email: "mario.rossi@example.invalid",
      cf: "RSSMRA00A01A944X",
      tel: "051 0000001",
    },
    {
      id: uuid(),
      nome: "Lucia",
      cognome: "Bianchi Demo",
      email: "lucia.bianchi@example.invalid",
      cf: "BNCLCU00B02A944Y",
      tel: "051 0000002",
    },
    {
      id: uuid(),
      nome: "Anna",
      cognome: "Verdi Demo",
      email: "anna.verdi@example.invalid",
      cf: null,
      tel: "051 0000003",
    },
    {
      id: uuid(),
      nome: "Paolo",
      cognome: "Neri Demo",
      email: "paolo.neri@example.invalid",
      cf: null,
      tel: "051 0000004",
    },
    {
      id: uuid(),
      nome: "Sara",
      cognome: "Gialli Demo",
      email: null,
      cf: null,
      tel: "051 0000005",
    },
  ];

  for (const p of persone) {
    await db.query(
      `insert into persone (id, nome, cognome, codice_fiscale, email, telefono, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        p.id,
        p.nome,
        p.cognome,
        p.cf,
        p.email,
        p.tel,
        `${DEMO_MARKER} Contatto di fantasia`,
        userId,
      ],
    );
  }

  const relazioni: Array<[string, string, string]> = [
    [demo1!.id, persone[0]!.id, "consigliere"],
    [demo1!.id, persone[1]!.id, "condomino"],
    [demo1!.id, persone[2]!.id, "condomino"],
    [demo1!.id, persone[3]!.id, "fornitore"],
    [demo2!.id, persone[1]!.id, "referente"],
    [demo2!.id, persone[4]!.id, "consigliere"],
  ];
  for (const [condominioId, personaId, ruolo] of relazioni) {
    await db.query(
      `insert into condominio_persone (id, condominio_id, persona_id, ruolo) values ($1,$2,$3,$4)`,
      [uuid(), condominioId, personaId, ruolo],
    );
  }

  const unita = [
    {
      id: uuid(),
      condominioId: demo1!.id,
      identificativo: "Int. 1 - Piano 1",
      piano: "1",
      millesimi: 120,
    },
    {
      id: uuid(),
      condominioId: demo1!.id,
      identificativo: "Int. 2 - Piano 2",
      piano: "2",
      millesimi: 130,
    },
    {
      id: uuid(),
      condominioId: demo1!.id,
      identificativo: "Int. 3 - Piano 3",
      piano: "3",
      millesimi: 140,
    },
    {
      id: uuid(),
      condominioId: demo2!.id,
      identificativo: "Int. 1 - Piano 1",
      piano: "1",
      millesimi: 100,
    },
    {
      id: uuid(),
      condominioId: demo2!.id,
      identificativo: "Int. 2 - Piano 2",
      piano: "2",
      millesimi: 110,
    },
  ];
  for (const u of unita) {
    await db.query(
      `insert into unita (id, condominio_id, identificativo, piano, categoria, millesimi, note)
       values ($1,$2,$3,$4,'Appartamento',$5,$6)`,
      [u.id, u.condominioId, u.identificativo, u.piano, u.millesimi, demoNotes],
    );
  }

  const unitaLinks: Array<[string, string, string, number]> = [
    [unita[0]!.id, persone[0]!.id, "proprietario", 120],
    [unita[1]!.id, persone[1]!.id, "proprietario", 130],
    [unita[2]!.id, persone[2]!.id, "proprietario", 140],
    [unita[3]!.id, persone[1]!.id, "proprietario", 100],
    [unita[4]!.id, persone[4]!.id, "proprietario", 110],
  ];
  for (const [unitaId, personaId, titolo, millesimi] of unitaLinks) {
    await db.query(
      `insert into unita_persone (id, unita_id, persona_id, titolo, millesimi) values ($1,$2,$3,$4,$5)`,
      [uuid(), unitaId, personaId, titolo, millesimi],
    );
  }

  await db.query(
    `insert into attivita (id, condominio_id, persona_id, tipo, titolo, descrizione, data, scadenza, priorita, created_by)
     values ($1,$2,$3,'telefonata','Richiamare il consigliere (demo)','Attività dimostrativa', current_date - 2, current_date + 3, 'normale', $4)`,
    [uuid(), demo1!.id, persone[0]!.id, userId],
  );

  // --- Segnalazioni --------------------------------------------------------
  const segnalazioni: Array<{
    codice: string;
    condominioId: string;
    unitaId: string | null;
    titolo: string;
    descrizione: string;
    categoria: string;
    priorita: string;
    stato: string;
    apertura: string;
    scadenza: string;
    fornitore: string | null;
    storico: Array<[string, string]>;
  }> = [
    {
      codice: "SG-DEMO-01",
      condominioId: demo1!.id,
      unitaId: unita[0]!.id,
      titolo: "Perdita d’acqua dal soffitto (demo)",
      descrizione: "Segnalazione dimostrativa: macchia di umidità nel bagno.",
      categoria: "guasto",
      priorita: "alta",
      stato: "in_corso",
      apertura: daysAgo(20),
      scadenza: daysAgo(3),
      fornitore: persone[3]!.id,
      storico: [
        ["nuova", "Apertura segnalazione"],
        ["in_valutazione", "Sopralluogo programmato"],
        ["assegnata", "Assegnata a Idraulica Demo"],
        ["in_corso", "Intervento avviato"],
      ],
    },
    {
      codice: "SG-DEMO-02",
      condominioId: demo1!.id,
      unitaId: null,
      titolo: "Lampada scala spenta (demo)",
      descrizione: "Segnalazione dimostrativa per area comune.",
      categoria: "manutenzione",
      priorita: "media",
      stato: "nuova",
      apertura: daysAgo(4),
      scadenza: daysFromNow(10),
      fornitore: null,
      storico: [["nuova", "Apertura segnalazione"]],
    },
    {
      codice: "SG-DEMO-03",
      condominioId: demo2!.id,
      unitaId: null,
      titolo: "Porta d’ingresso da regolare (demo)",
      descrizione: "Segnalazione dimostrativa già chiusa.",
      categoria: "sicurezza",
      priorita: "bassa",
      stato: "chiusa",
      apertura: daysAgo(60),
      scadenza: daysAgo(45),
      fornitore: null,
      storico: [
        ["nuova", "Apertura segnalazione"],
        ["risolta", "Regolazione completata"],
        ["chiusa", "Verifica effettuata"],
      ],
    },
  ];
  for (const s of segnalazioni) {
    const id = uuid();
    await db.query(
      `insert into segnalazioni (id, codice, condominio_id, unita_id, area_comune, titolo, descrizione, categoria, priorita, stato,
        data_apertura, scadenza, data_chiusura, fornitore_persona_id, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        s.codice,
        s.condominioId,
        s.unitaId,
        s.unitaId ? null : "Area comune",
        s.titolo,
        s.descrizione,
        s.categoria,
        s.priorita,
        s.stato,
        s.apertura,
        s.scadenza,
        s.stato === "chiusa" ? daysAgo(45) : null,
        s.fornitore,
        userId,
      ],
    );
    let previous: string | null = null;
    let step = 0;
    for (const [stato, nota] of s.storico) {
      step += 1;
      await db.query(
        `insert into segnalazione_storico (id, segnalazione_id, da_stato, a_stato, nota, user_id, created_at)
         values ($1,$2,$3,$4,$5,$6, now() - ($7 || ' days')::interval)`,
        [uuid(), id, previous, stato, nota, userId, String(20 - step)],
      );
      previous = stato;
    }
  }

  // --- Assemblee -----------------------------------------------------------
  const assembleaPassata = uuid();
  await db.query(
    `insert into assemblee (id, condominio_id, data, ora, tipo, luogo, modalita, stato, note, created_by)
     values ($1,$2,$3,'18:00','ordinaria','Sala condominiale','presenza','svolta',$4,$5)`,
    [
      assembleaPassata,
      demo1!.id,
      daysAgo(120),
      `${DEMO_MARKER} Assemblea dimostrativa`,
      userId,
    ],
  );
  const assembleaFutura = uuid();
  await db.query(
    `insert into assemblee (id, condominio_id, data, ora, tipo, luogo, modalita, stato, note, created_by)
     values ($1,$2,$3,'18:30','ordinaria','Sala condominiale','mista','convocata',$4,$5)`,
    [
      assembleaFutura,
      demo1!.id,
      daysFromNow(21),
      `${DEMO_MARKER} Assemblea dimostrativa`,
      userId,
    ],
  );

  const puntiPassata: Array<[string, string, string | null]> = [
    [
      "Approvazione consuntivo esercizio (demo)",
      "approvato",
      "Delibera dimostrativa: consuntivo approvato a maggioranza.",
    ],
    ["Manutenzione facciata (demo)", "rinviato", null],
  ];
  for (const [i, [titolo, esito, delibera]] of puntiPassata.entries()) {
    await db.query(
      `insert into assemblea_punti (id, assemblea_id, ordine, titolo, esito, delibera) values ($1,$2,$3,$4,$5,$6)`,
      [uuid(), assembleaPassata, i + 1, titolo, esito, delibera],
    );
  }
  const puntiFutura: string[] = [
    "Approvazione preventivo (demo)",
    "Approvazione bilancio consuntivo (demo)",
    "Varie ed eventuali (demo)",
  ];
  for (const [i, titolo] of puntiFutura.entries()) {
    await db.query(
      `insert into assemblea_punti (id, assemblea_id, ordine, titolo) values ($1,$2,$3,$4)`,
      [uuid(), assembleaFutura, i + 1, titolo],
    );
  }
  for (const [personaId, presente, millesimi] of [
    [persone[0]!.id, true, 120],
    [persone[1]!.id, true, 130],
    [persone[2]!.id, false, 140],
  ] as Array<[string, boolean, number]>) {
    await db.query(
      `insert into assemblea_partecipanti (id, assemblea_id, persona_id, presente, millesimi) values ($1,$2,$3,$4,$5)`,
      [uuid(), assembleaFutura, personaId, presente, millesimi],
    );
  }

  // --- Rendiconti ----------------------------------------------------------
  const periodo2024 = uuid();
  await db.query(
    `insert into periodi_contabili (id, condominio_id, etichetta, data_inizio, data_fine, stato, note, created_by)
     values ($1,$2,'Esercizio 2024 (demo)','2024-01-01','2024-12-31','chiuso',$3,$4)`,
    [periodo2024, demo1!.id, `${DEMO_MARKER} Dati dimostrativi`, userId],
  );
  const spese = [
    ["2024-02-15", "Energia elettrica scale (demo)", "Utenze", 850.0],
    ["2024-03-10", "Pulizia parti comuni (demo)", "Pulizia", 1600.0],
    ["2024-05-20", "Manutenzione ascensore (demo)", "Manutenzione", 1200.0],
    ["2024-09-05", "Assicurazione stabile (demo)", "Assicurazione", 950.0],
    ["2024-11-30", "Amministrazione (demo)", "Amministrazione", 1200.0],
  ] as Array<[string, string, string, number]>;
  for (const [data, descrizione, categoria, importo] of spese) {
    await db.query(
      `insert into spese (id, periodo_id, data, descrizione, categoria, importo, created_by) values ($1,$2,$3,$4,$5,$6,$7)`,
      [uuid(), periodo2024, data, descrizione, categoria, importo, userId],
    );
  }
  const rateDemo = [
    [unita[0]!.id, "Rata 1 (demo)", "2024-03-31", 600, [["2024-03-28", 600]]],
    [unita[1]!.id, "Rata 1 (demo)", "2024-03-31", 600, [["2024-03-30", 300]]],
    [unita[2]!.id, "Rata 1 (demo)", "2024-03-31", 600, []],
    [unita[0]!.id, "Rata 2 (demo)", "2024-09-30", 600, [["2024-09-25", 600]]],
    [unita[1]!.id, "Rata 2 (demo)", "2024-09-30", 600, [["2024-09-29", 600]]],
    [unita[2]!.id, "Rata 2 (demo)", "2024-09-30", 600, []],
  ] as Array<[string, string, string, number, Array<[string, number]>]>;
  for (const [unitaId, descrizione, scadenza, importo, pagamenti] of rateDemo) {
    const rataId = uuid();
    await db.query(
      `insert into rate (id, periodo_id, unita_id, descrizione, scadenza, importo, criteri_ripartizione, created_by)
       values ($1,$2,$3,$4,$5,$6,'Millesimi (demo)',$7)`,
      [rataId, periodo2024, unitaId, descrizione, scadenza, importo, userId],
    );
    for (const [data, valore] of pagamenti) {
      await db.query(
        `insert into pagamenti (id, rata_id, data, importo, metodo, created_by) values ($1,$2,$3,$4,'bonifico',$5)`,
        [uuid(), rataId, data, valore, userId],
      );
    }
  }

  const periodo2025 = uuid();
  await db.query(
    `insert into periodi_contabili (id, condominio_id, etichetta, data_inizio, data_fine, stato, note, created_by)
     values ($1,$2,'Preventivo 2025 (demo)','2025-01-01','2025-12-31','bozza',$3,$4)`,
    [periodo2025, demo1!.id, `${DEMO_MARKER} Dati dimostrativi`, userId],
  );
  await db.query(
    `insert into spese (id, periodo_id, data, descrizione, categoria, importo, created_by)
     values ($1,$2,'2025-01-20','Pulizia parti comuni (demo)','Pulizia',1700,$3)`,
    [uuid(), periodo2025, userId],
  );

  // --- Consumi -------------------------------------------------------------
  const consumi = [
    ["acqua", "2024-01-01", "2024-03-31", 120.5, "m3", 320.0, "inserito"],
    ["acqua", "2024-04-01", "2024-06-30", 138.2, "m3", 350.0, "inserito"],
    ["acqua", "2024-07-01", "2024-09-30", 151.9, "m3", 390.0, "importato"],
    ["acqua", "2024-10-01", "2024-12-31", 110.4, "m3", 300.0, "inserito"],
    ["gas", "2024-01-01", "2024-03-31", 820.0, "m3", 700.0, "inserito"],
    ["gas", "2024-04-01", "2024-06-30", 210.0, "m3", 190.0, "stimato"],
  ] as Array<[string, string, string, number, string, number, string]>;
  for (const [categoria, da, a, valore, um, costo, origine] of consumi) {
    await db.query(
      `insert into consumi (id, condominio_id, categoria, periodo_da, periodo_a, valore, unita_misura, costo, fonte, origine, data_rilevazione, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'Demo',$9,$10,$11,$12)`,
      [
        uuid(),
        demo1!.id,
        categoria,
        da,
        a,
        valore,
        um,
        costo,
        origine,
        da,
        `${DEMO_MARKER} Valore dimostrativo`,
        userId,
      ],
    );
  }

  return { userId, email };
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(days: number): string {
  return daysAgo(-days);
}
