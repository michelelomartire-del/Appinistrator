import { Router } from "express";
import QRCode from "qrcode";
import { config } from "../config.js";
import { getDb, uuid, type Queryable } from "../db.js";
import { audit } from "../audit.js";
import {
  clearSessionCookies,
  createSession,
  findSessionByToken,
  limiters,
  requireAuth,
  requireRateLimit,
  SESSION_COOKIE,
  setSessionCookies,
  toSessionUser,
  type UserRow,
} from "../auth.js";
import { asyncHandler, HttpError, validate } from "../http.js";
import { clientIp } from "../rate-limit.js";
import {
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashPassword,
  passwordPolicyIssues,
  pseudoHash,
  sha256,
  totpUri,
  verifyPassword,
  verifyTotp,
} from "../security.js";
import {
  cambioPasswordSchema,
  loginSchema,
  mfaSchema,
} from "../../shared/schemas.js";
import type { SessionState } from "../../shared/api-types.js";

export const authRouter = Router();

const GENERIC_LOGIN_ERROR = "Email o password non corretti.";

/** Hash fittizio per mantenere tempi di risposta uniformi con utente inesistente. */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!dummyHashPromise)
    dummyHashPromise = hashPassword("effebi-timing-equalizer-value");
  return dummyHashPromise;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(
      part.slice(idx + 1).trim(),
    );
  }
  return out;
}

async function loadUserByEmail(
  db: Queryable,
  email: string,
): Promise<UserRow | null> {
  const rows = await db.query<UserRow>(
    "select * from users where lower(email) = lower($1)",
    [email],
  );
  return rows[0] ?? null;
}

async function recordLoginAttempt(
  db: Queryable,
  email: string,
  ip: string,
  esito: string,
): Promise<void> {
  await db.query(
    "insert into login_attempts (id, email_hash, ip_hash, esito) values ($1, $2, $3, $4)",
    [uuid(), pseudoHash(email), pseudoHash(ip), esito],
  );
}

