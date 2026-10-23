import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button, Field, TextInput } from "../components/ui";

export function ChangePassword({ forced }: { forced?: boolean }) {
  const { logout, refresh, user } = useAuth();
  const queryClient = useQueryClient();
  const [attuale, setAttuale] = useState("");
  const [nuova, setNuova] = useState("");
  const [conferma, setConferma] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await api("/auth/password", {
        body: { passwordAttuale: attuale, nuovaPassword: nuova, conferma },
      });
      setDone(true);
      if (forced) {
        await queryClient.invalidateQueries({ queryKey: ["session"] });
        await refresh();
      } else {
        setAttuale("");
        setNuova("");
        setConferma("");
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        if (err.errors) setFieldErrors(err.errors);
      } else {
        setError("Non è stato possibile aggiornare la password.");
      }
    } finally {
      setBusy(false);
    }
  };

  const card = (
    <div className="auth-card" style={{ width: "min(520px, 100%)" }}>
      <div className="auth-brand">
        <div className="auth-brand__logo">FB</div>
        <div>
          <h1>Studio EffeBi</h1>
          <p>CRM condominiale</p>
        </div>
      </div>
      {forced ? (
        <div className="alert alert--warning">
          <div>
            <strong>Imposta una nuova password</strong>
            <div>
              {user?.email} sta usando una password temporanea. Per continuare scegli una password personale di almeno
              12 caratteri con maiuscole, minuscole e numeri.
            </div>
          </div>
        </div>
      ) : (
        <p className="auth-card__intro">Cambia la password del tuo account.</p>
      )}
      {done && !forced ? (
        <div className="alert alert--success">
          <div>Password aggiornata. Le altre sessioni sono state revocate.</div>
        </div>
      ) : null}
      <form onSubmit={submit} noValidate>
        <Field label="Password attuale" htmlFor="pw-attuale" error={fieldErrors.passwordAttuale}>
          <TextInput
            id="pw-attuale"
            type="password"
            autoComplete="current-password"
            value={attuale}
            onChange={(e) => setAttuale(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Nuova password"
          htmlFor="pw-nuova"
          hint="Almeno 12 caratteri, con maiuscole, minuscole e numeri."
          error={fieldErrors.nuovaPassword}
        >
          <TextInput
            id="pw-nuova"
            type="password"
            autoComplete="new-password"
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            required
          />
        </Field>
        <Field label="Conferma nuova password" htmlFor="pw-conferma" error={fieldErrors.conferma}>
          <TextInput
            id="pw-conferma"
            type="password"
            autoComplete="new-password"
            value={conferma}
            onChange={(e) => setConferma(e.target.value)}
            required
          />
        </Field>
        {error ? (
          <div className="alert alert--danger" role="alert">
            <div>{error}</div>
          </div>
        ) : null}
        <Button type="submit" block loading={busy}>
          Aggiorna password
        </Button>
        {forced ? (
          <div style={{ marginTop: "0.6rem" }}>
            <Button type="button" variant="ghost" block onClick={() => void logout()}>
              Esci
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );

  return forced ? <div className="auth-page">{card}</div> : card;
}
