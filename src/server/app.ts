import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { authenticate, requireAuth } from "./auth.js";
import { HttpError } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { condominiRouter } from "./routes/condomini.js";
import { personeRouter } from "./routes/persone.js";
import { attivitaRouter } from "./routes/attivita.js";
import { segnalazioniRouter } from "./routes/segnalazioni.js";
import { assembleeRouter } from "./routes/assemblee.js";
import { rendicontiRouter } from "./routes/rendiconti.js";
import { consumiRouter } from "./routes/consumi.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { documentiRouter } from "./routes/documenti.js";
import { importRouter } from "./routes/import.js";
import { ricercaRouter } from "./routes/ricerca.js";
import { adminRouter } from "./routes/admin.js";

export type AppOptions = {
  publicDir?: string;
  serveStatic?: boolean;
};

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  // --- intestazioni di sicurezza -------------------------------------------
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), microphone=(), camera=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        // Vite in sviluppo usa eval per HMR; in produzione resta 'self'
        config.isProduction
          ? "script-src 'self'"
          : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "connect-src 'self'",
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
    if (config.isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }
    next();
  });

  // --- log applicativo minimo (nessun body, nessuna query) ------------------
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      if (config.isTest) return;
      const line = JSON.stringify({
        t: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
      });
      process.stdout.write(`${line}\n`);
    });
    next();
  });

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, versione: "1.0.0", demo: config.demoMode });
  });

  // autenticazione per tutte le API, pubbliche solo /api/auth/*
  app.use("/api", authenticate());

  app.use("/api/auth", authRouter);
  app.use("/api/condomini", requireAuth, condominiRouter);
  app.use("/api/persone", requireAuth, personeRouter);
  app.use("/api/attivita", requireAuth, attivitaRouter);
  app.use("/api/segnalazioni", requireAuth, segnalazioniRouter);
  app.use("/api/assemblee", requireAuth, assembleeRouter);
  app.use("/api/rendiconti", requireAuth, rendicontiRouter);
  app.use("/api/consumi", requireAuth, consumiRouter);
  app.use("/api/dashboard", requireAuth, dashboardRouter);
  app.use("/api/documenti", requireAuth, documentiRouter);
  app.use("/api/import", requireAuth, importRouter);
  app.use("/api/ricerca", requireAuth, ricercaRouter);
  app.use("/api/admin", requireAuth, adminRouter);

  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "Endpoint non trovato")),
  );

  // --- frontend statico (build di produzione) ------------------------------
  if (options.serveStatic !== false) {
    const publicDir =
      options.publicDir ?? path.resolve(process.cwd(), "dist/public");
    if (fs.existsSync(publicDir)) {
      app.use(
        express.static(publicDir, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith(".html"))
              res.setHeader("Cache-Control", "no-store");
            else
              res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable",
              );
          },
        }),
      );
      app.get(/^\/(?!api\/).*/, (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.sendFile(path.join(publicDir, "index.html"));
      });
    }
  }

  // --- gestione errori ------------------------------------------------------
  app.use(
    (error: unknown, req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof HttpError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
          ...(error.errors ? { errors: error.errors } : {}),
        });
        return;
      }
      // Multer / body parser
      const anyErr = error as {
        code?: string;
        message?: string;
        status?: number;
        type?: string;
      };
      if (anyErr?.code === "LIMIT_FILE_SIZE") {
        res
          .status(413)
          .json({ error: "File troppo grande", code: "file_troppo_grande" });
        return;
      }
      if (anyErr?.type === "entity.parse.failed") {
        res
          .status(400)
          .json({ error: "Richiesta non valida", code: "json_non_valido" });
        return;
      }
      // Log tecnico senza dati personali: solo tipo e stack troncato
      if (!config.isTest) {
        const detail =
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "errore sconosciuto";
        process.stderr.write(
          JSON.stringify({
            t: new Date().toISOString(),
            level: "error",
            method: req.method,
            path: req.path,
            status: 500,
            detail: detail.slice(0, 500),
          }) + "\n",
        );
      }
      res
        .status(500)
        .json({
          error: "Si è verificato un errore interno. Riprova più tardi.",
          code: "errore_interno",
        });
    },
  );

  return app;
}
