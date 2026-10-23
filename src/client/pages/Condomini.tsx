import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useApiQuery } from "../lib/hooks";
import { api, ApiRequestError, qs } from "../lib/api";
import {
  Badge,
  Button,
  Card,
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
import type { CondominioListItem, Paginated } from "@shared/api-types";
import { CONDOMINIO_STATI, condominioStatoLabels } from "@shared/constants";
import { formatDate } from "@shared/format";

type CondominioFormValues = {
  denominazione: string;
  indirizzo: string;
  cap: string;
  comune: string;
  provincia: string;
  codiceFiscale: string;
  stato: string;
  dataInizioIncarico: string;
  dataFineIncarico: string;
  note: string;
};

const emptyForm: CondominioFormValues = {
  denominazione: "",
  indirizzo: "",
  cap: "",
  comune: "",
  provincia: "",
  codiceFiscale: "",
  stato: "attivo",
  dataInizioIncarico: "",
  dataFineIncarico: "",
  note: "",
};

export function useCondominioOptions() {
  return useApiQuery<{ items: Array<{ id: string; codice: string; denominazione: string; comune: string | null; stato: string }> }>(
    ["condomini", "options"],
    "/condomini/options",
    { staleTime: 60_000 },
  );
}

export function CondominioFormModal({
  open,
  onClose,
  initial,
  condominioId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<CondominioFormValues>;
  condominioId?: string;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState<CondominioFormValues>({ ...emptyForm, ...initial });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    if (open) {
      setValues({ ...emptyForm, ...initial });
      setErrors({});
      setError(null);
    }
  }, [open, initial]);

  const set = (key: keyof CondominioFormValues) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const payload = {
        ...values,
        cap: values.cap || null,
        provincia: values.provincia || null,
        dataInizioIncarico: values.dataInizioIncarico || null,
        dataFineIncarico: values.dataFineIncarico || null,
        note: values.note || null,
        indirizzo: values.indirizzo || null,
        comune: values.comune || null,
        codiceFiscale: values.codiceFiscale || null,
      };
      if (condominioId) {
        await api(`/condomini/${condominioId}`, { method: "PATCH", body: payload });
        notify("Condominio aggiornato.");
      } else {
        await api("/condomini", { body: payload });
        notify("Condominio creato.");
      }
      await queryClient.invalidateQueries({ queryKey: ["condomini"] });
      onSaved?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setErrors(err.errors ?? {});
      } else {
        setError("Salvataggio non riuscito.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={condominioId ? "Modifica condominio" : "Nuovo condominio"}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy}>
            {condominioId ? "Salva modifiche" : "Crea condominio"}
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
        <div className="form-grid">
          <div className="field--full">
            <Field label="Denominazione" required error={errors.denominazione}>
              <TextInput value={values.denominazione} onChange={(e) => set("denominazione")(e.target.value)} required />
            </Field>
          </div>
          <div className="field--full">
            <Field label="Indirizzo" error={errors.indirizzo}>
              <TextInput value={values.indirizzo} onChange={(e) => set("indirizzo")(e.target.value)} />
            </Field>
          </div>
          <Field label="CAP" error={errors.cap} hint="5 cifre">
            <TextInput value={values.cap} onChange={(e) => set("cap")(e.target.value)} inputMode="numeric" maxLength={5} />
          </Field>
          <Field label="Comune" error={errors.comune}>
            <TextInput value={values.comune} onChange={(e) => set("comune")(e.target.value)} />
          </Field>
          <Field label="Provincia" error={errors.provincia} hint="Sigla, es. BO">
            <TextInput
              value={values.provincia}
              onChange={(e) => set("provincia")(e.target.value.toUpperCase())}
              maxLength={2}
            />
          </Field>
          <Field label="Codice fiscale" error={errors.codiceFiscale}>
            <TextInput value={values.codiceFiscale} onChange={(e) => set("codiceFiscale")(e.target.value.toUpperCase())} />
          </Field>
          <Field label="Stato del rapporto" error={errors.stato}>
            <Select value={values.stato} onChange={(e) => set("stato")(e.target.value)}>
              {CONDOMINIO_STATI.map((stato) => (
                <option key={stato} value={stato}>
                  {condominioStatoLabels[stato]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data inizio incarico" error={errors.dataInizioIncarico}>
            <TextInput
              type="date"
              value={values.dataInizioIncarico}
              onChange={(e) => set("dataInizioIncarico")(e.target.value)}
            />
          </Field>
          <Field label="Data fine incarico" error={errors.dataFineIncarico}>
            <TextInput type="date" value={values.dataFineIncarico} onChange={(e) => set("dataFineIncarico")(e.target.value)} />
          </Field>
          <div className="field--full">
            <Field label="Note interne" error={errors.note}>
              <TextArea value={values.note} onChange={(e) => set("note")(e.target.value)} rows={3} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function Condomini() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [stato, setStato] = useState(searchParams.get("stato") ?? "");
  const [archiviato, setArchiviato] = useState<"false" | "true" | "tutti">("false");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const perPage = 25;

  useEffect(() => {
    setPage(1);
  }, [q, stato, archiviato]);

  const path = `/condomini${qs({ q: q || undefined, stato: stato || undefined, archiviato, page, perPage })}`;
  const { data, isLoading, error, refetch } = useApiQuery<Paginated<CondominioListItem>>(
    ["condomini", q, stato, archiviato, page],
    path,
  );

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Condomìni"
        subtitle="Il condominio è il cliente principale: persone e unità sono collegate a lui."
        actions={
          <>
            <Link to="/import" className="btn btn--secondary btn--md">
              Importa da file
            </Link>
            <Button onClick={() => setFormOpen(true)}>Nuovo condominio</Button>
          </>
        }
      />

      <div className="filters">
        <Field label="Cerca" htmlFor="filtro-q" >
          <TextInput
            id="filtro-q"
            placeholder="Denominazione, codice, comune, indirizzo"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              updateParam("q", e.target.value);
            }}
          />
        </Field>
        <Field label="Stato">
          <Select
            value={stato}
            onChange={(e) => {
              setStato(e.target.value);
              updateParam("stato", e.target.value);
            }}
          >
            <option value="">Tutti</option>
            {CONDOMINIO_STATI.map((s) => (
              <option key={s} value={s}>
                {condominioStatoLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Archivio">
          <Select value={archiviato} onChange={(e) => setArchiviato(e.target.value as typeof archiviato)}>
            <option value="false">Solo attivi</option>
            <option value="true">Solo archiviati</option>
            <option value="tutti">Tutti</option>
          </Select>
        </Field>
        <div className="filters__actions">
          <Button
            variant="ghost"
            onClick={() => {
              setQ("");
              setStato("");
              setArchiviato("false");
              setSearchParams({}, { replace: true });
            }}
          >
            Azzera filtri
          </Button>
        </div>
      </div>

      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={() => void refetch()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="🏢"
          title={q || stato ? "Nessun condominio trovato" : "Nessun condominio censito"}
          description={
            q || stato
              ? "Prova a modificare i filtri di ricerca."
              : "Censisci il primo condominio oppure importa l’elenco da CSV/XLSX dopo aver verificato l’anteprima."
          }
          action={<Button onClick={() => setFormOpen(true)}>Nuovo condominio</Button>}
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Table caption="Elenco condomìni">
            <thead>
              <tr>
                <th>Codice</th>
                <th>Denominazione</th>
                <th>Comune</th>
                <th>Stato</th>
                <th className="right">Unità</th>
                <th className="right">Persone</th>
                <th className="right">Segnalazioni aperte</th>
                <th>Prossima assemblea</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((condominio) => (
                <tr key={condominio.id}>
                  <td className="nowrap muted">{condominio.codice}</td>
                  <td>
                    <Link to={`/condomini/${condominio.id}`}>
                      <strong>{condominio.denominazione}</strong>
                    </Link>
                    {condominio.indirizzo ? <div className="muted small">{condominio.indirizzo}</div> : null}
                    {condominio.archiviato ? <Badge tone="neutral" label="Archiviato" /> : null}
                  </td>
                  <td>{condominio.comune ?? "—"}</td>
                  <td>
                    <Badge value={condominio.stato} label={stateLabel(condominioStatoLabels, condominio.stato)} />
                  </td>
                  <td className="right">{condominio.unitaCount}</td>
                  <td className="right">{condominio.personeCount}</td>
                  <td className="right">{condominio.segnalazioniAperte}</td>
                  <td className="nowrap">{formatDate(condominio.prossimaAssemblea) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
        </>
      ) : null}

      <CondominioFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </>
  );
}
