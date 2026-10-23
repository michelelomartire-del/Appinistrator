import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorBlock,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  Table,
  TextArea,
  TextInput,
  Tabs,
  stateLabel,
  useToast,
} from "../components/ui";
import { PersonaPicker } from "../components/PersonaPicker";
import { DocumentsPanel } from "../components/DocumentsPanel";
import { CondominioFormModal } from "./Condomini";
import type { CondominioDetail as CondominioDetailType } from "@shared/api-types";
import {
  ATTIVITA_PRIORITA,
  ATTIVITA_TIPI,
  RUOLI_PERSONA_CONDOMINIO,
  TITOLI_UNITA,
  attivitaPrioritaLabels,
  attivitaTipoLabels,
  condominioStatoLabels,
  ruoloPersonaCondominioLabels,
  titoloUnitaLabels,
} from "@shared/constants";
import { formatDate, formatDateTime, formatMillesimi } from "@shared/format";

type TabKey = "anagrafica" | "persone" | "unita" | "attivita" | "documenti";

export function CondominioDetail() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [tab, setTab] = useState<TabKey>("anagrafica");
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error, refetch } = useApiQuery<CondominioDetailType>(["condomini", id], `/condomini/${id}`);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["condomini"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await api(`/condomini/${id}/archivia`, { body: { archiviato: !data.archiviato } });
      notify(data.archiviato ? "Condominio ripristinato." : "Condominio archiviato.");
      await refresh();
      setArchiveOpen(false);
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "anagrafica", label: "Anagrafica" },
    { key: "persone", label: "Persone e contatti", count: data.relazioni.length },
    { key: "unita", label: "Unità", count: data.unita.length },
    { key: "attivita", label: "Cronologia e attività", count: data.attivita.length },
    { key: "documenti", label: "Documenti" },
  ];

  return (
    <>
      <PageHeader
        backTo="/condomini"
        title={data.denominazione}
        subtitle={
          <>
            <span className="muted">{data.codice}</span>
            <Badge value={data.stato} label={stateLabel(condominioStatoLabels, data.stato)} />
            {data.archiviato ? <Badge tone="neutral" label="Archiviato" /> : null}
            {data.comune ? <span>{data.comune}</span> : null}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Modifica
            </Button>
            <Button variant={data.archiviato ? "secondary" : "ghost"} onClick={() => setArchiveOpen(true)}>
              {data.archiviato ? "Ripristina" : "Archivia"}
            </Button>
            <Link to={`/segnalazioni?condominioId=${data.id}`} className="btn btn--secondary btn--md">
              Segnalazioni
            </Link>
          </>
        }
      />

      {data.unita.length > 0 && data.millesimiTotali === null ? (
        <Banner tone="warning" title="Millesimi incompleti">
          Alcune unità non hanno millesimi registrati: il totale dei millesimi non è calcolabile. Il CRM non stima i
          valori mancanti.
        </Banner>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Sezioni condominio">
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
            {item.count !== undefined ? <span className="tabs__count">{item.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === "anagrafica" ? (
        <Card title="Dati del condominio">
          <DescriptionList
            items={[
              { label: "Codice interno", value: data.codice },
              { label: "Denominazione", value: data.denominazione },
              { label: "Indirizzo", value: data.indirizzo },
              {
                label: "Comune",
                value: [data.cap, data.comune, data.provincia ? `(${data.provincia})` : null].filter(Boolean).join(" ") || null,
              },
              { label: "Codice fiscale", value: data.codiceFiscale },
              { label: "Stato rapporto", value: stateLabel(condominioStatoLabels, data.stato) },
              { label: "Inizio incarico", value: formatDate(data.dataInizioIncarico) },
              { label: "Fine incarico", value: formatDate(data.dataFineIncarico) },
              { label: "Unità registrate", value: data.unita.length },
              { label: "Persone collegate", value: data.relazioni.length },
              {
                label: "Totale millesimi",
                value: data.millesimiTotali === null ? "Non calcolabile (dati incompleti)" : formatMillesimi(data.millesimiTotali),
              },
              { label: "Ultimo aggiornamento", value: formatDateTime(data.updatedAt) },
              { label: "Note", value: data.note ? <span style={{ whiteSpace: "pre-wrap" }}>{data.note}</span> : null, full: true },
            ]}
          />
        </Card>
      ) : null}

      {tab === "persone" ? (
        <PersoneTab condominioId={data.id} relazioni={data.relazioni} onChanged={refresh} />
      ) : null}

      {tab === "unita" ? <UnitaTab condominio={data} onChanged={refresh} /> : null}

      {tab === "attivita" ? <AttivitaTab condominioId={data.id} attivita={data.attivita} onChanged={refresh} /> : null}

      {tab === "documenti" ? <DocumentsPanel entitaTipo="condominio" entitaId={data.id} condominioId={data.id} /> : null}

      <CondominioFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        condominioId={data.id}
        initial={{
          denominazione: data.denominazione,
          indirizzo: data.indirizzo ?? "",
          cap: data.cap ?? "",
          comune: data.comune ?? "",
          provincia: data.provincia ?? "",
          codiceFiscale: data.codiceFiscale ?? "",
          stato: data.stato,
          dataInizioIncarico: data.dataInizioIncarico ?? "",
          dataFineIncarico: data.dataFineIncarico ?? "",
          note: data.note ?? "",
        }}
        onSaved={() => void refresh()}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={data.archiviato ? "Ripristinare il condominio?" : "Archiviare il condominio?"}
        message={
          data.archiviato
            ? "Il condominio tornerà visibile negli elenchi attivi. I dati collegati restano invariati."
            : "Il condominio sarà nascosto dagli elenchi attivi ma non eliminato: persone, unità e storico restano disponibili nell’archivio."
        }
        confirmLabel={data.archiviato ? "Ripristina" : "Archivia"}
        danger={!data.archiviato}
        loading={busy}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => void toggleArchive()}
      />
    </>
  );
}

/* ------------------------------ Persone tab ------------------------------- */

function PersoneTab({
  condominioId,
  relazioni,
  onChanged,
}: {
  condominioId: string;
  relazioni: CondominioDetailType["relazioni"];
  onChanged: () => Promise<void>;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"esistente" | "nuova">("esistente");
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const [persona, setPersona] = useState({ nome: "", cognome: "", email: "", telefono: "", codiceFiscale: "" });
  const [ruolo, setRuolo] = useState<string>("condomino");
  const [qualifica, setQualifica] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ruolo, qualifica: qualifica || undefined };
      if (mode === "esistente") {
        if (!selected) {
          setError("Seleziona una persona esistente oppure creane una nuova.");
          setBusy(false);
          return;
        }
        body.personaId = selected.id;
      } else {
        body.nuovaPersona = {
          nome: persona.nome,
          cognome: persona.cognome,
          email: persona.email || null,
          telefono: persona.telefono || null,
          codiceFiscale: persona.codiceFiscale || null,
        };
      }
      await api(`/condomini/${condominioId}/persone`, { body });
      notify("Persona collegata al condominio.");
      setOpen(false);
      setSelected(null);
      setPersona({ nome: "", cognome: "", email: "", telefono: "", codiceFiscale: "" });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Collegamento non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/condomini/${condominioId}/persone/${toDelete}`, { method: "DELETE" });
      notify("Relazione rimossa.");
      setToDelete(null);
      await onChanged();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        title="Persone e contatti"
        description="Una persona può essere collegata a più condomìni e unità con ruoli diversi."
        actions={<Button onClick={() => setOpen(true)}>Collega persona</Button>}
      >
        {relazioni.length === 0 ? (
          <EmptyState
            icon="👤"
            title="Nessuna persona collegata"
            description="Collega consiglieri, condòmini o referenti. Cerca prima l’anagrafica esistente per non creare doppioni."
          />
        ) : (
          <Table caption="Persone collegate al condominio">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Ruolo</th>
                <th>Qualifica</th>
                <th>Recapiti</th>
                <th>Periodo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {relazioni.map((relazione) => (
                <tr key={relazione.id}>
                  <td>
                    <Link to={`/persone/${relazione.persona.id}`}>
                      <strong>
                        {relazione.persona.cognome} {relazione.persona.nome}
                      </strong>
                    </Link>
                    {relazione.persona.codiceFiscale ? (
                      <div className="muted small">{relazione.persona.codiceFiscale}</div>
                    ) : null}
                  </td>
                  <td>{stateLabel(ruoloPersonaCondominioLabels, relazione.ruolo)}</td>
                  <td>{relazione.qualifica ?? "—"}</td>
                  <td>
                    {relazione.persona.email ?? "—"}
                    {relazione.persona.telefono ? <div className="muted small">{relazione.persona.telefono}</div> : null}
                  </td>
                  <td className="nowrap">
                    {formatDate(relazione.dataInizio) ?? "—"}
                    {relazione.dataFine ? ` → ${formatDate(relazione.dataFine)}` : ""}
                  </td>
                  <td className="right">
                    <Button variant="ghost" size="sm" onClick={() => setToDelete(relazione.id)}>
                      Rimuovi
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Collega una persona"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Collega
            </Button>
          </>
        }
      >
        <form onSubmit={submit} noValidate>
          {error ? (
            <div className="alert alert--danger" role="alert">
              <div>{error}</div>
            </div>
          ) : null}
          <div className="row" style={{ marginBottom: "0.8rem" }}>
            <label className="checkbox" style={{ marginBottom: 0 }}>
              <input type="radio" checked={mode === "esistente"} onChange={() => setMode("esistente")} />
              <span>Persona già in anagrafica</span>
            </label>
            <label className="checkbox" style={{ marginBottom: 0 }}>
              <input type="radio" checked={mode === "nuova"} onChange={() => setMode("nuova")} />
              <span>Nuova persona</span>
            </label>
          </div>
          {mode === "esistente" ? (
            <Field label="Cerca persona" hint="Per evitare duplicati cerca per cognome, email o codice fiscale.">
              <PersonaPicker selected={selected} onSelect={setSelected} />
            </Field>
          ) : (
            <div className="form-grid">
              <Field label="Nome" required>
                <TextInput value={persona.nome} onChange={(e) => setPersona({ ...persona, nome: e.target.value })} />
              </Field>
              <Field label="Cognome" required>
                <TextInput value={persona.cognome} onChange={(e) => setPersona({ ...persona, cognome: e.target.value })} />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={persona.email} onChange={(e) => setPersona({ ...persona, email: e.target.value })} />
              </Field>
              <Field label="Telefono">
                <TextInput value={persona.telefono} onChange={(e) => setPersona({ ...persona, telefono: e.target.value })} />
              </Field>
              <Field label="Codice fiscale">
                <TextInput
                  value={persona.codiceFiscale}
                  onChange={(e) => setPersona({ ...persona, codiceFiscale: e.target.value.toUpperCase() })}
                />
              </Field>
            </div>
          )}
          <div className="form-grid">
            <Field label="Ruolo nel condominio" required>
              <Select value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
                {RUOLI_PERSONA_CONDOMINIO.map((r) => (
                  <option key={r} value={r}>
                    {ruoloPersonaCondominioLabels[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qualifica / note">
              <TextInput value={qualifica} onChange={(e) => setQualifica(e.target.value)} />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Rimuovere il collegamento?"
        message="La persona resta in anagrafica; viene rimossa solo la relazione con questo condominio."
        confirmLabel="Rimuovi"
        danger
        loading={busy}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}

/* -------------------------------- Unità tab -------------------------------- */

function UnitaTab({ condominio, onChanged }: { condominio: CondominioDetailType; onChanged: () => Promise<void> }) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [unita, setUnita] = useState({ identificativo: "", piano: "", categoria: "", millesimi: "", millesimiRiscaldamento: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [personaFor, setPersonaFor] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<{ id: string; label: string } | null>(null);
  const [titolo, setTitolo] = useState("proprietario");
  const [toDelete, setToDelete] = useState<string | null>(null);

  const submitUnita = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api(`/condomini/${condominio.id}/unita`, {
        body: {
          identificativo: unita.identificativo,
          piano: unita.piano || null,
          categoria: unita.categoria || null,
          millesimi: unita.millesimi || null,
          millesimiRiscaldamento: unita.millesimiRiscaldamento || null,
          note: unita.note || null,
        },
      });
      notify("Unità creata.");
      setOpen(false);
      setUnita({ identificativo: "", piano: "", categoria: "", millesimi: "", millesimiRiscaldamento: "", note: "" });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const linkPersona = async () => {
    if (!personaFor || !selectedPersona) return;
    setBusy(true);
    try {
      await api(`/condomini/${condominio.id}/unita/${personaFor}/persone`, {
        body: { personaId: selectedPersona.id, titolo },
      });
      notify("Persona collegata all’unità.");
      setPersonaFor(null);
      setSelectedPersona(null);
      await onChanged();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const archiveUnita = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/condomini/${condominio.id}/unita/${toDelete}`, { method: "DELETE" });
      notify("Unità archiviata.");
      setToDelete(null);
      await onChanged();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const totale = condominio.unita.reduce((acc, u) => acc + (u.millesimi ?? 0), 0);
  const mancanti = condominio.unita.filter((u) => u.millesimi === null).length;

  return (
    <>
      <Card
        title="Unità immobiliari"
        description={
          mancanti > 0
            ? `${mancanti} unità senza millesimi. Totale parziale registrato: ${formatMillesimi(totale)}.`
            : `Totale millesimi registrati: ${formatMillesimi(totale)}.`
        }
        actions={<Button onClick={() => setOpen(true)}>Nuova unità</Button>}
      >
        {condominio.unita.length === 0 ? (
          <EmptyState icon="🏠" title="Nessuna unità registrata" description="Registra le unità per collegare persone, rate e millesimi." />
        ) : (
          <Table caption="Unità immobiliari">
            <thead>
              <tr>
                <th>Unità</th>
                <th>Piano</th>
                <th className="right">Millesimi</th>
                <th>Persone</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {condominio.unita.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.identificativo}</strong>
                    {u.categoria ? <div className="muted small">{u.categoria}</div> : null}
                  </td>
                  <td>{u.piano ?? "—"}</td>
                  <td className="right">{u.millesimi === null ? <span className="muted">non registrati</span> : formatMillesimi(u.millesimi)}</td>
                  <td>
                    {u.persone.length === 0 ? (
                      <span className="muted small">Nessuna persona collegata</span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                        {u.persone.map((p) => (
                          <li key={p.id}>
                            {p.persona.cognome} {p.persona.nome} — {stateLabel(titoloUnitaLabels, p.titolo)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="right nowrap">
                    <Button variant="ghost" size="sm" onClick={() => setPersonaFor(u.id)}>
                      Collega persona
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setToDelete(u.id)}>
                      Archivia
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuova unità"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void submitUnita(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Crea unità
            </Button>
          </>
        }
      >
        <form onSubmit={submitUnita} noValidate>
          {error ? (
            <div className="alert alert--danger" role="alert">
              <div>{error}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="Identificativo" required hint="Es. Int. 1, Scala B – Piano 2">
              <TextInput value={unita.identificativo} onChange={(e) => setUnita({ ...unita, identificativo: e.target.value })} />
            </Field>
            <Field label="Piano">
              <TextInput value={unita.piano} onChange={(e) => setUnita({ ...unita, piano: e.target.value })} />
            </Field>
            <Field label="Categoria">
              <TextInput value={unita.categoria} onChange={(e) => setUnita({ ...unita, categoria: e.target.value })} />
            </Field>
            <Field label="Millesimi" hint="Solo se forniti dal condominio">
              <TextInput
                inputMode="decimal"
                value={unita.millesimi}
                onChange={(e) => setUnita({ ...unita, millesimi: e.target.value })}
              />
            </Field>
            <Field label="Millesimi riscaldamento">
              <TextInput
                inputMode="decimal"
                value={unita.millesimiRiscaldamento}
                onChange={(e) => setUnita({ ...unita, millesimiRiscaldamento: e.target.value })}
              />
            </Field>
            <Field label="Note">
              <TextInput value={unita.note} onChange={(e) => setUnita({ ...unita, note: e.target.value })} />
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(personaFor)}
        onClose={() => setPersonaFor(null)}
        title="Collega persona all’unità"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPersonaFor(null)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void linkPersona()} loading={busy} disabled={!selectedPersona}>
              Collega
            </Button>
          </>
        }
      >
        <Field label="Persona" required>
          <PersonaPicker selected={selectedPersona} onSelect={setSelectedPersona} />
        </Field>
        <Field label="Titolo">
          <Select value={titolo} onChange={(e) => setTitolo(e.target.value)}>
            {TITOLI_UNITA.map((t) => (
              <option key={t} value={t}>
                {titoloUnitaLabels[t]}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Archiviare l’unità?"
        message="L’unità non sarà più proposta negli elenchi, ma lo storico di rate e relazioni resta conservato."
        confirmLabel="Archivia"
        danger
        loading={busy}
        onClose={() => setToDelete(null)}
        onConfirm={() => void archiveUnita()}
      />
    </>
  );
}

/* ------------------------------- Attività tab ------------------------------ */

function AttivitaTab({
  condominioId,
  attivita,
  onChanged,
}: {
  condominioId: string;
  attivita: CondominioDetailType["attivita"];
  onChanged: () => Promise<void>;
}) {
  const { notify } = useToast();
  const [form, setForm] = useState({ tipo: "telefonata", titolo: "", descrizione: "", data: "", scadenza: "", priorita: "normale" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/attivita", {
        body: {
          condominioId,
          tipo: form.tipo,
          titolo: form.titolo,
          descrizione: form.descrizione || null,
          data: form.data || null,
          scadenza: form.scadenza || null,
          priorita: form.priorita,
        },
      });
      notify("Attività registrata.");
      setForm({ tipo: "telefonata", titolo: "", descrizione: "", data: "", scadenza: "", priorita: "normale" });
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (attivitaId: string, completata: boolean) => {
    try {
      await api(`/attivita/${attivitaId}`, { method: "PATCH", body: { completata: !completata } });
      await onChanged();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/attivita/${toDelete}`, { method: "DELETE" });
      setToDelete(null);
      await onChanged();
      notify("Attività eliminata.");
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <Card title="Nuova attività o promemoria">
        <form onSubmit={submit} noValidate>
          {error ? (
            <div className="alert alert--danger" role="alert">
              <div>{error}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <Field label="Tipo">
              <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {ATTIVITA_TIPI.map((t) => (
                  <option key={t} value={t}>
                    {attivitaTipoLabels[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priorità">
              <Select value={form.priorita} onChange={(e) => setForm({ ...form, priorita: e.target.value })}>
                {ATTIVITA_PRIORITA.map((p) => (
                  <option key={p} value={p}>
                    {attivitaPrioritaLabels[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="field--full">
              <Field label="Titolo" required>
                <TextInput value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} required />
              </Field>
            </div>
            <div className="field--full">
              <Field label="Descrizione">
                <TextArea value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} rows={2} />
              </Field>
            </div>
            <Field label="Data">
              <TextInput type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </Field>
            <Field label="Scadenza / promemoria">
              <TextInput type="date" value={form.scadenza} onChange={(e) => setForm({ ...form, scadenza: e.target.value })} />
            </Field>
          </div>
          <div className="form-actions">
            <Button type="submit" loading={busy}>
              Registra
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Cronologia contatti">
        {attivita.length === 0 ? (
          <EmptyState icon="🗒" title="Nessuna attività registrata" description="Telefonate, incontri e promemoria compariranno qui." />
        ) : (
          <ul className="timeline">
            {attivita.map((item) => (
              <li key={item.id}>
                <div className="timeline__title">
                  {item.titolo} {item.completata ? <Badge tone="success" label="Completata" /> : null}
                </div>
                <div className="timeline__meta">
                  {stateLabel(attivitaTipoLabels, item.tipo)} · {formatDate(item.data)}
                  {item.scadenza ? ` · scadenza ${formatDate(item.scadenza)}` : ""} · {stateLabel(attivitaPrioritaLabels, item.priorita)}
                </div>
                {item.descrizione ? <p className="small">{item.descrizione}</p> : null}
                <div className="row" style={{ gap: "0.25rem" }}>
                  <Button variant="ghost" size="sm" onClick={() => void toggle(item.id, item.completata)}>
                    {item.completata ? "Segna da fare" : "Segna completata"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setToDelete(item.id)}>
                    Elimina
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminare l’attività?"
        message="L’operazione viene registrata nell’audit log."
        confirmLabel="Elimina"
        danger
        loading={busy}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
