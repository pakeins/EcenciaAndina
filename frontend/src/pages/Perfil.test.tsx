import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Perfil from './Perfil';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 1, role: 'client', nombre: 'John Doe', email: 'john@example.com' },
    isAuthenticated: true,
    checkSession: vi.fn(),
  }),
}));

describe('Perfil', () => {
  it('se renderiza correctamente', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Perfil />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
  });
});
