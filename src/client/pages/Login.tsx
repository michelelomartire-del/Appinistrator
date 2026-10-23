import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { ApiRequestError } from "../lib/api";
import { Button, Field, TextInput } from "../components/ui";

export function Login() {
  const { login, verifyMfa, session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaStep, setMfaStep] = useState(Boolean(session && !session.authenticated && session.mfaRequired));

  const demoMode = Boolean(session && !session.authenticated && session.demoMode);

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(email.trim(), password);
      if (result.mfaRequired) {
        setMfaStep(true);
        setPassword("");
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Accesso non riuscito. Riprova.");
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyMfa(code.trim());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Codice non valido.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand__logo">FB</div>
          <div>
            <h1>Studio EffeBi</h1>
            <p>Amministrazioni Condominiali</p>
          </div>
        </div>

        {!mfaStep ? (
          <>
            <h2>Accesso riservato</h2>
            <p className="auth-card__intro">
              Area interna dello studio. Non è prevista registrazione: gli account sono creati dall’amministratore.
            </p>
            <form onSubmit={submitCredentials} noValidate>
              <Field label="Email" htmlFor="login-email">
                <TextInput
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nome@studio.it"
                />
              </Field>
              <Field label="Password" htmlFor="login-password">
                <TextInput
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error ? (
                <div className="alert alert--danger" role="alert">
                  <div>{error}</div>
                </div>
              ) : null}
              <Button type="submit" block loading={busy}>
                Accedi
              </Button>
            </form>
            {demoMode ? (
              <div className="auth-demo">
                <strong>Ambiente dimostrativo.</strong>
                <div>Email: demo@effebi.invalid · Password: EffeBi-Demo-2026!</div>
                <div>I dati presenti sono fittizi e marcati [DEMO].</div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <h2>Verifica in due passaggi</h2>
            <p className="auth-card__intro">
              Inserisci il codice a 6 cifre generato dall’app di autenticazione (Google Authenticator, 1Password, Authy…).
            </p>
            <form onSubmit={submitMfa} noValidate>
              <Field label="Codice MFA" htmlFor="login-mfa">
                <TextInput
                  id="login-mfa"
                  className="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </Field>
              {error ? (
                <div className="alert alert--danger" role="alert">
                  <div>{error}</div>
                </div>
              ) : null}
              <Button type="submit" block loading={busy}>
                Verifica codice
              </Button>
              <div style={{ marginTop: "0.6rem" }}>
                <Button
                  type="button"
                  variant="ghost"
                  block
                  onClick={() => {
                    setMfaStep(false);
                    setError(null);
                    setCode("");
                  }}
                >
                  Torna all’accesso
                </Button>
              </div>
            </form>
          </>
        )}

        <div className="auth-footer">
          Le credenziali non vanno condivise. In caso di smarrimento del dispositivo MFA, l’accesso si ripristina solo
          dalla macchina server tramite <code>npm run admin:reset-mfa</code>.
        </div>
      </div>
    </div>
  );
}
