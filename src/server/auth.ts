import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { getDb, uuid, type Queryable } from "./db.js";
import { HttpError } from "./http.js";
import { clientIp, limiters } from "./rate-limit.js";
import {
  newCsrfToken,
  pseudoHash,
  randomToken,
  sha256,
  timingSafeEqualString,
} from "./security.js";
import type { SessionUser } from "../shared/api-types.js";

export const SESSION_COOKIE = "effebi_crm_session";
export const CSRF_COOKIE = "effebi_crm_csrf";
export const CSRF_HEADER = "x-csrf-token";

export type UserRow = {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  password_hash: string;
  ruolo: "amministratore" | "collaboratore";
  attivo: boolean;
  mfa_enabled: boolean;
  mfa_secret_cifrato: string | null;
  mfa_last_counter: string | number | null;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: string | Date | null;
  last_login_at: string | Date | null;
};

export type SessionRow = {
  id: string;
  user_id: string;
  csrf_token: string;
  mfa_verified_at: string | Date | null;
  expires_at: string | Date;
  last_seen_at: string | Date;
};

export type AuthContext = {
  user: UserRow;
  session: SessionRow;
  ipHash: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      /** sessione presente ma MFA non ancora completata */
      pendingSession?: SessionRow;
      ipHash?: string;
    }
  }
}

export function toSessionUser(user: UserRow): SessionUser {
  return {
    id: user.id,
    email: user.email,
    nome: user.nome,
    cognome: user.cognome,
    ruolo: user.ruolo,
    mfaEnabled: user.mfa_enabled,
    mustChangePassword: user.must_change_password,
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function setSessionCookies(
  res: Response,
  token: string,
  csrfToken: string,
): void {
  const maxAge = config.sessionTtlHours * 60 * 60 * 1000;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge,
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    path: "/",
    sameSite: "lax",
    secure: config.isProduction,
  });
  res.clearCookie(CSRF_COOKIE, {
    path: "/",
    sameSite: "lax",
    secure: config.isProduction,
  });
}

export type CreatedSession = {
  id: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
};

export async function createSession(
  db: Queryable,
  userId: string,
  options: { ip?: string; userAgent?: string; mfaVerified?: boolean } = {},
): Promise<CreatedSession> {
  const id = uuid();
  const token = randomToken(32);
  const csrfToken = newCsrfToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  await db.query(
    `insert into sessions (id, user_id, token_hash, csrf_token, mfa_verified_at, expires_at, ip_hash, user_agent)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      userId,
      sha256(token),
      csrfToken,
      options.mfaVerified ? new Date() : null,
      expiresAt,
      options.ip ? pseudoHash(options.ip) : null,
      options.userAgent ? options.userAgent.slice(0, 300) : null,
    ],
  );
  return { id, token, csrfToken, expiresAt };
}

export async function findSessionByToken(
  token: string,
  db: Queryable = getDb(),
): Promise<{ session: SessionRow; user: UserRow } | null> {
  const rows = await db.query<Record<string, any>>(
    `select s.id as session_id, s.user_id, s.csrf_token, s.mfa_verified_at, s.expires_at, s.last_seen_at,
            u.id, u.email, u.nome, u.cognome, u.password_hash, u.ruolo, u.attivo, u.mfa_enabled,
            u.mfa_secret_cifrato, u.mfa_last_counter, u.must_change_password, u.failed_attempts,
            u.locked_until, u.last_login_at
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) return null;
  const user: UserRow = {
    id: row.id as string,
    email: row.email,
    nome: row.nome,
    cognome: row.cognome,
    password_hash: row.password_hash,
    ruolo: row.ruolo,
    attivo: row.attivo,
    mfa_enabled: row.mfa_enabled,
    mfa_secret_cifrato: row.mfa_secret_cifrato,
    mfa_last_counter: row.mfa_last_counter,
    must_change_password: row.must_change_password,
    failed_attempts: row.failed_attempts,
    locked_until: row.locked_until,
    last_login_at: row.last_login_at,
  };
  const session: SessionRow = {
    id: row.session_id,
    user_id: row.user_id,
    csrf_token: row.csrf_token,
    mfa_verified_at: row.mfa_verified_at,
    expires_at: row.expires_at,
    last_seen_at: row.last_seen_at,
  };
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await db.query("delete from sessions where id = $1", [session.id]);
    return null;
  }
  if (!user.attivo) return null;
  return { session, user };
}

