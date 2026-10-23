import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError, downloadUrl } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
import { Button, ConfirmDialog, EmptyState, Field, TextInput, useToast } from "./ui";
import type { DocumentoDto } from "@shared/api-types";
import { formatDateTime } from "@shared/format";
import { MAX_DOCUMENT_BYTES } from "@shared/constants";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({
  entitaTipo,
  entitaId,
  condominioId,
}: {
  entitaTipo: string;
  entitaId?: string;
  condominioId?: string;
}) {
  const params = new URLSearchParams({ entitaTipo });
  if (entitaId) params.set("entitaId", entitaId);
  if (condominioId) params.set("condominioId", condominioId);
  const { data, isLoading } = useApiQuery<{ items: DocumentoDto[] }>(
    ["documenti", entitaTipo, entitaId ?? null, condominioId ?? null],
    `/documenti?${params.toString()}`,
  );
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [categoria, setCategoria] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DocumentoDto | null>(null);

  const upload = async () => {
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError("Il file supera il limite di 15 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entitaTipo", entitaTipo);
      if (entitaId) formData.append("entitaId", entitaId);
      if (condominioId) formData.append("condominioId", condominioId);
      if (categoria) formData.append("categoria", categoria);
      if (descrizione) formData.append("descrizione", descrizione);
      await api("/documenti", { method: "POST", formData });
      setFile(null);
      setCategoria("");
      setDescrizione("");
      if (fileRef.current) fileRef.current.value = "";
      await queryClient.invalidateQueries({ queryKey: ["documenti"] });
      notify("Documento caricato nell’archivio privato.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Caricamento non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/documenti/${toDelete.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["documenti"] });
      notify("Documento archiviato.");
      setToDelete(null);
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card" style={{ marginBottom: 0 }}>
        <h3 className="card__title" style={{ marginBottom: "0.6rem" }}>
          Carica un documento
        </h3>
        <p className="muted small">
          Archivio privato: i file non hanno URL pubblici e si scaricano solo da utenti autenticati. Ammessi PDF,
          immagini e documenti Office fino a 15 MB.
        </p>
        <div className="form-grid" style={{ marginTop: "0.6rem" }}>
          <div className="field--full">
            <Field label="File" htmlFor="doc-file">
              <input
                id="doc-file"
                ref={fileRef}
                className="input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          </div>
          <Field label="Categoria" hint="Es. verbale, fattura, preventivo">
            <TextInput value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Descrizione">
            <TextInput value={descrizione} onChange={(e) => setDescrizione(e.target.value)} maxLength={500} />
          </Field>
        </div>
        {error ? (
          <div className="alert alert--danger" role="alert">
            <div>{error}</div>
          </div>
        ) : null}
        <div className="row row--end">
          <Button onClick={() => void upload()} disabled={!file} loading={busy}>
            Carica
          </Button>
        </div>
      </div>

      {isLoading ? <p className="muted small">Caricamento documenti…</p> : null}
      {!isLoading && (!data || data.items.length === 0) ? (
        <EmptyState icon="📁" title="Nessun documento" description="I documenti caricati restano visibili solo allo studio." />
      ) : null}
      <div className="document-list">
        {data?.items.map((doc) => (
          <div className="document-item" key={doc.id}>
            <div>
              <div>
                <strong>{doc.nomeFile}</strong> {doc.categoria ? <span className="muted small">· {doc.categoria}</span> : null}
              </div>
              <div className="document-item__meta">
                {humanSize(doc.dimensione)} · caricato il {formatDateTime(doc.createdAt)}
                {doc.descrizione ? ` · ${doc.descrizione}` : ""}
              </div>
            </div>
            <div className="row">
              <a className="btn btn--secondary btn--sm" href={downloadUrl(doc.id)}>
                Scarica
              </a>
              <Button variant="ghost" size="sm" onClick={() => setToDelete(doc)}>
                Archivia
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Archiviare il documento?"
        message={
          <>
            Il documento <strong>{toDelete?.nomeFile}</strong> non sarà più scaricabile. Il file resta nell’archivio
            privato per eventuale ripristino manuale.
          </>
        }
        confirmLabel="Archivia"
        danger
        loading={busy}
        onClose={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
