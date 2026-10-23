import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError, qs } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBlock,
  Field,
  LoadingBlock,
  Modal,
  PageHeader,
  Pagination,
  Select,
  Table,
  TextArea,
  TextInput,
  stateLabel,
  useToast,
} from "../components/ui";
import { useCondominioOptions } from "./Condomini";
import type { Paginated, SegnalazioneDto } from "@shared/api-types";
import {
  SEGNALAZIONE_PRIORITA,
  SEGNALAZIONE_STATI,
  categoriaOptions,
  prioritaOptions,
  segnalazioneCategoriaLabels,
  segnalazionePrioritaLabels,
  segnalazioneStatoLabels,
} from "@shared/constants";
import { formatDate } from "@shared/format";

function NewSegnalazioneModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: condomini } = useCondominioOptions();
  const [values, setValues] = useState({
    condominioId: "",
    titolo: "",
    descrizione: "",
    categoria: "manutenzione",
    priorita: "media",
    dataApertura: "",
    scadenza: "",
    areaComune: "",
    referente: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    if (open) {
      setValues((v) => ({ ...v, condominioId: v.condominioId || condomini?.items[0]?.id || "" }));
      setError(null);
      setErrors({});
    }
  }, [open, condomini]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const created = await api<SegnalazioneDto>("/segnalazioni", {
        body: {
          condominioId: values.condominioId,
          titolo: values.titolo,
          descrizione: values.descrizione || null,
          categoria: values.categoria,
          priorita: values.priorita,
          dataApertura: values.dataApertura || null,
          scadenza: values.scadenza || null,
          areaComune: values.areaComune || null,
          referente: values.referente || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["segnalazioni"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      notify(`Segnalazione ${created.codice} aperta.`);
      setValues({ ...values, titolo: "", descrizione: "", scadenza: "", areaComune: "", referente: "" });
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setErrors(err.errors ?? {});
      } else setError("Creazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Nuova segnalazione"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy} disabled={!condomini?.items.length}>
            Apri segnalazione
          </Button>
        </>
      }
    >
      {condomini && condomini.items.length === 0 ? (
        <p className="muted">Prima di aprire una segnalazione serve almeno un condominio censito.</p>
      ) : (
        <form onSubmit={submit} noValidate>
          {error ? (
            <div className="alert alert--danger" role="alert">
              <div>{error}</div>
            </div>
          ) : null}
          <div className="form-grid">
            <div className="field--full">
              <Field label="Condominio" required error={errors.condominioId}>
                <Select value={values.condominioId} onChange={(e) => setValues({ ...values, condominioId: e.target.value })} required>
                  <option value="">Seleziona…</option>
                  {condomini?.items.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.denominazione} ({c.codice})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="field--full">
              <Field label="Titolo" required error={errors.titolo}>
                <TextInput value={values.titolo} onChange={(e) => setValues({ ...values, titolo: e.target.value })} required />
              </Field>
            </div>
            <div className="field--full">
              <Field label="Descrizione" error={errors.descrizione}>
                <TextArea value={values.descrizione} onChange={(e) => setValues({ ...values, descrizione: e.target.value })} rows={3} />
              </Field>
            </div>
            <Field label="Categoria">
              <Select value={values.categoria} onChange={(e) => setValues({ ...values, categoria: e.target.value })}>
                {categoriaOptions().map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priorità">
              <Select value={values.priorita} onChange={(e) => setValues({ ...values, priorita: e.target.value })}>
                {prioritaOptions().map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Data apertura">
              <TextInput type="date" value={values.dataApertura} onChange={(e) => setValues({ ...values, dataApertura: e.target.value })} />
            </Field>
            <Field label="Scadenza">
              <TextInput type="date" value={values.scadenza} onChange={(e) => setValues({ ...values, scadenza: e.target.value })} />
            </Field>
            <Field label="Area comune" hint="Se il problema non riguarda un’unità">
              <TextInput value={values.areaComune} onChange={(e) => setValues({ ...values, areaComune: e.target.value })} />
            </Field>
            <Field label="Referente segnalante">
              <TextInput value={values.referente} onChange={(e) => setValues({ ...values, referente: e.target.value })} />
            </Field>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function Segnalazioni() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [stato, setStato] = useState(searchParams.get("stato") ?? "");
  const [priorita, setPriorita] = useState("");
  const [condominioId, setCondominioId] = useState(searchParams.get("condominioId") ?? "");
  const [scadute, setScadute] = useState(searchParams.get("scadute") ?? "");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const perPage = 25;
  const { data: condomini } = useCondominioOptions();

  useEffect(() => setPage(1), [q, stato, priorita, condominioId, scadute]);

  const { data, isLoading, error, refetch } = useApiQuery<Paginated<SegnalazioneDto>>(
    ["segnalazioni", q, stato, priorita, condominioId, scadute, page],
    `/segnalazioni${qs({
      q: q || undefined,
      stato: stato || undefined,
      priorita: priorita || undefined,
      condominioId: condominioId || undefined,
      scadute: scadute || undefined,
      page,
      perPage,
    })}`,
  );

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Segnalazioni"
        subtitle="Apertura, assegnazione e chiusura con cronologia delle modifiche."
        actions={<Button onClick={() => setOpen(true)}>Nuova segnalazione</Button>}
      />

      <div className="filters">
        <Field label="Cerca">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titolo, codice, descrizione" />
        </Field>
        <Field label="Stato">
          <Select
            value={stato}
            onChange={(e) => {
              setStato(e.target.value);
              setParam("stato", e.target.value);
            }}
          >
            <option value="">Tutti</option>
            <option value="aperte">Solo aperte</option>
            {SEGNALAZIONE_STATI.map((s) => (
              <option key={s} value={s}>
                {segnalazioneStatoLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priorità">
          <Select value={priorita} onChange={(e) => setPriorita(e.target.value)}>
            <option value="">Tutte</option>
            {SEGNALAZIONE_PRIORITA.map((p) => (
              <option key={p} value={p}>
                {segnalazionePrioritaLabels[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Condominio">
          <Select
            value={condominioId}
            onChange={(e) => {
              setCondominioId(e.target.value);
              setParam("condominioId", e.target.value);
            }}
          >
            <option value="">Tutti</option>
            {condomini?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.denominazione}
              </option>
            ))}
          </Select>
        </Field>
        <label className="checkbox" style={{ marginBottom: "0.2rem" }}>
          <input
            type="checkbox"
            checked={scadute === "true"}
            onChange={(e) => {
              setScadute(e.target.checked ? "true" : "");
              setParam("scadute", e.target.checked ? "true" : "");
            }}
          />
          <span>Scadute</span>
        </label>
        <div className="filters__actions">
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              setStato("");
              setPriorita("");
              setCondominioId("");
              setScadute("");
              setSearchParams({}, { replace: true });
            }}
          >
            Azzera
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={() => void refetch()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="🛠"
          title="Nessuna segnalazione trovata"
          description="Registra una segnalazione per tracciare responsabilità, scadenze e chiusura."
          action={<Button onClick={() => setOpen(true)}>Nuova segnalazione</Button>}
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Table caption="Elenco segnalazioni">
            <thead>
              <tr>
                <th>Codice</th>
                <th>Segnalazione</th>
                <th>Condominio / unità</th>
                <th>Priorità</th>
                <th>Stato</th>
                <th>Apertura</th>
                <th>Scadenza</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s.id}>
                  <td className="muted nowrap">{s.codice}</td>
                  <td>
                    <Link to={`/segnalazioni/${s.id}`}>
                      <strong>{s.titolo}</strong>
                    </Link>
                    <div className="muted small">{stateLabel(segnalazioneCategoriaLabels, s.categoria)}</div>
                  </td>
                  <td>
                    <Link to={`/condomini/${s.condominioId}`}>{s.condominio}</Link>
                    {s.unita ? <div className="muted small">{s.unita}</div> : null}
                    {s.areaComune ? <div className="muted small">{s.areaComune}</div> : null}
                  </td>
                  <td>
                    <Badge value={s.priorita} label={stateLabel(segnalazionePrioritaLabels, s.priorita)} />
                  </td>
                  <td>
                    <Badge value={s.stato} label={stateLabel(segnalazioneStatoLabels, s.stato)} />
                  </td>
                  <td className="nowrap">{formatDate(s.dataApertura)}</td>
                  <td className="nowrap">
                    {s.scadenza ? (
                      <span className={s.scadenza < new Date().toISOString().slice(0, 10) && !["risolta", "chiusa"].includes(s.stato) ? "badge badge--danger" : ""}>
                        {formatDate(s.scadenza)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
        </>
      ) : null}

      <NewSegnalazioneModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

