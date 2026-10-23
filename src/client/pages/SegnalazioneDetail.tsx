import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  ErrorBlock,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  TextArea,
  TextInput,
  stateLabel,
  useToast,
} from "../components/ui";
import { DocumentsPanel } from "../components/DocumentsPanel";
import type { SegnalazioneDto, SegnalazioneStoricoItem } from "@shared/api-types";
import {
  SEGNALAZIONE_CATEGORIE,
  SEGNALAZIONE_PRIORITA,
  SEGNALAZIONE_STATI,
  segnalazioneCategoriaLabels,
  segnalazionePrioritaLabels,
  segnalazioneStatoLabels,
} from "@shared/constants";
import { formatDate, formatDateTime } from "@shared/format";

type Detail = SegnalazioneDto & { storico: SegnalazioneStoricoItem[]; documentiCount: number };

export function SegnalazioneDetail() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<Detail>(["segnalazioni", id], `/segnalazioni/${id}`);
  const [stato, setStato] = useState("");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ titolo: "", descrizione: "", categoria: "", priorita: "", scadenza: "", areaComune: "", referente: "" });
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["segnalazioni"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await refetch();
  };

  const cambiaStato = async (event: FormEvent) => {
    event.preventDefault();
    if (!stato) return;
    setBusy(true);
    try {
      await api(`/segnalazioni/${id}/stato`, { body: { stato, nota: nota || undefined } });
      notify("Stato aggiornato e registrato nella cronologia.");
      setStato("");
      setNota("");
      await refresh();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Cambio stato non riuscito.", "danger");
    } finally {
      setBusy(false);
    }
  };

  const apriModifica = () => {
    setForm({
      titolo: data.titolo,
      descrizione: data.descrizione ?? "",
      categoria: data.categoria,
      priorita: data.priorita,
      scadenza: data.scadenza ?? "",
      areaComune: data.areaComune ?? "",
      referente: data.referente ?? "",
    });
    setFormError(null);
    setEditOpen(true);
  };

  const salvaModifica = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await api(`/segnalazioni/${id}`, {
        method: "PATCH",
        body: {
          titolo: form.titolo,
          descrizione: form.descrizione || null,
          categoria: form.categoria,
          priorita: form.priorita,
          scadenza: form.scadenza || null,
          areaComune: form.areaComune || null,
          referente: form.referente || null,
        },
      });
      notify("Segnalazione aggiornata.");
      setEditOpen(false);
      await refresh();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const scaduta = data.scadenza && data.scadenza < new Date().toISOString().slice(0, 10) && !["risolta", "chiusa"].includes(data.stato);

  return (
    <>
      <PageHeader
        backTo="/segnalazioni"
        title={data.titolo}
        subtitle={
          <>
            <span className="muted">{data.codice}</span>
            <Badge value={data.stato} label={stateLabel(segnalazioneStatoLabels, data.stato)} />
            <Badge value={data.priorita} label={stateLabel(segnalazionePrioritaLabels, data.priorita)} />
            {scaduta ? <Badge tone="danger" label="Scaduta" /> : null}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={apriModifica}>
              Modifica
            </Button>
            <Link to={`/condomini/${data.condominioId}`} className="btn btn--secondary btn--md">
              Scheda condominio
            </Link>
          </>
        }
      />

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div>
          <Card title="Dettagli">
            <DescriptionList
              items={[
                { label: "Condominio", value: <Link to={`/condomini/${data.condominioId}`}>{data.condominio}</Link> },
                { label: "Unità", value: data.unita },
                { label: "Area comune", value: data.areaComune },
                { label: "Categoria", value: stateLabel(segnalazioneCategoriaLabels, data.categoria) },
                { label: "Apertura", value: formatDate(data.dataApertura) },
                { label: "Scadenza", value: formatDate(data.scadenza) },
                { label: "Fornitore assegnato", value: data.fornitore },
                { label: "Referente", value: data.referente },
                { label: "Chiusura", value: formatDate(data.dataChiusura) },
                { label: "Ultimo aggiornamento", value: formatDateTime(data.updatedAt) },
                {
                  label: "Descrizione",
                  value: data.descrizione ? <span style={{ whiteSpace: "pre-wrap" }}>{data.descrizione}</span> : null,
                  full: true,
                },
              ]}
            />
          </Card>

          <Card title="Documenti e foto" description="Allegati privati, accessibili solo dallo studio.">
            <DocumentsPanel entitaTipo="segnalazione" entitaId={data.id} condominioId={data.condominioId} />
          </Card>
        </div>

        <div>
          <Card title="Cambia stato" description="Ogni passaggio è registrato con autore e nota.">
            <form onSubmit={cambiaStato}>
              <Field label="Nuovo stato" required>
                <Select value={stato} onChange={(e) => setStato(e.target.value)} required>
                  <option value="">Seleziona…</option>
                  {SEGNALAZIONE_STATI.filter((s) => s !== data.stato).map((s) => (
                    <option key={s} value={s}>
                      {segnalazioneStatoLabels[s]}
                      {stato === s && ["risolta", "chiusa"].includes(s) ? " · chiude la segnalazione" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nota di aggiornamento">
                <TextArea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="Es. intervento assegnato all’idraulico" />
              </Field>
              <Button type="submit" loading={busy} disabled={!stato}>
                Aggiorna stato
              </Button>
            </form>
            <p className="muted small" style={{ marginTop: "0.7rem" }}>
              Lo stato può essere corretto in qualsiasi momento: il CRM conserva ogni passaggio invece di
              sovrascriverlo.
            </p>
          </Card>

          <Card title="Cronologia aggiornamenti">
            <ul className="timeline">
              {data.storico.map((item) => (
                <li key={item.id}>
                  <div className="timeline__title">
                    {item.daStato ? `${stateLabel(segnalazioneStatoLabels, item.daStato)} → ` : "Apertura → "}
                    {stateLabel(segnalazioneStatoLabels, item.aStato)}
                  </div>
                  <div className="timeline__meta">
                    {formatDateTime(item.createdAt)}
                    {item.utente ? ` · ${item.utente}` : ""}
                  </div>
                  {item.nota ? <div className="small">{item.nota}</div> : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        wide
        title="Modifica segnalazione"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void salvaModifica(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Salva
            </Button>
          </>
        }
      >
        <form onSubmit={salvaModifica} noValidate>
          {formError ? (
            <div className="alert alert--danger" role="alert">
              <div>{formError}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <div className="field--full">
              <Field label="Titolo" required>
                <TextInput value={form.titolo} onChange={(e) => setForm({ ...form, titolo: e.target.value })} required />
              </Field>
            </div>
            <div className="field--full">
              <Field label="Descrizione">
                <TextArea value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} rows={3} />
              </Field>
            </div>
            <Field label="Categoria">
              <Select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {SEGNALAZIONE_CATEGORIE.map((c) => (
                  <option key={c} value={c}>
                    {segnalazioneCategoriaLabels[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priorità">
              <Select value={form.priorita} onChange={(e) => setForm({ ...form, priorita: e.target.value })}>
                {SEGNALAZIONE_PRIORITA.map((p) => (
                  <option key={p} value={p}>
                    {segnalazionePrioritaLabels[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Scadenza">
              <TextInput type="date" value={form.scadenza} onChange={(e) => setForm({ ...form, scadenza: e.target.value })} />
            </Field>
            <Field label="Area comune">
              <TextInput value={form.areaComune} onChange={(e) => setForm({ ...form, areaComune: e.target.value })} />
            </Field>
            <Field label="Referente">
              <TextInput value={form.referente} onChange={(e) => setForm({ ...form, referente: e.target.value })} />
            </Field>
          </div>
          <p className="muted small">Per cambiare stato usa il pannello dedicato: così resta la cronologia.</p>
        </form>
      </Modal>
    </>
  );
}
