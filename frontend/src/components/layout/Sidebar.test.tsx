import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AuthProvider } from '@/contexts/AuthContext';

describe('Sidebar', () => {
  it('se renderiza correctamente para admin', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <Sidebar role="admin" />
        </BrowserRouter>
      </AuthProvider>
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('se renderiza correctamente para empleado', () => {
    render(
      <AuthProvider>
        <BrowserRouter>
          <Sidebar role="empleado" />
        </BrowserRouter>
      </AuthProvider>
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
