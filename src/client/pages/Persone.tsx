import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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
  useToast,
} from "../components/ui";
import type { Paginated, PersonaDto } from "@shared/api-types";

type PersonaRow = PersonaDto & { condominiCount: number; unitaCount: number };

export function PersonaFormModal({
  open,
  onClose,
  personaId,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  personaId?: string;
  initial?: Partial<PersonaDto>;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState({ nome: "", cognome: "", codiceFiscale: "", email: "", telefono: "", note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => {
    if (!open) return;
    setValues({
      nome: initial?.nome ?? "",
      cognome: initial?.cognome ?? "",
      codiceFiscale: initial?.codiceFiscale ?? "",
      email: initial?.email ?? "",
      telefono: initial?.telefono ?? "",
      note: initial?.note ?? "",
    });
    setErrors({});
    setError(null);
  }, [open, initial]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const body = {
        nome: values.nome,
        cognome: values.cognome,
        codiceFiscale: values.codiceFiscale || null,
        email: values.email || null,
        telefono: values.telefono || null,
        note: values.note || null,
      };
      if (personaId) {
        await api(`/persone/${personaId}`, { method: "PATCH", body });
        notify("Persona aggiornata.");
      } else {
        await api("/persone", { body });
        notify("Persona creata.");
      }
      await queryClient.invalidateQueries({ queryKey: ["persone"] });
      onSaved?.();
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setErrors(err.errors ?? {});
      } else setError("Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={personaId ? "Modifica persona" : "Nuova persona"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy}>
            Salva
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
          <Field label="Nome" required error={errors.nome}>
            <TextInput value={values.nome} onChange={(e) => setValues({ ...values, nome: e.target.value })} required />
          </Field>
          <Field label="Cognome" required error={errors.cognome}>
            <TextInput value={values.cognome} onChange={(e) => setValues({ ...values, cognome: e.target.value })} required />
          </Field>
          <Field label="Codice fiscale" error={errors.codiceFiscale}>
            <TextInput
              value={values.codiceFiscale}
              onChange={(e) => setValues({ ...values, codiceFiscale: e.target.value.toUpperCase() })}
            />
          </Field>
          <Field label="Email" error={errors.email} hint="Non è un identificativo univoco">
            <TextInput type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} />
          </Field>
          <Field label="Telefono" error={errors.telefono}>
            <TextInput value={values.telefono} onChange={(e) => setValues({ ...values, telefono: e.target.value })} />
          </Field>
          <div className="field--full">
            <Field label="Note" error={errors.note}>
              <TextArea value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function Persone() {
  const [q, setQ] = useState("");
  const [archiviato, setArchiviato] = useState<"false" | "true" | "tutti">("false");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const perPage = 25;

  useEffect(() => setPage(1), [q, archiviato]);

  const { data, isLoading, error, refetch } = useApiQuery<Paginated<PersonaRow>>(
    ["persone", q, archiviato, page],
    `/persone${qs({ q: q || undefined, archiviato, page, perPage })}`,
  );

  return (
    <>
      <PageHeader
        title="Persone e contatti"
        subtitle="Anagrafica unica: una persona può avere più relazioni con condomìni e unità."
        actions={<Button onClick={() => setOpen(true)}>Nuova persona</Button>}
      />

      <div className="filters">
        <Field label="Cerca">
          <TextInput
            placeholder="Nome, cognome, email, codice fiscale"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Field label="Archivio">
          <Select value={archiviato} onChange={(e) => setArchiviato(e.target.value as typeof archiviato)}>
            <option value="false">Solo attive</option>
            <option value="true">Solo archiviate</option>
            <option value="tutti">Tutte</option>
          </Select>
        </Field>
      </div>

      {isLoading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error.message} onRetry={() => void refetch()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="👥"
          title={q ? "Nessuna persona trovata" : "Nessuna persona in anagrafica"}
          description="Le persone si collegano ai condomìni come consiglieri, condòmini, referenti o fornitori."
          action={<Button onClick={() => setOpen(true)}>Nuova persona</Button>}
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Table caption="Elenco persone">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Recapiti</th>
                <th className="right">Condomìni</th>
                <th className="right">Unità</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((persona) => (
                <tr key={persona.id}>
                  <td>
                    <Link to={`/persone/${persona.id}`}>
                      <strong>
                        {persona.cognome} {persona.nome}
                      </strong>
                    </Link>
                    {persona.codiceFiscale ? <div className="muted small">{persona.codiceFiscale}</div> : null}
                  </td>
                  <td>
                    {persona.email ?? "—"}
                    {persona.telefono ? <div className="muted small">{persona.telefono}</div> : null}
                  </td>
                  <td className="right">{persona.condominiCount}</td>
                  <td className="right">{persona.unitaCount}</td>
                  <td>{persona.archiviato ? <Badge tone="neutral" label="Archiviata" /> : <Badge tone="success" label="Attiva" />}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
        </>
      ) : null}

      <PersonaFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
