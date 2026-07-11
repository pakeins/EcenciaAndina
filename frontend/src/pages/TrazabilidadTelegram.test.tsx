import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TrazabilidadTelegram from './TrazabilidadTelegram';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({
      search: '?orderId=123',
    }),
  };
});

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

describe('TrazabilidadTelegram', () => {
  it('se renderiza correctamente', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TrazabilidadTelegram />
        </BrowserRouter>
      </QueryClientProvider>
    );
  });
});