/**
 * Middleware centralizzato: legge il cookie di sessione, verifica scadenza,
 * utente attivo, MFA completata e CSRF. Le route pubbliche sono solo quelle
 * montate prima di `authenticate`.
 */
export function authenticate() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ip = clientIp(req);
      req.ipHash = pseudoHash(ip);
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[SESSION_COOKIE];
      if (!token) return next();

      const found = await findSessionByToken(token);
      if (!found) return next();

      const mfaPending =
        found.user.mfa_enabled && !found.session.mfa_verified_at;
      if (mfaPending) {
        req.pendingSession = found.session;
        return next();
      }

      // CSRF per le richieste che modificano dati
      const method = req.method.toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const headerToken = req.get(CSRF_HEADER);
        if (
          !headerToken ||
          !timingSafeEqualString(headerToken, found.session.csrf_token)
        ) {
          throw new HttpError(
            403,
            "Token di sicurezza mancante o non valido. Ricarica la pagina.",
            {
              code: "csrf",
            },
          );
        }
        const origin = req.get("origin");
        if (origin && !sameOrigin(origin, req)) {
          throw new HttpError(403, "Origine della richiesta non consentita", {
            code: "origin",
          });
        }
      }

      req.auth = {
        user: found.user,
        session: found.session,
        ipHash: req.ipHash,
      };

      // aggiorna last_seen/expires senza scrivere a ogni richiesta
      const now = Date.now();
      if (
        now - new Date(found.session.last_seen_at).getTime() >
        5 * 60 * 1000
      ) {
        await getDb().query(
          `update sessions set last_seen_at = now(), expires_at = now() + ($2 || ' hours')::interval where id = $1`,
          [found.session.id, String(config.sessionTtlHours)],
        );
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function sameOrigin(origin: string, req: Request): boolean {
  try {
    const originUrl = new URL(origin);
    const host = req.get("host");
    if (host && originUrl.host === host) return true;
    const appUrl = new URL(config.appUrl);
    return originUrl.host === appUrl.host;
  } catch {
    return false;
  }
}

/** Richiede autenticazione completa (errore 401 altrimenti). */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    next(
      new HttpError(401, "Autenticazione richiesta", {
        code: "non_autenticato",
      }),
    );
    return;
  }
  next();
}

/** Ruolo amministratore: indicato esplicitamente, anche se la v1 ha un solo ruolo operativo. */
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.auth)
    return next(
      new HttpError(401, "Autenticazione richiesta", {
        code: "non_autenticato",
      }),
    );
  if (req.auth.user.ruolo !== "amministratore") {
    return next(
      new HttpError(403, "Operazione riservata all’amministratore", {
        code: "non_autorizzato",
      }),
    );
  }
  next();
}

export function requireRateLimit(
  limiter: {
    hit: (key: string) => { allowed: boolean; retryAfterSeconds: number };
  },
  scope: "ip" | "user" = "ip",
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key =
      scope === "user" && req.auth
        ? `u:${req.auth.user.id}:${req.path}`
        : `ip:${clientIp(req)}:${req.path}`;
    const result = limiter.hit(key);
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return next(
        new HttpError(
          429,
          "Troppe richieste. Attendi qualche minuto e riprova.",
          { code: "troppe_richieste" },
        ),
      );
    }
    next();
  };
}

export { limiters };

export function sessionIdForRequest(req: Request): string | null {
  return req.auth?.session.id ?? req.pendingSession?.id ?? null;
}
