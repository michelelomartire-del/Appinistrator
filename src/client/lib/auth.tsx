import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { SessionState, SessionUser } from '@shared/api-types';

type AuthContextValue = {
  session: SessionState | undefined;
  isLoading: boolean;
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [mfaLocal, setMfaLocal] = useState(false);
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: () => api<SessionState>('/auth/session'),
    staleTime: 30_000,
    retry: false,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ mfaRequired: boolean }>('/auth/login', { body: { email, password } });
      setMfaLocal(result.mfaRequired);
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      return result;
    },
    [queryClient],
  );

  const verifyMfa = useCallback(
    async (code: string) => {
      await api('/auth/mfa/verify', { body: { code } });
      setMfaLocal(false);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setMfaLocal(false);
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    }
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['session'] });
  }, [queryClient]);

  const session = sessionQuery.data;
  const user = session?.authenticated ? session.user : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      session: mfaLocal && session && !session.authenticated ? { authenticated: false, mfaRequired: true } : session,
      isLoading: sessionQuery.isLoading,
      user,
      login,
      verifyMfa,
      logout,
      refresh,
    }),
    [session, mfaLocal, sessionQuery.isLoading, user, login, verifyMfa, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
