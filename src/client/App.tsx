import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider, LoadingBlock, ErrorBlock } from "./components/ui";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { ChangePassword } from "./pages/ChangePassword";
import { Dashboard } from "./pages/Dashboard";
import { Condomini } from "./pages/Condomini";
import { CondominioDetail } from "./pages/CondominioDetail";
import { Persone } from "./pages/Persone";
import { PersonaDetail } from "./pages/PersonaDetail";
import { Segnalazioni } from "./pages/Segnalazioni";
import { SegnalazioneDetail } from "./pages/SegnalazioneDetail";
import { Assemblee } from "./pages/Assemblee";
import { AssembleaDetail } from "./pages/AssembleaDetail";
import { Rendiconti } from "./pages/Rendiconti";
import { PeriodoDetail } from "./pages/PeriodoDetail";
import { Consumi } from "./pages/Consumi";
import { ImportPage } from "./pages/ImportPage";
import { Impostazioni } from "./pages/Impostazioni";
import { NotFound } from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 1;
      },
    },
  },
});

function AuthGate() {
  const { session, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <LoadingBlock label="Verifica della sessione…" />
        </div>
      </div>
    );
  }
  if (!session || !session.authenticated) {
    return <Login />;
  }
  if (!user) {
    return <Login />;
  }
  if (user.mustChangePassword) {
    return <ChangePassword forced />;
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="condomini" element={<Condomini />} />
        <Route path="condomini/:id" element={<CondominioDetail />} />
        <Route path="persone" element={<Persone />} />
        <Route path="persone/:id" element={<PersonaDetail />} />
        <Route path="segnalazioni" element={<Segnalazioni />} />
        <Route path="segnalazioni/:id" element={<SegnalazioneDetail />} />
        <Route path="assemblee" element={<Assemblee />} />
        <Route path="assemblee/:id" element={<AssembleaDetail />} />
        <Route path="rendiconti" element={<Rendiconti />} />
        <Route path="rendiconti/periodi/:id" element={<PeriodoDetail />} />
        <Route path="consumi" element={<Consumi />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="impostazioni" element={<Impostazioni />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AuthGate />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export { ErrorBlock };