function isLocked(user: UserRow): boolean {
  if (!user.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}

/* ------------------------------------------------------------------------- */
/* Stato sessione                                                            */
/* ------------------------------------------------------------------------- */

authRouter.get(
  "/session",
  asyncHandler(async (req, res) => {
    if (req.auth) {
      const state: SessionState = {
        authenticated: true,
        mfaRequired: false,
        user: toSessionUser(req.auth.user),
        demoMode: config.demoMode,
      };
      res.json(state);
      return;
    }
    if (req.pendingSession) {
      res.json({
        authenticated: false,
        mfaRequired: true,
        demoMode: config.demoMode,
      } satisfies SessionState);
      return;
    }
    res.json({
      authenticated: false,
      mfaRequired: false,
      demoMode: config.demoMode,
    } satisfies SessionState);
  }),
);

/* ------------------------------------------------------------------------- */
/* Login                                                                     */
/* ------------------------------------------------------------------------- */

authRouter.post(
  "/login",
  requireRateLimit(limiters.login),
  asyncHandler(async (req, res) => {
    const body = validate(loginSchema, req.body);
    const db = getDb();
    const ip = clientIp(req);
    const emailKey = `email:${pseudoHash(body.email)}`;
    const perEmail = limiters.login.hit(emailKey);
    if (!perEmail.allowed) {
      throw new HttpError(
        429,
        "Troppi tentativi per questo account. Riprova più tardi.",
        { code: "troppe_richieste" },
      );
    }

    const user = await loadUserByEmail(db, body.email);
    const hash = user?.password_hash ?? (await dummyHash());
    const passwordOk = await verifyPassword(body.password, hash);

    if (!user || !passwordOk) {
      if (user) {
        const failed = user.failed_attempts + 1;
        const lockUntil =
          failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await db.query(
          "update users set failed_attempts = $2, locked_until = $3, updated_at = now() where id = $1",
          [user.id, failed, lockUntil],
        );
        await recordLoginAttempt(db, user.email, ip, "password_errata");
      } else {
        await recordLoginAttempt(db, body.email, ip, "password_errata");
      }
      throw new HttpError(401, GENERIC_LOGIN_ERROR, {
        code: "credenziali_non_valide",
      });
    }

    if (!user.attivo) {
      await recordLoginAttempt(db, user.email, ip, "bloccato");
      throw new HttpError(
        403,
        "Account disattivato. Contatta l’amministratore.",
        { code: "account_disattivato" },
      );
    }
    if (isLocked(user)) {
      await recordLoginAttempt(db, user.email, ip, "bloccato");
      throw new HttpError(
        429,
        "Account temporaneamente bloccato per troppi tentativi.",
        { code: "account_bloccato" },
      );
    }

    await db.query(
      "update users set failed_attempts = 0, locked_until = null where id = $1",
      [user.id],
    );
    await recordLoginAttempt(db, user.email, ip, "successo");

    // sessione in attesa di MFA se attiva, altrimenti già valida
    const session = await createSession(db, user.id, {
      ip,
      userAgent: req.get("user-agent") ?? undefined,
      mfaVerified: !user.mfa_enabled,
    });
    if (!user.mfa_enabled) {
      await db.query("update users set last_login_at = now() where id = $1", [
        user.id,
      ]);
      await audit(db, {
        userId: user.id,
        attoreEmail: user.email,
        azione: "login",
        entitaTipo: "user",
        entitaId: user.id,
        descrizione: "Accesso riuscito",
        ipHash: req.ipHash,
      });
    }
    setSessionCookies(res, session.token, session.csrfToken);
    res.json({ mfaRequired: user.mfa_enabled, user: toSessionUser(user) });
  }),
);

/* ------------------------------------------------------------------------- */
/* Verifica MFA                                                              */
/* ------------------------------------------------------------------------- */

authRouter.post(
  "/mfa/verify",
  requireRateLimit(limiters.mfa),
  asyncHandler(async (req, res) => {
    const body = validate(mfaSchema, req.body);
    const db = getDb();
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (!token)
      throw new HttpError(401, "Sessione non valida", {
        code: "sessione_scaduta",
      });

    const found = await findSessionByToken(token, db);
    if (!found)
      throw new HttpError(401, "Sessione non valida o scaduta", {
        code: "sessione_scaduta",
      });
    if (found.session.mfa_verified_at) {
      res.json({ ok: true, user: toSessionUser(found.user) });
      return;
    }
    if (!found.user.mfa_enabled || !found.user.mfa_secret_cifrato) {
      throw new HttpError(400, "MFA non configurata per questo account", {
        code: "mfa_non_configurata",
      });
    }

    const secret = decryptSecret(found.user.mfa_secret_cifrato);
    const lastCounter =
      found.user.mfa_last_counter == null
        ? null
        : Number(found.user.mfa_last_counter);
    const result = verifyTotp(secret, body.code, { lastCounter });
    if (!result.ok) {
      await recordLoginAttempt(
        db,
        found.user.email,
        clientIp(req),
        "mfa_errata",
      );
      throw new HttpError(
        401,
        result.reason === "riutilizzato"
          ? "Codice già utilizzato: attendi il prossimo."
          : "Codice non valido.",
        { code: "mfa_non_valida" },
      );
    }

    await db.query(
      "update users set mfa_last_counter = $2, last_login_at = now(), failed_attempts = 0 where id = $1",
      [found.user.id, String(result.counter)],
    );
    await db.query(
      "update sessions set mfa_verified_at = now() where id = $1",
      [found.session.id],
    );
    await audit(db, {
      userId: found.user.id,
      attoreEmail: found.user.email,
      azione: "login_mfa",
      entitaTipo: "user",
      entitaId: found.user.id,
      descrizione: "Accesso completato con verifica MFA",
      ipHash: req.ipHash,
    });
    res.json({ ok: true, user: toSessionUser(found.user) });
  }),
);

/* ------------------------------------------------------------------------- */
/* Logout                                                                    */
/* ------------------------------------------------------------------------- */

authRouter.post(
  "/logout",
  requireRateLimit(limiters.search),
  asyncHandler(async (req, res) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    if (token) {
      const db = getDb();
      await db.query("delete from sessions where token_hash = $1", [
        sha256(token),
      ]);
    }
    if (req.auth) {
      await audit(getDb(), {
        userId: req.auth.user.id,
        attoreEmail: req.auth.user.email,
        azione: "logout",
        entitaTipo: "user",
        entitaId: req.auth.user.id,
        descrizione: "Disconnessione",
        ipHash: req.ipHash,
      });
    }
    clearSessionCookies(res);
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* Cambio password                                                           */
/* ------------------------------------------------------------------------- */

authRouter.post(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = validate(cambioPasswordSchema, req.body);
    const db = getDb();
    const user = req.auth!.user;
    const ok = await verifyPassword(body.passwordAttuale, user.password_hash);
    if (!ok)
      throw new HttpError(400, "La password attuale non è corretta", {
        code: "password_errata",
      });
    const issues = passwordPolicyIssues(body.nuovaPassword);
    if (issues.length) {
      throw new HttpError(400, "La nuova password non rispetta i requisiti", {
        code: "password_debole",
        errors: { nuovaPassword: `Serve: ${issues.join(", ")}` },
      });
    }
    if (await verifyPassword(body.nuovaPassword, user.password_hash)) {
      throw new HttpError(
        400,
        "La nuova password deve essere diversa da quella attuale",
        {
          code: "password_ripetuta",
          errors: { nuovaPassword: "Scegli una password diversa" },
        },
      );
    }
    const hash = await hashPassword(body.nuovaPassword);
    await db.query(
      "update users set password_hash = $2, must_change_password = false, updated_at = now() where id = $1",
      [user.id, hash],
    );
    // revoca le altre sessioni
    await db.query("delete from sessions where user_id = $1 and id <> $2", [
      user.id,
      req.auth!.session.id,
    ]);
    await audit(db, {
      userId: user.id,
      attoreEmail: user.email,
      azione: "password_cambiata",
      entitaTipo: "user",
      entitaId: user.id,
      descrizione: "Password aggiornata; altre sessioni revocate",
      ipHash: req.ipHash,
    });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* MFA: configurazione                                                       */
/* ------------------------------------------------------------------------- */

authRouter.post(
  "/mfa/setup",
  requireAuth,
  requireRateLimit(limiters.mfa, "user"),
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(400, "Conferma la password per configurare la MFA", {
        code: "password_errata",
        errors: { password: "Password non corretta" },
      });
    }
    const secret = generateTotpSecret();
    await getDb().query(
      "update users set mfa_secret_cifrato = $2, mfa_enabled = false, updated_at = now() where id = $1",
      [user.id, encryptSecret(secret)],
    );
    const uri = totpUri(secret, user.email);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
    res.json({ secret, uri, qr });
  }),
);

authRouter.post(
  "/mfa/enable",
  requireAuth,
  requireRateLimit(limiters.mfa, "user"),
  asyncHandler(async (req, res) => {
    const body = validate(mfaSchema, req.body);
    const db = getDb();
    const user = req.auth!.user;
    if (!user.mfa_secret_cifrato) {
      throw new HttpError(400, "Avvia prima la configurazione MFA", {
        code: "mfa_non_configurata",
      });
    }
    const secret = decryptSecret(user.mfa_secret_cifrato);
    const result = verifyTotp(secret, body.code);
    if (!result.ok)
      throw new HttpError(400, "Codice non valido, riprova", {
        code: "mfa_non_valida",
      });
    await db.query(
      `update users set mfa_enabled = true, mfa_confirmed_at = now(), mfa_last_counter = $2, updated_at = now() where id = $1`,
      [user.id, String(result.counter)],
    );
    await audit(db, {
      userId: user.id,
      attoreEmail: user.email,
      azione: "mfa_attivata",
      entitaTipo: "user",
      entitaId: user.id,
      descrizione: "Autenticazione a due fattori attivata",
      ipHash: req.ipHash,
    });
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/mfa/disable",
  requireAuth,
  requireRateLimit(limiters.mfa, "user"),
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!(await verifyPassword(password, user.password_hash))) {
      throw new HttpError(400, "Password non corretta", {
        code: "password_errata",
      });
    }
    if (!user.mfa_secret_cifrato)
      throw new HttpError(400, "MFA non configurata", {
        code: "mfa_non_configurata",
      });
    const secret = decryptSecret(user.mfa_secret_cifrato);
    const result = verifyTotp(secret, code);
    if (!result.ok)
      throw new HttpError(400, "Codice non valido", { code: "mfa_non_valida" });
    const db = getDb();
    await db.query(
      "update users set mfa_enabled = false, mfa_secret_cifrato = null, mfa_last_counter = null, updated_at = now() where id = $1",
      [user.id],
    );
    await audit(db, {
      userId: user.id,
      attoreEmail: user.email,
      azione: "mfa_disattivata",
      entitaTipo: "user",
      entitaId: user.id,
      descrizione: "Autenticazione a due fattori disattivata",
      ipHash: req.ipHash,
    });
    res.json({ ok: true });
  }),
);

/* ------------------------------------------------------------------------- */
/* Profilo                                                                   */
/* ------------------------------------------------------------------------- */

authRouter.get(
  "/profilo",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { user } = req.auth!;
    res.json({
      user: toSessionUser(user),
      lastLoginAt: user.last_login_at,
      mfaConfirmedAt: null,
    });
  }),
);

authRouter.get(
  "/sessioni",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await getDb().query<{
      id: string;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
      user_agent: string | null;
    }>(
      `select id, created_at, last_seen_at, expires_at, user_agent from sessions
        where user_id = $1 and expires_at > now() order by last_seen_at desc`,
      [req.auth!.user.id],
    );
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        corrente: r.id === req.auth!.session.id,
        createdAt: r.created_at,
        lastSeenAt: r.last_seen_at,
        expiresAt: r.expires_at,
        userAgent: r.user_agent,
      })),
    });
  }),
);
