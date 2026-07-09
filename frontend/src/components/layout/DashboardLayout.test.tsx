import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';
import { AuthProvider } from '@/contexts/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 1, role: 'admin', name: 'Admin' },
    isAuthenticated: true,
  }),
}));

describe('DashboardLayout', () => {
  it('se renderiza correctamente', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <DashboardLayout />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
