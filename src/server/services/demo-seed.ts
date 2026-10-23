import ExcelJS from "exceljs";
import { config } from "../config.js";
import { getDb, uuid, type Db } from "../db.js";
import { hashPassword, sha256 } from "../security.js";
import { storage } from "./storage.js";
import {
  DEMO_MARKER,
  buildDemoDataset,
  euro,
  isoDate,
  unitaDelCondominio,
  type DemoDocumento,
} from "./demo-data.js";

/**
 * Seed dimostrativo.
 *
 * TUTTI i dati sono inventati e marcati DEMO: nomi, indirizzi, importi, pratiche,
 * documenti e registro importazioni. Non usare questo file per dati reali.
 * Il seed è rifiutato in produzione e azzera soltanto i record demo, mai altro.
 */

export { DEMO_MARKER };

/* ------------------------------------------------------------------------- */
/* Generatori di file dimostrativi                                           */
/* ------------------------------------------------------------------------- */

/** Riduce il testo a caratteri ASCII stampabili (i PDF usano la codifica WinAnsi). */
function soloAscii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdf(value: string): string {
  return soloAscii(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/** PDF minimale ma valido: una pagina A4 con testo. Nessuna libreria esterna. */
function buildPdf(titolo: string, righe: string[]): Buffer {
  const righeImpaginate: string[] = [titolo.toUpperCase(), ""];
  for (const riga of righe) {
    const testo = soloAscii(riga);
    if (testo === "") {
      righeImpaginate.push("");
      continue;
    }
    for (let i = 0; i < testo.length; i += 92) {
      righeImpaginate.push(testo.slice(i, i + 92));
    }
  }
  const visibili = righeImpaginate.slice(0, 52);
  let stream = "BT\n/F1 11 Tf\n14 TL\n56 790 Td\n";
  visibili.forEach((riga, indice) => {
    if (indice > 0) stream += "T*\n";
    stream += `(${escapePdf(riga)}) Tj\n`;
  });
  stream += "ET";

  const oggetti = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${Buffer.byteLength(stream, "latin1")}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
  ];

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  oggetti.forEach((body, indice) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${indice + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<</Size ${oggetti.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function buildCsv(righe: string[]): Buffer {
  return Buffer.from(`\uFEFF${righe.join("\r\n")}\r\n`, "utf8");
}

async function buildXlsx(documento: DemoDocumento): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM EffeBi (dimostrativo)";
  const sheet = workbook.addWorksheet("Dati");
  const titolo = sheet.addRow([documento.titolo]);
  titolo.font = { bold: true, size: 13 };
  sheet.addRow([]);
  const tabella = documento.tabella ?? { intestazioni: [], righe: [] };
  const intestazioni = sheet.addRow(tabella.intestazioni);
  intestazioni.font = { bold: true };
  intestazioni.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } };
  });
  for (const riga of tabella.righe) sheet.addRow(riga);
  sheet.addRow([]);
  sheet.addRow([`${DEMO_MARKER} Documento dimostrativo: dati inventati, nessun valore contabile.`]);
  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 46;
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function nomeSicuro(nome: string, estensione: string): string {
  const base = soloAscii(nome.replace(/\.[a-z0-9]+$/i, ""))
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${base || "documento"}.${estensione}`;
}

function giornoRelativo(base: Date, offset: number): string {
  const data = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  data.setDate(data.getDate() + offset);
  return isoDate(data);
}

function dataPagamento(scadenza: string, oggi: string): string {
  const dataScadenza = new Date(`${scadenza}T00:00:00`);
  dataScadenza.setDate(dataScadenza.getDate() - 4);
  const dataOggi = new Date(`${oggi}T00:00:00`);
  if (dataScadenza > dataOggi) {
    dataOggi.setDate(dataOggi.getDate() - 3);
    return isoDate(dataOggi);
  }
  return isoDate(dataScadenza);
}

/* ------------------------------------------------------------------------- */
/* Reset dei soli dati dimostrativi                                          */
/* ------------------------------------------------------------------------- */

export async function resetDemoData(db: Db = getDb()): Promise<number> {
  const documenti = await db.query<{ storage_key: string }>(
    `select d.storage_key
       from documenti d
       left join condomini c on c.id = d.condominio_id
      where c.codice like 'DEMO-%'
         or c.note like $1
         or d.descrizione like $1
         or d.nome_file like 'demo%'`,
    [`%${DEMO_MARKER}%`],
  );
  let fileRimossi = 0;
  for (const documento of documenti) {
    try {
      await storage.delete(documento.storage_key);
      fileRimossi += 1;
    } catch {
      // Un file già assente non deve interrompere il ripristino della demo.
    }
  }

  await db.query(`delete from condomini where codice like 'DEMO-%' or note like $1`, [
    `%${DEMO_MARKER}%`,
  ]);
  await db.query(`delete from persone where note like $1`, [`%${DEMO_MARKER}%`]);
  await db.query(`delete from consumi where note like $1`, [`%${DEMO_MARKER}%`]);
  await db.query(`delete from import_batches where nome_file like 'demo%'`);
  await db.query(`delete from audit_log where descrizione like $1`, [
    `%${DEMO_MARKER}%`,
  ]);
  return fileRimossi;
}

/* ------------------------------------------------------------------------- */
/* Seed                                                                      */
/* ------------------------------------------------------------------------- */

export type SeedResult = {
  userId: string;
  email: string;
  password: string;
  conteggi: Record<string, number>;
  documenti: number;
};

export async function seedDemo(
  db: Db = getDb(),
  now: Date = new Date(),
): Promise<SeedResult> {
  if (config.isProduction) {
    throw new Error(
      "Il seed demo non può essere eseguito con NODE_ENV=production.",
    );
  }

  await resetDemoData(db);

  const dataset = buildDemoDataset(now);
  const oggi = isoDate(now);

  const email = config.demoAdmin.email;
  const password = config.demoAdmin.password;
  const existing = await db.query<{ id: string }>(
    "select id from users where lower(email) = lower($1)",
    [email],
  );
  let userId = existing[0]?.id;
  const passwordHash = await hashPassword(password);
  if (!userId) {
    userId = uuid();
    await db.query(
      `insert into users (id, email, nome, cognome, password_hash, ruolo, must_change_password)
       values ($1,$2,$3,$4,$5,'amministratore',false)`,
      [userId, email, "Francesca", "Demo", passwordHash],
    );
  } else {
    await db.query(
      `update users set nome = 'Francesca', cognome = 'Demo', password_hash = $2,
         attivo = true, must_change_password = false, failed_attempts = 0,
         locked_until = null, updated_at = now()
       where id = $1`,
      [userId, passwordHash],
    );
    await db.query("delete from sessions where user_id = $1", [userId]);
  }

  const condominioId = new Map<string, string>();
  const personaId = new Map<string, string>();
  const unitaId = new Map<string, string>();
  const segnalazioneId = new Map<string, string>();
  const assembleaId = new Map<string, string>();
  const periodoId = new Map<string, string>();

  // --- Condomini -----------------------------------------------------------
  for (const condominio of dataset.condomini) {
    const id = uuid();
    condominioId.set(condominio.key, id);
    await db.query(
      `insert into condomini (id, codice, denominazione, indirizzo, cap, comune, provincia,
         codice_fiscale, stato, data_inizio_incarico, data_fine_incarico, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        condominio.codice,
        condominio.denominazione,
        condominio.indirizzo,
        condominio.cap,
        condominio.comune,
        condominio.provincia,
        condominio.codiceFiscale,
        condominio.stato,
        condominio.dataInizioIncarico,
        condominio.dataFineIncarico,
        condominio.note,
        userId,
      ],
    );
  }

  // --- Persone -------------------------------------------------------------
  for (const persona of dataset.persone) {
    const id = uuid();
    personaId.set(persona.key, id);
    await db.query(
      `insert into persone (id, nome, cognome, codice_fiscale, email, telefono, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        persona.nome,
        persona.cognome,
        persona.codiceFiscale,
        persona.email,
        persona.telefono,
        `${DEMO_MARKER} Contatto di fantasia`,
        userId,
      ],
    );
  }

  // --- Unità ---------------------------------------------------------------
  for (const unita of dataset.unita) {
    const id = uuid();
    unitaId.set(unita.key, id);
    await db.query(
      `insert into unita (id, condominio_id, identificativo, piano, categoria,
         millesimi, millesimi_riscaldamento, note)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        condominioId.get(unita.condominio)!,
        unita.identificativo,
        unita.piano,
        unita.categoria,
        unita.millesimi,
        unita.millesimiRiscaldamento,
        `${DEMO_MARKER} Unità dimostrativa`,
      ],
    );
  }

  // --- Relazioni e titoli --------------------------------------------------
  for (const relazione of dataset.relazioni) {
    await db.query(
      `insert into condominio_persone (id, condominio_id, persona_id, ruolo, qualifica)
       values ($1,$2,$3,$4,$5)`,
      [
        uuid(),
        condominioId.get(relazione.condominio)!,
        personaId.get(relazione.persona)!,
        relazione.ruolo,
        relazione.qualifica ?? null,
      ],
    );
  }
  for (const titolo of dataset.unitaPersone) {
    await db.query(
      `insert into unita_persone (id, unita_id, persona_id, titolo, millesimi)
       values ($1,$2,$3,$4,$5)`,
      [
        uuid(),
        unitaId.get(titolo.unita)!,
        personaId.get(titolo.persona)!,
        titolo.titolo,
        titolo.millesimi,
      ],
    );
  }

  // Millesimi posseduti da ciascuna persona, per condominio (usati in assemblea).
  const millesimiPersona = new Map<string, number>();
  for (const titolo of dataset.unitaPersone) {
    if (titolo.titolo !== "proprietario") continue;
    const unita = dataset.unita.find((u) => u.key === titolo.unita)!;
    const chiave = `${unita.condominio}|${titolo.persona}`;
    millesimiPersona.set(chiave, euro((millesimiPersona.get(chiave) ?? 0) + (titolo.millesimi ?? 0)));
  }

  // --- Attività ------------------------------------------------------------
  for (const attivita of dataset.attivita) {
    await db.query(
      `insert into attivita (id, condominio_id, persona_id, tipo, titolo, descrizione,
         data, scadenza, completata, priorita, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() - ($12 || ' days')::interval)`,
      [
        uuid(),
        attivita.condominio ? condominioId.get(attivita.condominio)! : null,
        attivita.persona ? personaId.get(attivita.persona)! : null,
        attivita.tipo,
        attivita.titolo,
        attivita.descrizione ?? null,
        giornoRelativo(now, attivita.giorni),
        attivita.scadenzaGiorni !== undefined
          ? giornoRelativo(now, attivita.scadenzaGiorni)
          : null,
        attivita.completata,
        attivita.priorita,
        userId,
        String(Math.max(1, -attivita.giorni)),
      ],
    );
  }

  // --- Segnalazioni --------------------------------------------------------
  const sequenzaStati: Record<string, string[]> = {
    nuova: ["nuova"],
    in_valutazione: ["nuova", "in_valutazione"],
    assegnata: ["nuova", "assegnata"],
    in_corso: ["nuova", "assegnata", "in_corso"],
    risolta: ["nuova", "in_corso", "risolta"],
    chiusa: ["nuova", "risolta", "chiusa"],
  };
  const notaStato: Record<string, string> = {
    nuova: "Apertura della segnalazione.",
    in_valutazione: "Presa in carico e prima valutazione.",
    assegnata: "Assegnata al fornitore incaricato.",
    in_corso: "Intervento avviato.",
    risolta: "Intervento completato, in attesa di verifica.",
    chiusa: "Verifica effettuata, segnalazione chiusa.",
  };

  for (const [indice, segnalazione] of dataset.segnalazioni.entries()) {
    const id = uuid();
    segnalazioneId.set(segnalazione.key, id);
    const apertura = giornoRelativo(now, segnalazione.aperturaGiorni);
    const chiusura =
      segnalazione.chiusuraGiorni !== undefined
        ? giornoRelativo(now, segnalazione.chiusuraGiorni)
        : segnalazione.stato === "risolta" || segnalazione.stato === "chiusa"
          ? giornoRelativo(now, -2)
          : null;

    await db.query(
      `insert into segnalazioni (id, codice, condominio_id, unita_id, area_comune, titolo,
         descrizione, categoria, priorita, stato, data_apertura, scadenza, data_chiusura,
         fornitore_persona_id, referente, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now() - ($17 || ' days')::interval)`,
      [
        id,
        `SG-DEMO-${String(indice + 1).padStart(3, "0")}`,
        condominioId.get(segnalazione.condominio)!,
        segnalazione.unita ? unitaId.get(segnalazione.unita)! : null,
        segnalazione.areaComune ?? null,
        segnalazione.titolo,
        segnalazione.descrizione,
        segnalazione.categoria,
        segnalazione.priorita,
        segnalazione.stato,
        apertura,
        segnalazione.scadenzaGiorni !== undefined
          ? giornoRelativo(now, segnalazione.scadenzaGiorni)
          : null,
        chiusura,
        segnalazione.fornitore ? personaId.get(segnalazione.fornitore)! : null,
        segnalazione.referente ?? null,
        userId,
        String(Math.max(1, -segnalazione.aperturaGiorni)),
      ],
    );

    const storico =
      segnalazione.storico ??
      (sequenzaStati[segnalazione.stato] ?? ["nuova"]).map((stato, posizione, tutti) => ({
        stato,
        nota: notaStato[stato] ?? "Aggiornamento di stato.",
        giorni:
          -segnalazione.aperturaGiorni -
          Math.round(
            ((-segnalazione.aperturaGiorni + (segnalazione.chiusuraGiorni ?? 0)) *
              (tutti.length - 1 - posizione)) /
              Math.max(tutti.length - 1, 1),
          ),
      }));

    let precedente: string | null = null;
    for (const passo of storico) {
      await db.query(
        `insert into segnalazione_storico (id, segnalazione_id, da_stato, a_stato, nota, user_id, created_at)
         values ($1,$2,$3,$4,$5,$6, now() - ($7 || ' days')::interval)`,
        [
          uuid(),
          id,
          precedente,
          passo.stato,
          passo.nota,
          userId,
          String(Math.max(0, -passo.giorni)),
        ],
      );
      precedente = passo.stato;
    }
  }

  // --- Assemblee -----------------------------------------------------------
  for (const assemblea of dataset.assemblee) {
    const id = uuid();
    assembleaId.set(assemblea.key, id);
    await db.query(
      `insert into assemblee (id, condominio_id, data, ora, tipo, luogo, modalita, stato,
         quorum_registrato, note, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() - ($12 || ' days')::interval)`,
      [
        id,
        condominioId.get(assemblea.condominio)!,
        giornoRelativo(now, assemblea.giorni),
        assemblea.ora,
        assemblea.tipo,
        assemblea.luogo,
        assemblea.modalita,
        assemblea.stato,
        assemblea.quorumRegistrato,
        `${DEMO_MARKER} Assemblea dimostrativa`,
        userId,
        String(Math.max(1, 30 - assemblea.giorni)),
      ],
    );

    for (const [indice, punto] of assemblea.punti.entries()) {
      await db.query(
        `insert into assemblea_punti (id, assemblea_id, ordine, titolo, descrizione, esito, delibera)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          uuid(),
          id,
          indice + 1,
          punto.titolo,
          punto.descrizione ?? null,
          punto.esito ?? null,
          punto.delibera ?? null,
        ],
      );
    }

    for (const partecipante of assemblea.partecipanti) {
      const millesimi = millesimiPersona.get(
        `${assemblea.condominio}|${partecipante.persona}`,
      );
      await db.query(
        `insert into assemblea_partecipanti (id, assemblea_id, persona_id, presente, delegante, millesimi)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          uuid(),
          id,
          personaId.get(partecipante.persona)!,
          partecipante.presente,
          partecipante.delegante ?? null,
          millesimi ?? null,
        ],
      );
    }
  }

  // --- Rendiconti ----------------------------------------------------------
  let rateCreate = 0;
  let pagamentiCreati = 0;
  for (const periodo of dataset.periodi) {
    const id = uuid();
    periodoId.set(periodo.key, id);
    await db.query(
      `insert into periodi_contabili (id, condominio_id, etichetta, data_inizio, data_fine, stato, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        condominioId.get(periodo.condominio)!,
        periodo.etichetta,
        periodo.inizio,
        periodo.fine,
        periodo.stato,
        `${DEMO_MARKER} Periodo dimostrativo`,
        userId,
      ],
    );

    for (const spesa of periodo.spese) {
      // Nessuna spesa può essere datata nel futuro: se la demo viene eseguita a
      // inizio anno, le voci nominali vengono ricondotte a una data plausibile.
      const dataSpesa = spesa.data > oggi ? giornoRelativo(now, -3) : spesa.data;
      await db.query(
        `insert into spese (id, periodo_id, data, descrizione, categoria, importo, fornitore, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          uuid(),
          id,
          dataSpesa < periodo.inizio ? periodo.inizio : dataSpesa,
          spesa.descrizione,
          spesa.categoria,
          euro(spesa.importo),
          spesa.fornitore ?? null,
          userId,
        ],
      );
    }

    if (periodo.budget === null) continue;

    const unita = unitaDelCondominio(dataset, periodo.condominio);
    for (const rata of periodo.rate) {
      for (const [indice, unitaCorrente] of unita.entries()) {
        const importo = euro(
          (periodo.budget * rata.quota * unitaCorrente.millesimi) / 1000,
        );
        if (importo <= 0) continue;
        const rataId = uuid();
        rateCreate += 1;
        await db.query(
          `insert into rate (id, periodo_id, unita_id, descrizione, numero, scadenza, importo,
             criteri_ripartizione, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            rataId,
            id,
            unitaId.get(unitaCorrente.key)!,
            rata.descrizione,
            rata.numero,
            rata.scadenza,
            importo,
            "Ripartizione per millesimi di proprietà (valore registrato, non ricalcolato)",
            userId,
          ],
        );

        const comportamento = rata.pagamenti?.(indice) ?? "completo";
        if (comportamento === "nessuno") continue;
        const versato = comportamento === "parziale" ? euro(importo * 0.4) : importo;
        if (versato <= 0) continue;
        pagamentiCreati += 1;
        await db.query(
          `insert into pagamenti (id, rata_id, data, importo, metodo, riferimento, created_by)
           values ($1,$2,$3,$4,'bonifico',$5,$6)`,
          [
            uuid(),
            rataId,
            dataPagamento(rata.scadenza, oggi),
            versato,
            comportamento === "parziale" ? "Acconto" : null,
            userId,
          ],
        );
      }
    }
  }

  // --- Consumi -------------------------------------------------------------
  for (const consumo of dataset.consumi) {
    await db.query(
      `insert into consumi (id, condominio_id, categoria, periodo_da, periodo_a, valore,
         unita_misura, costo, fonte, origine, data_rilevazione, note, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        uuid(),
        condominioId.get(consumo.condominio)!,
        consumo.categoria,
        consumo.da,
        consumo.a,
        consumo.valore,
        consumo.unitaMisura,
        consumo.costo,
        consumo.fonte,
        consumo.origine,
        consumo.a,
        consumo.note ? `${DEMO_MARKER} ${consumo.note}` : `${DEMO_MARKER} Valore dimostrativo`,
        userId,
      ],
    );
  }

  // --- Documenti -----------------------------------------------------------
  let documentiCreati = 0;
  for (const [indice, documento] of dataset.documenti.entries()) {
    const contenuto =
      documento.tipo === "pdf"
        ? buildPdf(documento.titolo, documento.righe)
        : documento.tipo === "csv"
          ? buildCsv(documento.righe)
          : await buildXlsx(documento);
    const mime =
      documento.tipo === "pdf"
        ? "application/pdf"
        : documento.tipo === "csv"
          ? "text/csv"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const id = uuid();
    const estensione = documento.tipo;
    const storageKey = `${now.getFullYear()}/${id}/${nomeSicuro(documento.nomeFile, estensione)}`;
    try {
      await storage.put(storageKey, contenuto, mime);
    } catch (error) {
      process.stderr.write(
        `[demo] documento non archiviato (${documento.nomeFile}): ${(error as Error).message}\n`,
      );
      continue;
    }
    const entitaId =
      documento.entitaTipo === "assemblea"
        ? assembleaId.get(documento.entitaRef ?? "")
        : documento.entitaTipo === "periodo_contabile"
          ? periodoId.get(documento.entitaRef ?? "")
          : documento.entitaTipo === "segnalazione"
            ? segnalazioneId.get(documento.entitaRef ?? "")
            : null;
    await db.query(
      `insert into documenti (id, condominio_id, entita_tipo, entita_id, nome_file, mime,
         dimensione, storage_key, checksum_sha256, categoria, descrizione, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() - ($13 || ' days')::interval)`,
      [
        id,
        condominioId.get(documento.condominio)!,
        documento.entitaTipo,
        entitaId ?? null,
        documento.nomeFile,
        mime,
        contenuto.length,
        storageKey,
        sha256(contenuto),
        documento.categoria,
        `${DEMO_MARKER} ${documento.descrizione}`,
        userId,
        String(18 + indice * 4),
      ],
    );
    documentiCreati += 1;
  }

  // --- Registro importazioni ----------------------------------------------
  for (const lotto of dataset.importazioni) {
    const batchId = uuid();
    const totale = lotto.righe.length;
    const errori = lotto.righe.filter((r) => r.esito === "errore").length;
    const duplicati = lotto.righe.filter((r) => r.esito === "duplicato").length;
    const importate = lotto.righe.filter((r) => r.esito === "importata").length;
    await db.query(
      `insert into import_batches (id, tipo, nome_file, dimensione, hash_file, stato,
         righe_totali, righe_valide, righe_errori, righe_duplicate, riepilogo, created_by,
         created_at, completato_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         now() - ($13 || ' days')::interval, now() - ($13 || ' days')::interval)`,
      [
        batchId,
        lotto.tipo,
        lotto.nomeFile,
        4200 + totale * 180,
        sha256(`${DEMO_MARKER}${lotto.nomeFile}`),
        lotto.stato,
        totale,
        importate,
        errori,
        duplicati,
        JSON.stringify({
          dimostrativo: true,
          nota: `${DEMO_MARKER} Lotto di esempio: il file non è stato conservato.`,
          importate,
          ignorate: duplicati,
        }),
        userId,
        String(Math.max(1, -lotto.giorni)),
      ],
    );
    for (const riga of lotto.righe) {
      await db.query(
        `insert into import_rows (id, batch_id, numero_riga, dati, errori, avvisi,
           duplicato, esito, created_at)
         values ($1,$2,$3,$4,$5,'[]'::jsonb,$6,$7, now() - ($8 || ' days')::interval)`,
        [
          uuid(),
          batchId,
          riga.numero,
          JSON.stringify({ riga: riga.sintesi, dimostrativo: true }),
          JSON.stringify(riga.errori ?? []),
          riga.esito === "duplicato",
          riga.esito,
          String(Math.max(1, -lotto.giorni)),
        ],
      );
    }
  }

  // --- Audit log -----------------------------------------------------------
  for (const voce of dataset.audit) {
    await db.query(
      `insert into audit_log (id, user_id, attore_email, azione, entita_tipo, descrizione, created_at)
       values ($1,$2,$3,$4,$5,$6, now() - ($7 || ' days')::interval)`,
      [
        uuid(),
        userId,
        email,
        voce.azione,
        voce.entitaTipo,
        voce.descrizione,
        String(Math.max(1, -voce.giorni)),
      ],
    );
  }

  return {
    userId,
    email,
    password,
    documenti: documentiCreati,
    conteggi: {
      condomini: dataset.condomini.length,
      persone: dataset.persone.length,
      unita: dataset.unita.length,
      relazioni: dataset.relazioni.length,
      titoliUnita: dataset.unitaPersone.length,
      segnalazioni: dataset.segnalazioni.length,
      assemblee: dataset.assemblee.length,
      periodi: dataset.periodi.length,
      rate: rateCreate,
      pagamenti: pagamentiCreati,
      consumi: dataset.consumi.length,
      attivita: dataset.attivita.length,
      documenti: documentiCreati,
      importazioni: dataset.importazioni.length,
    },
  };
}
