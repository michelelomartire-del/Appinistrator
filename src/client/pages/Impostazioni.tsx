import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorBlock,
  Field,
  LoadingBlock,
  PageHeader,
  Pagination,
  Table,
  TextInput,
  useToast,
} from "../components/ui";
import { ChangePassword } from "./ChangePassword";
import type { AuditLogItem, Paginated } from "@shared/api-types";
import { formatDateTime } from "@shared/format";

type Tab = "sicurezza" | "sessioni" | "audit" | "sistema";

type StatoSistema = {
  database: string;
  migrazioniApplicate: string[];
  documentiStorage: string;
  versione: string;
  conteggi: Record<string, number>;
};

export function Impostazioni() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("sicurezza");

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "sicurezza", label: "Sicurezza" },
    { key: "sessioni", label: "Sessioni" },
    { key: "audit", label: "Audit log" },
    { key: "sistema", label: "Sistema" },
  ];

  return (
    <>
      <PageHeader
        title="Impostazioni"
        subtitle={`Account ${user?.email ?? ""} · ruolo ${user?.ruolo ?? ""}`}
      />

      <div className="tabs" role="tablist" aria-label="Sezioni impostazioni">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`tabs__item ${tab === item.key ? "is-active" : ""}`}
            onClick={() => setTab(item.key)}
            style={{ background: "none", border: "none", borderBottom: "2px solid transparent", cursor: "pointer" }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "sicurezza" ? <SicurezzaTab /> : null}
      {tab === "sessioni" ? <SessioniTab /> : null}
      {tab === "audit" ? <AuditTab /> : null}
      {tab === "sistema" ? <SistemaTab /> : null}
    </>
  );
}

