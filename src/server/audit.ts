import type { Queryable } from "./db.js";
import { uuid } from "./db.js";

export type AuditInput = {
  userId?: string | null;
  attoreEmail?: string | null;
  azione: string;
  entitaTipo: string;
  entitaId?: string | null;
  descrizione: string;
  modifiche?: unknown;
  ipHash?: string | null;
};

/**
 * Audit log delle modifiche rilevanti.
 * Non registra mai contenuti di file né dati personali estesi: solo riferimenti,
 * identificativi e un riepilogo leggibile.
 */
export async function audit(db: Queryable, input: AuditInput): Promise<void> {
  await db.query(
    `insert into audit_log (id, user_id, attore_email, azione, entita_tipo, entita_id, descrizione, modifiche, ip_hash)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuid(),
      input.userId ?? null,
      input.attoreEmail ?? null,
      input.azione,
      input.entitaTipo,
      input.entitaId ?? null,
      input.descrizione,
      input.modifiche ? JSON.stringify(input.modifiche) : null,
      input.ipHash ?? null,
    ],
  );
}

/** Calcola le differenze fra due oggetti, senza includere valori non modificati. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, { da: unknown; a: unknown }> {
  const changes: Record<string, { da: unknown; a: unknown }> = {};
  for (const field of fields) {
    const prev = before[field];
    const next = field in after ? after[field] : prev;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changes[field] = { da: prev ?? null, a: next ?? null };
    }
  }
  return changes;
}
