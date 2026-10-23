import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
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
  stateLabel,
  useToast,
} from "../components/ui";
import { PersonaPicker } from "../components/PersonaPicker";
import { DocumentsPanel } from "../components/DocumentsPanel";
import type { AssembleaDto } from "@shared/api-types";
import {
  ASSEMBLEA_ESITI,
  ASSEMBLEA_MODALITA,
  ASSEMBLEA_STATI,
  ASSEMBLEA_TIPI,
  assembleaEsitoLabels,
  assembleaModalitaLabels,
  assembleaStatoLabels,
  assembleaTipoLabels,
} from "@shared/constants";
import { formatDate, formatMillesimi } from "@shared/format";

export function AssembleaDetail() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<AssembleaDto>(["assemblee", id], `/assemblee/${id}`);

  const [puntoOpen, setPuntoOpen] = useState(false);
  const [punto, setPunto] = useState({ titolo: "", descrizione: "", delibera: "", esito: "" });
  const [deliberaFor, setDeliberaFor] = useState<{ id: string; titolo: string; delibera: string; esito: string } | null>(null);
  const [partecipanteOpen, setPartecipanteOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<{ id: string; label: string } | null>(null);
  const [esterno, setEsterno] = useState("");
  const [presente, setPresente] = useState(true);
  const [delegante, setDelegante] = useState("");
  const [millesimi, setMillesimi] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ stato: "", quorumRegistrato: "", luogo: "" });
  const [busy, setBusy] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({ stato: data.stato, quorumRegistrato: data.quorumRegistrato?.toString() ?? "", luogo: data.luogo ?? "" });
  }, [data]);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["assemblee"] });
    await refetch();
  };

  const addPunto = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorModal(null);
    try {
      await api(`/assemblee/${id}/punti`, {
        body: {
          titolo: punto.titolo,
          descrizione: punto.descrizione || null,
          delibera: punto.delibera || null,
          esito: punto.esito || null,
        },
      });
      notify("Punto aggiunto all’ordine del giorno.");
      setPunto({ titolo: "", descrizione: "", delibera: "", esito: "" });
      setPuntoOpen(false);
      await refresh();
    } catch (err) {
      setErrorModal(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const saveDelibera = async (event: FormEvent) => {
    event.preventDefault();
    if (!deliberaFor) return;
    setBusy(true);
    try {
      await api(`/assemblee/${id}/punti/${deliberaFor.id}`, {
        method: "PATCH",
        body: { delibera: deliberaFor.delibera || null, esito: deliberaFor.esito || null },
      });
      notify("Delibera aggiornata.");
      setDeliberaFor(null);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const addPartecipante = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorModal(null);
    try {
      await api(`/assemblee/${id}/partecipanti`, {
        body: {
          personaId: selectedPersona?.id ?? null,
          nomeEsterno: selectedPersona ? null : esterno || null,
          presente,
          delegante: delegante || null,
          millesimi: millesimi || null,
        },
      });
      notify("Partecipante aggiunto.");
      setPartecipanteOpen(false);
      setSelectedPersona(null);
      setEsterno("");
      setDelegante("");
      setMillesimi("");
      setPresente(true);
      await refresh();
    } catch (err) {
      setErrorModal(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const togglePresente = async (partecipanteId: string, value: boolean) => {
    try {
      await api(`/assemblee/${id}/partecipanti/${partecipanteId}`, { method: "PATCH", body: { presente: !value } });
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  const removePartecipante = async (partecipanteId: string) => {
    try {
      await api(`/assemblee/${id}/partecipanti/${partecipanteId}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  const removePunto = async (puntoId: string) => {
    try {
      await api(`/assemblee/${id}/punti/${puntoId}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  const salvaTestata = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/assemblee/${id}`, {
        method: "PATCH",
        body: {
          stato: form.stato,
          quorumRegistrato: form.quorumRegistrato || null,
          luogo: form.luogo || null,
        },
      });
      notify("Assemblea aggiornata.");
      setEditOpen(false);
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        backTo="/assemblee"
        title={`Assemblea ${formatDate(data.data)}${data.ora ? ` · ${data.ora}` : ""}`}
        subtitle={
          <>
            <Link to={`/condomini/${data.condominioId}`}>{data.condominio}</Link>
            <Badge value={data.stato} label={stateLabel(assembleaStatoLabels, data.stato)} />
            <span>
              {stateLabel(assembleaTipoLabels, data.tipo)} · {stateLabel(assembleaModalitaLabels, data.modalita)}
            </span>
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            Modifica assemblea
          </Button>
        }
      />

      <Banner tone="info" title="Maggioranze e quorum">
        Il CRM registra presenze, deleghe e un eventuale valore di quorum fornito dallo studio. Non calcola
        maggioranze né fornisce indicazioni legali: le regole vanno definite e verificate separatamente.
      </Banner>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Card title="Dati assemblea">
          <DescriptionList
            items={[
              { label: "Data", value: formatDate(data.data) },
              { label: "Ora", value: data.ora },
              { label: "Luogo", value: data.luogo },
              { label: "Modalità", value: stateLabel(assembleaModalitaLabels, data.modalita) },
              { label: "Quorum registrato", value: data.quorumRegistrato === null ? "Non registrato" : formatMillesimi(data.quorumRegistrato) },
              {
                label: "Millesimi presenti (registrati)",
                value:
                  data.millesimiPresenti === null
                    ? "Nessun partecipante registrato"
                    : formatMillesimi(data.millesimiPresenti),
              },
              {
                label: "Millesimi totali condominio",
                value:
                  data.millesimiTotaliCondominio === null
                    ? "Non disponibili: mancano millesimi sulle unità"
                    : formatMillesimi(data.millesimiTotaliCondominio),
              },
              { label: "Note", value: data.note, full: true },
            ]}
          />
        </Card>

        <Card
          title="Partecipanti e deleghe"
          actions={
            <Button size="sm" onClick={() => setPartecipanteOpen(true)}>
              Aggiungi
            </Button>
          }
        >
          {data.partecipanti.length === 0 ? (
            <EmptyState icon="👥" title="Nessun partecipante" description="Registra presenze, deleghe e millesimi forniti." />
          ) : (
            <Table caption="Partecipanti">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Presente</th>
                  <th>Delegante</th>
                  <th className="right">Millesimi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.partecipanti.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome ?? "—"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.presente}
                        onChange={() => void togglePresente(p.id, p.presente)}
                        aria-label={`Presenza di ${p.nome ?? "partecipante"}`}
                      />
                    </td>
                    <td>{p.delegante ?? "—"}</td>
                    <td className="right">{p.millesimi === null ? "—" : formatMillesimi(p.millesimi)}</td>
                    <td className="right">
                      <Button variant="ghost" size="sm" onClick={() => void removePartecipante(p.id)}>
                        Rimuovi
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card
        title="Ordine del giorno"
        description="Ogni punto può avere esito e delibera registrati."
        actions={
          <Button size="sm" onClick={() => setPuntoOpen(true)}>
            Aggiungi punto
          </Button>
        }
      >
        {data.punti.length === 0 ? (
          <EmptyState icon="📋" title="Ordine del giorno vuoto" description="Aggiungi i punti da discutere." />
        ) : (
          <ol className="stack" style={{ paddingLeft: "1.2rem" }}>
            {data.punti.map((puntoItem) => (
              <li key={puntoItem.id}>
                <div className="row row--between" style={{ alignItems: "flex-start" }}>
                  <div>
                    <strong>{puntoItem.titolo}</strong>
                    {puntoItem.esito ? (
                      <div style={{ marginTop: "0.2rem" }}>
                        <Badge
                          value={puntoItem.esito}
                          label={stateLabel(assembleaEsitoLabels, puntoItem.esito)}
                          tone={
                            puntoItem.esito === "approvato"
                              ? "success"
                              : puntoItem.esito === "respinto"
                                ? "danger"
                                : "neutral"
                          }
                        />
                      </div>
                    ) : null}
                    {puntoItem.descrizione ? <p className="small">{puntoItem.descrizione}</p> : null}
                    {puntoItem.delibera ? (
                      <p className="small" style={{ whiteSpace: "pre-wrap", background: "var(--c-surface-alt)", padding: "0.5rem", borderRadius: 6 }}>
                        <strong>Delibera:</strong> {puntoItem.delibera}
                      </p>
                    ) : null}
                  </div>
                  <div className="row" style={{ gap: "0.25rem" }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDeliberaFor({
                          id: puntoItem.id,
                          titolo: puntoItem.titolo,
                          delibera: puntoItem.delibera ?? "",
                          esito: puntoItem.esito ?? "",
                        })
                      }
                    >
                      Esito / delibera
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void removePunto(puntoItem.id)}>
                      Elimina
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Verbale e allegati" description="Il verbale firmato e gli allegati restano nell’archivio privato.">
        <DocumentsPanel entitaTipo="assemblea" entitaId={data.id} condominioId={data.condominioId} />
      </Card>

      {/* Modale nuovo punto */}
      <Modal
        open={puntoOpen}
        onClose={() => setPuntoOpen(false)}
        title="Nuovo punto all’ordine del giorno"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPuntoOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void addPunto(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Aggiungi
            </Button>
          </>
        }
      >
        <form onSubmit={addPunto} noValidate>
          {errorModal ? (
            <div className="alert alert--danger" role="alert">
              <div>{errorModal}</div>
            </div>
          ) : null}
          <Field label="Titolo" required>
            <TextInput value={punto.titolo} onChange={(e) => setPunto({ ...punto, titolo: e.target.value })} required />
          </Field>
          <Field label="Descrizione">
            <TextArea value={punto.descrizione} onChange={(e) => setPunto({ ...punto, descrizione: e.target.value })} rows={2} />
          </Field>
          <Field label="Esito">
            <Select value={punto.esito} onChange={(e) => setPunto({ ...punto, esito: e.target.value })}>
              <option value="">Non definito</option>
              {ASSEMBLEA_ESITI.map((e) => (
                <option key={e} value={e}>
                  {assembleaEsitoLabels[e]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Delibera">
            <TextArea value={punto.delibera} onChange={(e) => setPunto({ ...punto, delibera: e.target.value })} rows={2} />
          </Field>
        </form>
      </Modal>

      {/* Modale esito/delibera */}
      <Modal
        open={Boolean(deliberaFor)}
        onClose={() => setDeliberaFor(null)}
        title="Esito e delibera"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeliberaFor(null)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void saveDelibera(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Salva
            </Button>
          </>
        }
      >
        <form onSubmit={saveDelibera}>
          <p className="muted small">{deliberaFor?.titolo}</p>
          <Field label="Esito">
            <Select
              value={deliberaFor?.esito ?? ""}
              onChange={(e) => setDeliberaFor((current) => (current ? { ...current, esito: e.target.value } : current))}
            >
              <option value="">Non definito</option>
              {ASSEMBLEA_ESITI.map((e) => (
                <option key={e} value={e}>
                  {assembleaEsitoLabels[e]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Testo della delibera">
            <TextArea
              value={deliberaFor?.delibera ?? ""}
              onChange={(e) => setDeliberaFor((current) => (current ? { ...current, delibera: e.target.value } : current))}
              rows={3}
            />
          </Field>
        </form>
      </Modal>

      {/* Modale partecipante */}
      <Modal
        open={partecipanteOpen}
        onClose={() => setPartecipanteOpen(false)}
        title="Aggiungi partecipante"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPartecipanteOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void addPartecipante(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Aggiungi
            </Button>
          </>
        }
      >
        <form onSubmit={addPartecipante} noValidate>
          <Field label="Persona in anagrafica" hint="Scegli una persona esistente oppure inserisci un nome esterno.">
            <PersonaPicker selected={selectedPersona} onSelect={setSelectedPersona} />
          </Field>
          {!selectedPersona ? (
            <Field label="Nome esterno">
              <TextInput value={esterno} onChange={(e) => setEsterno(e.target.value)} placeholder="Es. Sig. Bianchi (delegato)" />
            </Field>
          ) : null}
          <Checkbox label="Presente in assemblea" checked={presente} onChange={(e) => setPresente(e.target.checked)} />
          <div className="form-grid">
            <Field label="Delegante">
              <TextInput value={delegante} onChange={(e) => setDelegante(e.target.value)} />
            </Field>
            <Field label="Millesimi" hint="Se forniti dal verbale">
              <TextInput inputMode="decimal" value={millesimi} onChange={(e) => setMillesimi(e.target.value)} />
            </Field>
          </div>
        </form>
      </Modal>

      {/* Modale modifica testata */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifica assemblea"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void salvaTestata(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Salva
            </Button>
          </>
        }
      >
        <form onSubmit={salvaTestata}>
          <div className="form-grid">
            <Field label="Stato">
              <Select value={form.stato} onChange={(e) => setForm({ ...form, stato: e.target.value })}>
                {ASSEMBLEA_STATI.map((s) => (
                  <option key={s} value={s}>
                    {assembleaStatoLabels[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Luogo">
              <TextInput value={form.luogo} onChange={(e) => setForm({ ...form, luogo: e.target.value })} />
            </Field>
            <Field label="Quorum registrato" hint="Valore numerico fornito dallo studio, non calcolato dal CRM">
              <TextInput
                inputMode="decimal"
                value={form.quorumRegistrato}
                onChange={(e) => setForm({ ...form, quorumRegistrato: e.target.value })}
              />
            </Field>
          </div>
          <p className="muted small">
            Tipo e modalità: {stateLabel(assembleaTipoLabels, data.tipo)} ·{" "}
            {stateLabel(assembleaModalitaLabels, data.modalita)}
          </p>
        </form>
      </Modal>
    </>
  );
}
