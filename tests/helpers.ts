import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/server/app.js";
import { createDb, migrate, setDb, uuid, type Db } from "../src/server/db.js";
import { hashPassword, currentTotpCounter, totpCode } from "../src/server/security.js";

export type TestContext = { db: Db; app: Express };

export async function createTestContext(): Promise<TestContext> {
  const db = createDb({ memory: true });
  await migrate(db);
  setDb(db);
  const app = createApp({ serveStatic: false });
  return { db, app };
}

export async function closeTestContext(ctx: TestContext): Promise<void> {
  await ctx.db.close();
}

export async function createUser(
  db: Db,
  options: { email?: string; password?: string; mfa?: boolean; mustChangePassword?: boolean } = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = options.email ?? `admin-${uuid().slice(0, 8)}@example.invalid`;
  const password = options.password ?? "Password-Test-2026!";
  const id = uuid();
  await db.query(
    `insert into users (id, email, nome, cognome, password_hash, ruolo, must_change_password)
     values ($1,$2,'Test','Admin',$3,'amministratore',$4)`,
    [id, email, await hashPassword(password), options.mustChangePassword ?? false],
  );
  return { id, email, password };
}

function extractCsrf(response: request.Response): string {
  const cookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
  const raw = cookies.find((cookie) => cookie.startsWith("effebi_crm_csrf="));
  if (!raw) throw new Error("Cookie CSRF assente nella risposta di login");
  return decodeURIComponent(raw.split("=")[1]!.split(";")[0]!);
}

export type LoggedIn = {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
  email: string;
  password: string;
};

export async function login(
  app: Express,
  credentials: { email: string; password: string },
): Promise<LoggedIn> {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send(credentials);
  if (response.status !== 200) {
    throw new Error(`Login fallito: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const userId = response.body.user?.id as string;
  return { agent, csrf: extractCsrf(response), userId, ...credentials };
}

/** Helper per POST/PATCH/DELETE con token CSRF. */
export function send(
  session: Pick<LoggedIn, "agent" | "csrf">,
  method: "post" | "patch" | "delete",
  path: string,
  body: unknown = {},
) {
  return session.agent[method](path).set("x-csrf-token", session.csrf).send(body as object);
}

export { request, currentTotpCounter, totpCode };
