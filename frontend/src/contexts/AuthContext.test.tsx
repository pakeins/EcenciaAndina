import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// Helper component para usar el hook en tests
const TestComponent = () => {
  const { user, login, logout, updateProfile, isAuthenticated } = useAuth();
  return (
    <div>
      <div data-testid="is-auth">{String(isAuthenticated)}</div>
      <div data-testid="user-role">{user?.rol || 'none'}</div>
      <button data-testid="login-btn" onClick={() => login('test@test.com', 'pass')}>Login</button>
      <button data-testid="logout-btn" onClick={logout}>Logout</button>
      <button data-testid="update-btn" onClick={() => updateProfile({ nombre: 'Updated' })}>Update</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
    Object.defineProperty(window, 'location', {
      value: { pathname: '/test', href: '' },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('throw error si useAuth se usa fuera de AuthProvider', () => {
    // Suppress console.error from React when throwing during render
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestComponent />)).toThrow('useAuth must be used within an AuthProvider');
  });

  it('inicializa correctamente vacio', () => {
    render(<AuthProvider><TestComponent /></AuthProvider>);
    expect(screen.getByTestId('is-auth').textContent).toBe('false');
  });

  it('inicializa con usuario si existe en sessionStorage', () => {
    sessionStorage.setItem('user', JSON.stringify({ id: '1', rol: 'administrador' }));
    render(<AuthProvider><TestComponent /></AuthProvider>);
    expect(screen.getByTestId('is-auth').textContent).toBe('true');
    expect(screen.getByTestId('user-role').textContent).toBe('administrador');
  });

  it('maneja el error al parsear usuario de sessionStorage', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.setItem('user', 'invalid-json');
    render(<AuthProvider><TestComponent /></AuthProvider>);
    expect(screen.getByTestId('is-auth').textContent).toBe('false');
    expect(consoleSpy).toHaveBeenCalled();
  });

  describe('login', () => {
    it('login exitoso guarda sesion', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
        token: 't', refresh_token: 'rt', user: { id: '1', rol: 'caja' }
      }), { status: 200 }));

      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      expect(sessionStorage.getItem('token')).toBe('t');
      expect(screen.getByTestId('is-auth').textContent).toBe('true');
      expect(screen.getByTestId('user-role').textContent).toBe('caja');
    });

    it('login fallido no guarda sesion', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
        mensaje: 'Credenciales inválidas'
      }), { status: 401 }));

      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      expect(sessionStorage.getItem('token')).toBeNull();
      expect(screen.getByTestId('is-auth').textContent).toBe('false');
    });

    it('login con error de red', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      expect(consoleSpy).toHaveBeenCalled();
      expect(screen.getByTestId('is-auth').textContent).toBe('false');
    });
  });

  describe('logout y profile', () => {
    it('logout limpia sesion', () => {
      sessionStorage.setItem('token', 't');
      sessionStorage.setItem('user', JSON.stringify({ id: '1', rol: 'caja' }));
      
      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      act(() => {
        screen.getByTestId('logout-btn').click();
      });

      expect(sessionStorage.getItem('token')).toBeNull();
      expect(screen.getByTestId('is-auth').textContent).toBe('false');
    });

    it('updateProfile actualiza usuario', () => {
      sessionStorage.setItem('user', JSON.stringify({ id: '1', nombre: 'Old', rol: 'caja' }));
      
      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      act(() => {
        screen.getByTestId('update-btn').click();
      });

      const updatedStorage = JSON.parse(sessionStorage.getItem('user') || '{}');
      expect(updatedStorage.nombre).toBe('Updated');
    });
  });

  describe('inactividad y sincronizacion', () => {
    it('cierra sesion despues de 1 hora de inactividad', async () => {
      sessionStorage.setItem('token', 't');
      sessionStorage.setItem('user', JSON.stringify({ id: '1', rol: 'caja' }));
      
      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      act(() => {
        vi.advanceTimersByTime(60 * 60 * 1000); // 1 hora
      });

      expect(sessionStorage.getItem('token')).toBeNull();
      expect(window.location.href).toBe('/login');
    });

    it('resetea timer al interactuar', async () => {
      sessionStorage.setItem('token', 't');
      sessionStorage.setItem('user', JSON.stringify({ id: '1', rol: 'caja' }));
      
      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      act(() => {
        vi.advanceTimersByTime(30 * 60 * 1000); // 30 min
      });

      // Simular interaccion
      act(() => {
        window.dispatchEvent(new Event('mousedown'));
      });

      act(() => {
        vi.advanceTimersByTime(35 * 60 * 1000); // 35 min extra
      });

      // No debio cerrar sesion porque se reseteo
      expect(sessionStorage.getItem('token')).toBe('t');
    });

    it('sincroniza logout con otras pestañas (storage event)', () => {
      sessionStorage.setItem('user', JSON.stringify({ id: '1', rol: 'caja' }));
      render(<AuthProvider><TestComponent /></AuthProvider>);
      
      expect(screen.getByTestId('is-auth').textContent).toBe('true');

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: null }));
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('false');
    });

    it('sincroniza login con otras pestañas (storage event)', () => {
      render(<AuthProvider><TestComponent /></AuthProvider>);
      expect(screen.getByTestId('is-auth').textContent).toBe('false');

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: JSON.stringify({ id: '2', rol: 'admin' }) }));
      });

      expect(screen.getByTestId('is-auth').textContent).toBe('true');
    });
    
    it('maneja json invalido en storage event', () => {
      render(<AuthProvider><TestComponent /></AuthProvider>);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      act(() => {
        window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: 'invalid' }));
      });

      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
