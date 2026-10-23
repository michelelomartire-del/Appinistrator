import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { api, ApiRequestError } from './api';

export function useApiQuery<T>(
  key: unknown[],
  path: string | null,
  options: { enabled?: boolean; staleTime?: number } = {},
) {
  return useQuery<T, ApiRequestError>({
    queryKey: key,
    queryFn: ({ signal }) => api<T>(path!, { signal }),
    enabled: Boolean(path) && (options.enabled ?? true),
    staleTime: options.staleTime ?? 10_000,
  });
}

export function useApiMutation<TData, TVariables>(
  options: {
    method?: string;
    path: string | ((vars: TVariables) => string);
    invalidate?: unknown[][];
    onSuccessMessage?: string;
  },
  mutationOptions: Omit<UseMutationOptions<TData, ApiRequestError, TVariables>, 'mutationFn'> = {},
) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiRequestError, TVariables>({
    mutationFn: (vars) =>
      api<TData>(typeof options.path === 'function' ? options.path(vars) : options.path, {
        method: options.method ?? 'POST',
        body: vars,
      }),
    ...mutationOptions,
    onSuccess: async (...args) => {
      for (const key of options.invalidate ?? []) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
      await mutationOptions.onSuccess?.(...args);
    },
  });
}

/** Etichetta leggibile per gli errori di validazione lato server. */
export function fieldError(error: ApiRequestError | null, field: string): string | undefined {
  return error?.errors?.[field];
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Si è verificato un errore inatteso.';
}
