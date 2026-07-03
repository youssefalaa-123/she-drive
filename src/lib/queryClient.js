import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,   // data stays fresh for 2 min — no refetch during that window
      gcTime: 1000 * 60 * 10,     // unused cache lives for 10 min
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
