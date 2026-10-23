import type { NextFunction, Request, Response, RequestHandler } from "express";
import type { ZodTypeAny } from "zod";
import { fieldErrors } from "../shared/schemas.js";

export class HttpError extends Error {
  status: number;
  code: string;
  errors?: Record<string, string>;
  constructor(
    status: number,
    message: string,
    options: { code?: string; errors?: Record<string, string> } = {},
  ) {
    super(message);
    this.status = status;
    this.code = options.code ?? defaultCode(status);
    this.errors = options.errors;
  }
}

function defaultCode(status: number): string {
  switch (status) {
    case 400:
      return "richiesta_non_valida";
    case 401:
      return "non_autenticato";
    case 403:
      return "non_autorizzato";
    case 404:
      return "non_trovato";
    case 409:
      return "conflitto";
    case 413:
      return "file_troppo_grande";
    case 429:
      return "troppe_richieste";
    default:
      return "errore";
  }
}

export function notFound(message = "Risorsa non trovata"): never {
  throw new HttpError(404, message);
}

export function badRequest(
  message: string,
  errors?: Record<string, string>,
): never {
  throw new HttpError(400, message, { code: "validazione", errors });
}

export function conflict(message: string): never {
  throw new HttpError(409, message);
}

export function forbidden(message = "Operazione non consentita"): never {
  throw new HttpError(403, message);
}

/** Wrapper per handler async: inoltra gli errori al middleware Express. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Valida il body/query/params con zod e restituisce i dati tipizzati. */
export function validate<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
): ReturnType<T["parse"]> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw new HttpError(400, "Alcuni campi non sono validi", {
      code: "validazione",
      errors: fieldErrors(result.error),
    });
  }
  return result.data;
}

export function pageParams(value: { page?: number; perPage?: number }): {
  page: number;
  perPage: number;
  offset: number;
} {
  const page = Math.max(1, value.page ?? 1);
  const perPage = Math.min(Math.max(5, value.perPage ?? 25), 200);
  return { page, perPage, offset: (page - 1) * perPage };
}

/** Risposta paginata uniforme. */
export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
) {
  return { items, total, page, perPage };
}

/** Errore generico mostrato al client: nessun dettaglio interno in produzione. */
export function publicErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  return "Si è verificato un errore interno. Riprova più tardi.";
}
