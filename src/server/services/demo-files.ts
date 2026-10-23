import ExcelJS from "exceljs";
import { DEMO_MARKER, type DemoDocumento } from "./demo-data.js";

/**
 * Generatori dei file dimostrativi.
 *
 * Servono al seed (documenti nell'archivio privato) e allo script che prepara
 * la demo statica su Vercel. Sono volutamente minimali: PDF scritti a mano con
 * una pagina e testo, CSV con BOM, XLSX con ExcelJS. Nessuna dipendenza esterna
 * oltre a ExcelJS e nessun dato reale.
 */

/** Riduce il testo a caratteri ASCII stampabili (i PDF usano la codifica WinAnsi). */
export function soloAscii(value: string): string {
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
export function buildPdf(titolo: string, righe: string[]): Buffer {
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

export function buildCsv(righe: string[]): Buffer {
  return Buffer.from(`\uFEFF${righe.join("\r\n")}\r\n`, "utf8");
}

export async function buildXlsx(documento: DemoDocumento): Promise<Buffer> {
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

export function nomeSicuro(nome: string, estensione: string): string {
  const base = soloAscii(nome.replace(/\.[a-z0-9]+$/i, ""))
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${base || "documento"}.${estensione}`;
}