function SicurezzaTab() {
  const { user, refresh } = useAuth();
  const { notify } = useToast();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ secret: string; uri: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableForm, setDisableForm] = useState({ password: "", code: "" });

  const startSetup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ secret: string; uri: string; qr: string }>("/auth/mfa/setup", { body: { password } });
      setSetup(data);
      setPassword("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Configurazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  const enable = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/mfa/enable", { body: { code } });
      notify("MFA attivata. Al prossimo accesso sarà richiesto il codice.");
      setSetup(null);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Codice non valido.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/mfa/disable", { body: disableForm });
      notify("MFA disattivata.");
      setDisableOpen(false);
      setDisableForm({ password: "", code: "" });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <Card title="Autenticazione a due fattori (MFA)">
        {user?.mfaEnabled ? (
          <>
            <Badge tone="success" label="MFA attiva" />
            <p className="small" style={{ marginTop: "0.6rem" }}>
              L’accesso richiede password e codice temporaneo. Se perdi il dispositivo, il recupero si esegue solo dalla
              macchina server con <code>npm run admin:reset-mfa</code>.
            </p>
            {!disableOpen ? (
              <Button variant="secondary" onClick={() => setDisableOpen(true)}>
                Disattiva MFA
              </Button>
            ) : (
              <form onSubmit={disable}>
                <Field label="Password attuale">
                  <TextInput
                    type="password"
                    value={disableForm.password}
                    onChange={(e) => setDisableForm({ ...disableForm, password: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Codice MFA attuale">
                  <TextInput
                    inputMode="numeric"
                    maxLength={6}
                    value={disableForm.code}
                    onChange={(e) => setDisableForm({ ...disableForm, code: e.target.value.replace(/\D/g, "") })}
                    required
                  />
                </Field>
                {error ? <p className="field__error">{error}</p> : null}
                <div className="row">
                  <Button type="submit" variant="danger" loading={busy}>
                    Conferma disattivazione
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setDisableOpen(false)}>
                    Annulla
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : (
          <>
            <Badge tone="warning" label="MFA non attiva" />
            <p className="small" style={{ marginTop: "0.6rem" }}>
              Consigliata per l’account amministratore. Il segreto TOTP è cifrato a riposo e non viene mai mostrato
              dopo la configurazione.
            </p>
            {!setup ? (
              <form onSubmit={startSetup}>
                <Field label="Conferma con la password" hint="Richiesta per avviare la configurazione">
                  <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Field>
                {error ? <p className="field__error">{error}</p> : null}
                <Button type="submit" loading={busy}>
                  Configura MFA
                </Button>
              </form>
            ) : (
              <form onSubmit={enable}>
                <p className="small">1. Inquadra il QR con l’app di autenticazione.</p>
                <img src={setup.qr} alt="Codice QR per configurare l’autenticazione a due fattori" width={200} height={200} />
                <p className="small muted">
                  Oppure inserisci manualmente il segreto: <code>{setup.secret}</code>
                </p>
                <p className="small">2. Inserisci il codice a 6 cifre generato dall’app.</p>
                <Field label="Codice di verifica">
                  <TextInput
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </Field>
                {error ? <p className="field__error">{error}</p> : null}
                <div className="row">
                  <Button type="submit" loading={busy}>
                    Attiva MFA
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                    Annulla
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </Card>

      <Card title="Password" description="Almeno 12 caratteri, con maiuscole, minuscole e numeri. Cambiarla revoca le altre sessioni.">
        <ChangePassword />
      </Card>
    </div>
  );
}

function SessioniTab() {
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useApiQuery<{
    items: Array<{ id: string; corrente: boolean; createdAt: string; lastSeenAt: string; expiresAt: string; userAgent: string | null }>;
  }>(["sessioni"], "/auth/sessioni");

  const revoke = async (id: string) => {
    try {
      await api(`/admin/sessioni/${id}/revoca`, { body: {} });
      notify("Sessione revocata.");
      await queryClient.invalidateQueries({ queryKey: ["sessioni"] });
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  return (
    <Card title="Sessioni attive" description="Dispositivi collegati al tuo account. Revoca quelle che non riconosci.">
      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error.message} /> : null}
      {data && data.items.length === 0 ? <EmptyState icon="🔐" title="Nessuna sessione attiva" /> : null}
      {data && data.items.length > 0 ? (
        <Table caption="Sessioni attive">
          <thead>
            <tr>
              <th>Dispositivo</th>
              <th>Inizio</th>
              <th>Ultimo accesso</th>
              <th>Scadenza</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((sessione) => (
              <tr key={sessione.id}>
                <td>
                  {sessione.userAgent ?? "Dispositivo sconosciuto"}
                  {sessione.corrente ? (
                    <div>
                      <Badge tone="info" label="Sessione corrente" />
                    </div>
                  ) : null}
                </td>
                <td className="nowrap">{formatDateTime(sessione.createdAt)}</td>
                <td className="nowrap">{formatDateTime(sessione.lastSeenAt)}</td>
                <td className="nowrap">{formatDateTime(sessione.expiresAt)}</td>
                <td className="right">
                  {!sessione.corrente ? (
                    <Button variant="ghost" size="sm" onClick={() => void revoke(sessione.id)}>
                      Revoca
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Card>
  );
}

function AuditTab() {
  const [entitaTipo, setEntitaTipo] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 25;
  const { data, isLoading, error, refetch } = useApiQuery<Paginated<AuditLogItem>>(
    ["audit", entitaTipo, page],
    `/admin/audit?page=${page}&perPage=${perPage}${entitaTipo ? `&entitaTipo=${encodeURIComponent(entitaTipo)}` : ""}`,
  );

  useEffect(() => setPage(1), [entitaTipo]);

  return (
    <>
      <Banner tone="info" title="Cosa contiene l’audit log">
        Modifiche rilevanti a condomìni, persone, segnalazioni, assemblee, rendiconti, consumi, documenti, accessi e
        importazioni. Non contiene contenuti dei file né valori personali estesi.
      </Banner>
      <Card
        title="Audit log"
        actions={
          <TextInput
            placeholder="Filtra per entità (es. condominio)"
            value={entitaTipo}
            onChange={(e) => setEntitaTipo(e.target.value)}
            style={{ width: 220 }}
          />
        }
      >
        {isLoading ? <LoadingBlock /> : null}
        {error ? <ErrorBlock message={error.message} onRetry={() => void refetch()} /> : null}
        {data && data.items.length === 0 ? <EmptyState icon="🧾" title="Nessuna voce" description="Le modifiche compariranno qui." /> : null}
        {data && data.items.length > 0 ? (
          <>
            <Table caption="Audit log">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Azione</th>
                  <th>Entità</th>
                  <th>Descrizione</th>
                  <th>Attore</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="nowrap">{formatDateTime(item.createdAt)}</td>
                    <td>{item.azione}</td>
                    <td>{item.entitaTipo}</td>
                    <td>{item.descrizione}</td>
                    <td className="muted small">{item.attoreEmail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
          </>
        ) : null}
      </Card>
    </>
  );
}

function SistemaTab() {
  const { data, isLoading, error } = useApiQuery<StatoSistema>(["sistema"], "/admin/stato");

  return (
    <>
      <Card title="Stato del sistema">
        {isLoading ? <LoadingBlock /> : null}
        {error ? <ErrorBlock message={error.message} /> : null}
        {data ? (
          <>
            <div className="import-summary">
              <div className="import-stat">
                Database<strong>{data.database === "postgres" ? "PostgreSQL" : "PGlite (sviluppo)"}</strong>
              </div>
              <div className="import-stat">
                Archivio documenti<strong>{data.documentiStorage}</strong>
              </div>
              <div className="import-stat">
                Versione<strong>{data.versione}</strong>
              </div>
            </div>
            <p className="small muted">Migrazioni applicate: {data.migrazioniApplicate.join(", ") || "nessuna"}</p>
            <div className="grid-3" style={{ marginTop: "0.8rem" }}>
              {Object.entries(data.conteggi).map(([key, value]) => (
                <div className="import-stat" key={key}>
                  {key.replaceAll("_", " ")}
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Card>

      <Card title="Backup e ripristino" description="Procedura documentata in docs/INSTALLAZIONE.md e docs/BACKUP.md.">
        <ul className="small" style={{ paddingLeft: "1.1rem" }}>
          <li>Backup database giornaliero con retention concordata, cifrato e in regione UE.</li>
          <li>Backup dell’archivio documenti separato, con verifica periodica di ripristino.</li>
          <li>In caso di ripristino: fermare l’app, ripristinare database e storage, riavviare e verificare l’audit log.</li>
          <li>I dati demo non vanno mai ripristinati in produzione.</li>
        </ul>
      </Card>
    </>
  );
}
