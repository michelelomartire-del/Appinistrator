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
  stateLabel,
  useToast,
} from "../components/ui";
import { useCondominioOptions } from "./Condomini";
import type { AssembleaDto, Paginated } from "@shared/api-types";
import {
  ASSEMBLEA_MODALITA,
  ASSEMBLEA_STATI,
  ASSEMBLEA_TIPI,
  assembleaModalitaLabels,
  assembleaStatoLabels,
  assembleaTipoLabels,
} from "@shared/constants";
import { formatDate } from "@shared/format";

export function Assemblee() {
  const [condominioId, setCondominioId] = useState("");
  const [stato, setStato] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const perPage = 25;
  const { data: condomini } = useCondominioOptions();
  const [values, setValues] = useState({
    condominioId: "",
    data: "",
    ora: "",
    tipo: "ordinaria",
    luogo: "",
    modalita: "presenza",
    stato: "programmata",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { notify } = useToast();

  useEffect(() => setPage(1), [condominioId, stato]);

  const { data, isLoading, error: loadError, refetch } = useApiQuery<Paginated<AssembleaDto>>(
    ["assemblee", condominioId, stato, page],
    `/assemblee${qs({ condominioId: condominioId || undefined, stato: stato || undefined, page, perPage })}`,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/assemblee", {
        body: {
          condominioId: values.condominioId,
          data: values.data,
          ora: values.ora || null,
          tipo: values.tipo,
          luogo: values.luogo || null,
          modalita: values.modalita,
          stato: values.stato,
          note: values.note || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["assemblee"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      notify("Assemblea registrata.");
      setOpen(false);
      setValues({ ...values, data: "", ora: "", luogo: "", note: "" });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Assemblee"
        subtitle="Data, ordine del giorno, presenze e delibere. Nessun calcolo automatico di maggioranze."
        actions={<Button onClick={() => setOpen(true)}>Nuova assemblea</Button>}
      />

      <div className="filters">
        <Field label="Condominio">
          <Select value={condominioId} onChange={(e) => setCondominioId(e.target.value)}>
            <option value="">Tutti</option>
            {condomini?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.denominazione}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stato">
          <Select value={stato} onChange={(e) => setStato(e.target.value)}>
            <option value="">Tutti</option>
            {ASSEMBLEA_STATI.map((s) => (
              <option key={s} value={s}>
                {assembleaStatoLabels[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isLoading ? <LoadingBlock /> : null}
      {loadError ? <ErrorBlock message={loadError.message} onRetry={() => void refetch()} /> : null}

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="🗓"
          title="Nessuna assemblea registrata"
          description="Registra l’assemblea con data, ordine del giorno e partecipanti."
          action={<Button onClick={() => setOpen(true)}>Nuova assemblea</Button>}
        />
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <Table caption="Elenco assemblee">
            <thead>
              <tr>
                <th>Data</th>
                <th>Condominio</th>
                <th>Tipo / modalità</th>
                <th>Stato</th>
                <th className="right">Punti ODG</th>
                <th className="right">Presenti</th>
                <th className="right">Millesimi presenti</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">
                    <Link to={`/assemblee/${a.id}`}>
                      {formatDate(a.data)}
                      {a.ora ? ` · ${a.ora}` : ""}
                    </Link>
                  </td>
                  <td>{a.condominio}</td>
                  <td>
                    {stateLabel(assembleaTipoLabels, a.tipo)}
                    <div className="muted small">{stateLabel(assembleaModalitaLabels, a.modalita)}</div>
                  </td>
                  <td>
                    <Badge value={a.stato} label={stateLabel(assembleaStatoLabels, a.stato)} />
                  </td>
                  <td className="right">{a.punti.length}</td>
                  <td className="right">{a.partecipanti.filter((p) => p.presente).length}</td>
                  <td className="right">{a.millesimiPresenti === null ? "—" : a.millesimiPresenti}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} perPage={perPage} total={data.total} onPage={setPage} />
        </>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuova assemblea"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Annulla
            </Button>
            <Button onClick={() => void submit(new Event("submit") as unknown as FormEvent)} loading={busy}>
              Registra
            </Button>
          </>
        }
      >
        {condomini && condomini.items.length === 0 ? (
          <p className="muted">Serve almeno un condominio censito.</p>
        ) : (
          <form onSubmit={submit} noValidate>
            {error ? (
              <div className="alert alert--danger" role="alert">
                <div>{error}</div>
              </div>
            ) : null}
            <Field label="Condominio" required>
              <Select
                value={values.condominioId}
                onChange={(e) => setValues({ ...values, condominioId: e.target.value })}
                required
              >
                <option value="">Seleziona…</option>
                {condomini?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.denominazione}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="form-grid">
              <Field label="Data" required>
                <TextInput type="date" value={values.data} onChange={(e) => setValues({ ...values, data: e.target.value })} required />
              </Field>
              <Field label="Ora">
                <TextInput type="time" value={values.ora} onChange={(e) => setValues({ ...values, ora: e.target.value })} />
              </Field>
              <Field label="Tipo">
                <Select value={values.tipo} onChange={(e) => setValues({ ...values, tipo: e.target.value })}>
                  {ASSEMBLEA_TIPI.map((t) => (
                    <option key={t} value={t}>
                      {assembleaTipoLabels[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Modalità">
                <Select value={values.modalita} onChange={(e) => setValues({ ...values, modalita: e.target.value })}>
                  {ASSEMBLEA_MODALITA.map((m) => (
                    <option key={m} value={m}>
                      {assembleaModalitaLabels[m]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Luogo">
                <TextInput value={values.luogo} onChange={(e) => setValues({ ...values, luogo: e.target.value })} />
              </Field>
              <Field label="Stato">
                <Select value={values.stato} onChange={(e) => setValues({ ...values, stato: e.target.value })}>
                  {ASSEMBLEA_STATI.map((s) => (
                    <option key={s} value={s}>
                      {assembleaStatoLabels[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="field--full">
                <Field label="Note">
                  <TextArea value={values.note} onChange={(e) => setValues({ ...values, note: e.target.value })} rows={2} />
                </Field>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
