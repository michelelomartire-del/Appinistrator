import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { IMPORT_TEMPLATES } from "../services/import-templates.js";
import { IMPORT_TIPI } from "../../shared/constants.js";

/**
 * Genera i template XLSX di importazione in ./templates (versionabili).
 * Uso: npm run template:xlsx
 */
const outDir = path.resolve(process.cwd(), "templates");
await fs.mkdir(outDir, { recursive: true });

for (const tipo of IMPORT_TIPI) {
  const template = IMPORT_TEMPLATES[tipo];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM EffeBi";
  const sheet = workbook.addWorksheet("Dati");
  sheet.addRow(template.columns.map((c) => c.label));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8EEF5" },
  };
  template.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(
      16,
      Math.min(44, column.label.length + 6),
    );
    sheet.getRow(1).getCell(index + 1).note = [
      column.required ? "Obbligatorio" : "Facoltativo",
      column.enumValues
        ? `Valori ammessi: ${column.enumValues.join(", ")}`
        : "",
      column.help ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const instructions = workbook.addWorksheet("Istruzioni");
  instructions.columns = [
    { header: "Colonna", key: "label", width: 30 },
    { header: "Obbligatoria", key: "required", width: 14 },
    { header: "Valori ammessi / note", key: "note", width: 70 },
  ];
  for (const column of template.columns) {
    instructions.addRow({
      label: column.label,
      required: column.required ? "Sì" : "No",
      note: [
        column.enumValues ? column.enumValues.join(", ") : "",
        column.help ?? "",
      ]
        .filter(Boolean)
        .join(" — "),
    });
  }
  const file = path.join(outDir, `template-${tipo}.xlsx`);
  await workbook.xlsx.writeFile(file);
  console.log(`Creato ${path.relative(process.cwd(), file)}`);
}
