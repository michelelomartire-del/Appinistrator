/** Piccolo costruttore di query parametriche (mai interpolazione di valori). */
export class Sql {
  params: unknown[] = [];
  where: string[] = [];

  /** Aggiunge un parametro e restituisce il placeholder ($1, $2, ...). */
  p(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  /** Aggiunge una condizione sostituendo i `?` con placeholder parametrici. */
  and(condition: string, ...values: unknown[]): this {
    let index = 0;
    const rendered = condition.replace(/\?/g, () => {
      const value = values[index++];
      return this.p(value === undefined ? null : value);
    });
    this.where.push(rendered);
    return this;
  }

  /** Condizione opzionale: ignorata se il valore è null/undefined. */
  andIf(value: unknown, condition: string, ...extra: unknown[]): this {
    if (value === undefined || value === null || value === "") return this;
    return this.and(condition, value, ...extra);
  }

  get whereClause(): string {
    return this.where.length ? `where ${this.where.join(" and ")}` : "";
  }

  /** Parametri per limit/offset (aggiunti in coda). */
  paginate(
    limit: number,
    offset: number,
  ): { limitRef: string; offsetRef: string } {
    return { limitRef: this.p(limit), offsetRef: this.p(offset) };
  }
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normalizza i risultati SQL (decimali come stringhe) in numeri, solo per i campi indicati. */
export function numericFields<T extends Record<string, unknown>>(
  row: T,
  fields: Array<keyof T>,
): T {
  const out = { ...row };
  for (const field of fields) {
    const value = out[field];
    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      !Number.isNaN(Number(value))
    ) {
      (out as Record<string, unknown>)[field as string] = Number(value);
    }
  }
  return out;
}
