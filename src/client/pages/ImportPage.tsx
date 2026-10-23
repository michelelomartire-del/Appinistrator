import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useApiQuery } from "../lib/hooks";
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
  Select,
  Table,
  useToast,
} from "../components/ui";
import type { ImportBatchDto, ImportPreview, ImportPreviewRow, Paginated } from "@shared/api-types";
import { IMPORT_TIPI, importTipoLabels, type ImportTipo } from "@shared/constants";
import { isDemo } from "../../demo";
import { formatDateTime } from "@shared/format";

type WizardStep = "scelta" | "anteprima" | "completato";

export function ImportPage() {
  const [tipo, setTipo] = useState<ImportTipo>("condomini");
  const [step, setStep] = useState<WizardStep>("scelta");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<{ importate: number; ignorate: number } | null>(null);
  const [includiDuplicati, setIncludiDuplicati] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const history = useApiQuery<Paginated<ImportBatchDto>>(["import", "batches"], "/import?perPage=20");

  const reset = () => {
    setStep("scelta");
    setPreview(null);
    setResult(null);
    setFile(null);
    setIncludiDuplicati(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const carica = async () => {
    if (!file) {
      setError("Seleziona un file CSV o XLSX.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await api<ImportPreview>(`/import/${tipo}/anteprima`, { method: "POST", formData });
      setPreview(data);
      setStep("anteprima");
      await queryClient.invalidateQueries({ queryKey: ["import"] });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Analisi del file non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  const conferma = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ importate: number; ignorate: number }>(`/import/${preview.batchId}/conferma`, {
        body: { includiDuplicati },
      });
      setResult(data);
      setStep("completato");
      notify(`Importazione completata: ${data.importate} record creati.`);
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Conferma non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  const annulla = async (batchId: string, committed: boolean) => {
    const message = committed
      ? "Annullare l’importazione eliminerà i record creati da quel file. L’operazione è consentita solo se non sono stati aggiunti dati collegati. Continuare?"
      : "Scartare l’anteprima? Nessun dato è stato salvato.";
    if (!window.confirm(message)) return;
    try {
      const res = await api<{ eliminati: number }>(`/import/${batchId}/annulla`, { body: {} });
      notify(res.eliminati > 0 ? `Importazione annullata: ${res.eliminati} record eliminati.` : "Anteprima scartata.");
      await queryClient.invalidateQueries();
      reset();
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : "Operazione non riuscita.", "danger");
    }
  };

  const riconosciute = preview?.colonneRiconosciute ?? [];
  const ignorate = preview?.colonneIgnorate ?? [];

  return (
    <>
      <PageHeader
        title="Importazione dati"
        subtitle="CSV/XLSX con anteprima, validazione riga per riga e rilevamento dei possibili duplicati. Nessun file viene salvato nei log."
      />

      {isDemo ? (
        <Banner tone="warning" title="Importazione disattivata nella demo">
          Qui sotto vedi il registro delle importazioni già effettuate e puoi scaricare i template. Il caricamento dei
          file è spento: nessun file viene letto o inviato da questa pagina.
        </Banner>
      ) : null}

      <div className="steps">
        <div className={`step ${step === "scelta" ? "is-active" : "is-done"}`}>
          <span className="step__number">1</span> Tipo e file
        </div>
        <div className={`step ${step === "anteprima" ? "is-active" : step === "completato" ? "is-done" : ""}`}>
          <span className="step__number">2</span> Anteprima e validazione
        </div>
        <div className={`step ${step === "completato" ? "is-active" : ""}`}>
          <span className="step__number">3</span> Conferma
        </div>
      </div>

      {step === "scelta" ? (
        <Card title="Carica il file" description="Scarica prima il template e compila una riga per record.">
          <div className="form-grid">
            <Field label="Tipo di importazione">
              <Select value={tipo} onChange={(e) => setTipo(e.target.value as ImportTipo)}>
                {IMPORT_TIPI.map((t) => (
                  <option key={t} value={t}>
                    {importTipoLabels[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "0.9rem" }}>
              <a className="btn btn--secondary btn--sm" href={`/api/import/template/${tipo}`}>
                Scarica template {importTipoLabels[tipo]} (.xlsx)
              </a>
            </div>
          </div>

          <div
            className={`dropzone ${dragging ? "is-dragover" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
          >
            <div style={{ fontSize: "1.4rem" }} aria-hidden="true">
              ⇪
            </div>
            <strong>{file ? file.name : "Trascina qui il file oppure clicca per selezionarlo"}</strong>
            <p className="muted small">Formati ammessi: .csv, .xlsx · massimo 8 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {error ? (
            <div className="alert alert--danger" role="alert" style={{ marginTop: "0.8rem" }}>
              <div>{error}</div>
            </div>
          ) : null}

          <div className="form-actions">
            <Button onClick={() => void carica()} loading={busy} disabled={!file}>
              Analizza file
            </Button>
          </div>

          <Banner tone="info" title="Dati personali">
            Il file viene analizzato solo in memoria e non viene conservato. Nel database restano i record importati e
            il riepilogo dell’operazione (nome file, data, esito): non i contenuti grezzi nei log applicativi.
          </Banner>
        </Card>
      ) : null}

      {step === "anteprima" && preview ? (
        <>
          <Card
            title="Anteprima"
            description={`${preview.nomeFile} · nessun dato è stato ancora salvato`}
            actions={
              <Button variant="ghost" onClick={() => void annulla(preview.batchId, false)}>
                Scarta anteprima
              </Button>
            }
          >
            <div className="import-summary">
              <div className="import-stat">
                Righe totali<strong>{preview.riepilogo.totali}</strong>
              </div>
              <div className="import-stat">
                Valide<strong style={{ color: "var(--c-success)" }}>{preview.riepilogo.valide}</strong>
              </div>
              <div className="import-stat">
                Con errori<strong style={{ color: "var(--c-danger)" }}>{preview.riepilogo.errori}</strong>
              </div>
              <div className="import-stat">
                Possibili duplicati<strong style={{ color: "var(--c-warning)" }}>{preview.riepilogo.duplicate}</strong>
              </div>
            </div>

            {preview.riepilogo.troncate ? (
              <Banner tone="warning" title="File molto grande">
                Sono state analizzate le prime 5000 righe. Suddividi il file per importare il resto.
              </Banner>
            ) : null}

            {ignorate.length > 0 ? (
              <p className="small muted">
                Colonne ignorate (non riconosciute): {ignorate.join(", ")}
              </p>
            ) : null}
            {riconosciute.length > 0 ? (
              <p className="small muted">Colonne riconosciute: {riconosciute.join(", ")}</p>
            ) : null}

            <div style={{ maxHeight: 480, overflow: "auto", marginTop: "0.8rem" }}>
              <Table caption="Righe del file">
                <thead>
                  <tr>
                    <th>Riga</th>
                    <th>Esito</th>
                    <th>Dati</th>
                    <th>Problemi</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.righe.map((riga: ImportPreviewRow) => (
                    <tr key={riga.numeroRiga} className={riga.esito === "errore" ? "row-error" : riga.esito === "duplicato" ? "row-duplicate" : ""}>
                      <td className="nowrap">{riga.numeroRiga}</td>
                      <td>
                        {riga.esito === "valida" ? <Badge tone="success" label="Valida" /> : null}
                        {riga.esito === "errore" ? <Badge tone="danger" label="Errore" /> : null}
                        {riga.esito === "duplicato" ? <Badge tone="warning" label="Possibile duplicato" /> : null}
                      </td>
                      <td>
                        <div className="small">
                          {Object.entries(riga.dati)
                            .filter(([, value]) => value)
                            .slice(0, 6)
                            .map(([key, value]) => (
                              <div key={key}>
                                <span className="muted">{key}:</span> {value}
                              </div>
                            ))}
                        </div>
                      </td>
                      <td>
                        {riga.errori.length > 0 ? (
                          <ul className="error-list">
                            {riga.errori.map((errore) => (
                              <li key={`${errore.campo}-${errore.messaggio}`}>{errore.messaggio}</li>
                            ))}
                          </ul>
                        ) : null}
                        {riga.duplicato ? (
                          <div className="small" style={{ color: "var(--c-warning)" }}>
                            Possibile duplicato: {riga.duplicato.tipo} ({riga.duplicato.riferimento})
                          </div>
                        ) : null}
                        {riga.avvisi.map((avviso) => (
                          <div key={avviso.messaggio} className="small muted">
                            ⚠ {avviso.messaggio}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {preview.riepilogo.totali > preview.righe.length ? (
              <p className="muted small">
                Mostrate {preview.righe.length} righe su {preview.riepilogo.totali}. Il report completo resta
                disponibile nella cronologia dell’importazione.
              </p>
            ) : null}

            <div style={{ marginTop: "0.9rem" }}>
              <label className="checkbox">
                <input type="checkbox" checked={includiDuplicati} onChange={(e) => setIncludiDuplicati(e.target.checked)} />
                <span>Importa anche i record rilevati come possibili duplicati (crea nuovi record, non unisce)</span>
              </label>
              <div className="form-actions">
                <Button onClick={() => void conferma()} loading={busy} disabled={preview.riepilogo.valide === 0 && !includiDuplicati}>
                  Conferma importazione
                </Button>
              </div>
            </div>
            {error ? (
              <div className="alert alert--danger" role="alert">
                <div>{error}</div>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}

      {step === "completato" && result ? (
        <Card title="Importazione completata">
          <p>
            Record creati: <strong>{result.importate}</strong>. Duplicati ignorati: <strong>{result.ignorate}</strong>.
          </p>
          <div className="form-actions">
            <Button onClick={reset}>Nuova importazione</Button>
          </div>
        </Card>
      ) : null}

      <Card title="Cronologia importazioni" description="Ogni operazione registra data, file, esito e possibilità di annullamento.">
        {history.isLoading ? <LoadingBlock label="Caricamento cronologia…" /> : null}
        {history.error ? <ErrorBlock message={history.error.message} onRetry={() => void history.refetch()} /> : null}
        {history.data && history.data.items.length === 0 ? (
          <EmptyState icon="📥" title="Nessuna importazione" description="Le importazioni effettuate compariranno qui con il loro esito." />
        ) : null}
        {history.data && history.data.items.length > 0 ? (
          <Table caption="Cronologia importazioni">
            <thead>
              <tr>
                <th>Data</th>
                <th>File</th>
                <th>Tipo</th>
                <th>Esito</th>
                <th className="right">Righe</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.data.items.map((batch) => (
                <tr key={batch.id}>
                  <td className="nowrap">{formatDateTime(batch.createdAt)}</td>
                  <td>{batch.nomeFile}</td>
                  <td>{importTipoLabels[batch.tipo as ImportTipo] ?? batch.tipo}</td>
                  <td>
                    <Badge
                      tone={
                        batch.stato === "completato" ? "success" : batch.stato === "anteprima" ? "warning" : batch.stato === "errore" ? "danger" : "neutral"
                      }
                      label={
                        batch.stato === "completato"
                          ? "Completato"
                          : batch.stato === "anteprima"
                            ? "Anteprima"
                            : batch.stato === "annullato"
                              ? "Annullato"
                              : "Errore"
                      }
                    />
                  </td>
                  <td className="right nowrap">
                    {batch.righeValide} / {batch.righeTotali}
                  </td>
                  <td className="right">
                    {batch.stato !== "annullato" ? (
                      <Button variant="ghost" size="sm" onClick={() => void annulla(batch.id, batch.stato === "completato")}>
                        {batch.stato === "completato" ? "Annulla import" : "Scarta"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : null}
      </Card>
    </>
  );
}
