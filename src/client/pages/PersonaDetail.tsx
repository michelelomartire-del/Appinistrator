import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  PageHeader,
  Table,
  stateLabel,
  useToast,
} from "../components/ui";
import { DocumentsPanel } from "../components/DocumentsPanel";
import { PersonaFormModal } from "./Persone";
import type { PersonaDto } from "@shared/api-types";
import { condominioStatoLabels, ruoloPersonaCondominioLabels, titoloUnitaLabels } from "@shared/constants";
import { formatDate, formatMillesimi } from "@shared/format";

type PersonaDetailData = PersonaDto & {
  condomini: Array<{
    id: string;
    condominioId: string;
    codice: string;
    denominazione: string;
    comune: string | null;
    stato: string;
    ruolo: string;
    qualifica: string | null;
    dataInizio: string | null;
    dataFine: string | null;
  }>;
  unita: Array<{
    id: string;
    unitaId: string;
    condominioId: string;
    condominio: string;
    identificativo: string;
    titolo: string;
    millesimi: number | null;
    unitaMillesimi: number | null;
  }>;
};

export function PersonaDetail() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, refetch } = useApiQuery<PersonaDetailData>(["persone", id], `/persone/${id}`);

  if (isLoading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error.message} onRetry={() => void refetch()} />;
  if (!data) return null;

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await api(`/persone/${id}/archivia`, { body: { archiviato: !data.archiviato } });
      await queryClient.invalidateQueries({ queryKey: ["persone"] });
      notify(data.archiviato ? "Persona ripristinata." : "Persona archiviata.");
      setArchiveOpen(false);
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        backTo="/persone"
        title={`${data.cognome} ${data.nome}`}
        subtitle={
          <>
            {data.archiviato ? <Badge tone="neutral" label="Archiviata" /> : <Badge tone="success" label="Attiva" />}
            {data.email ? <span>{data.email}</span> : null}
            {data.telefono ? <span>· {data.telefono}</span> : null}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Modifica
            </Button>
            <Button variant="ghost" onClick={() => setArchiveOpen(true)}>
              {data.archiviato ? "Ripristina" : "Archivia"}
            </Button>
          </>
        }
      />

      <div className="grid-2" style={{ alignItems: "start" }}>
        <Card title="Anagrafica">
          <DescriptionList
            items={[
              { label: "Nome", value: data.nome },
              { label: "Cognome", value: data.cognome },
              { label: "Codice fiscale", value: data.codiceFiscale },
              { label: "Email", value: data.email },
              { label: "Telefono", value: data.telefono },
              { label: "Inserita il", value: formatDate(data.createdAt) },
              { label: "Note", value: data.note, full: true },
            ]}
          />
        </Card>

        <Card title="Relazioni con i condomìni" description="La stessa persona può avere ruoli diversi in condomìni diversi.">
          {data.condomini.length === 0 ? (
            <EmptyState
              icon="🤝"
              title="Nessun condominio collegato"
              description="Collega la persona da una scheda condominio, scegliendo il ruolo."
            />
          ) : (
            <Table caption="Condomìni collegati">
              <thead>
                <tr>
                  <th>Condominio</th>
                  <th>Ruolo</th>
                  <th>Stato</th>
                  <th>Dal</th>
                </tr>
              </thead>
              <tbody>
                {data.condomini.map((relazione) => (
                  <tr key={relazione.id}>
                    <td>
                      <Link to={`/condomini/${relazione.condominioId}`}>{relazione.denominazione}</Link>
                      <div className="muted small">
                        {relazione.codice}
                        {relazione.comune ? ` · ${relazione.comune}` : ""}
                      </div>
                    </td>
                    <td>{stateLabel(ruoloPersonaCondominioLabels, relazione.ruolo)}</td>
                    <td>
                      <Badge value={relazione.stato} label={stateLabel(condominioStatoLabels, relazione.stato)} />
                    </td>
                    <td className="nowrap">{formatDate(relazione.dataInizio) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card title="Unità collegate">
        {data.unita.length === 0 ? (
          <EmptyState icon="🏠" title="Nessuna unità collegata" description="Il collegamento con le unità si gestisce dalla scheda condominio." />
        ) : (
          <Table caption="Unità collegate">
            <thead>
              <tr>
                <th>Unità</th>
                <th>Condominio</th>
                <th>Titolo</th>
                <th className="right">Millesimi unità</th>
              </tr>
            </thead>
            <tbody>
              {data.unita.map((u) => (
                <tr key={u.id}>
                  <td>{u.identificativo}</td>
                  <td>
                    <Link to={`/condomini/${u.condominioId}`}>{u.condominio}</Link>
                  </td>
                  <td>{stateLabel(titoloUnitaLabels, u.titolo)}</td>
                  <td className="right">
                    {u.millesimi === null ? formatMillesimi(u.unitaMillesimi) ?? "—" : formatMillesimi(u.millesimi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Documenti" description="Archivio privato collegato alla persona.">
        <DocumentsPanel entitaTipo="persona" entitaId={data.id} />
      </Card>

      <PersonaFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        personaId={data.id}
        initial={data}
        onSaved={() => void refetch()}
      />

      <ConfirmDialog
        open={archiveOpen}
        title={data.archiviato ? "Ripristinare la persona?" : "Archiviare la persona?"}
        message={
          data.archiviato
            ? "La persona tornerà disponibile nelle ricerche e nei collegamenti."
            : "La persona resta nei dati storici ma non sarà più proposta per nuovi collegamenti."
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
