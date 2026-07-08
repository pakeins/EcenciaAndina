import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { User, UserRole } from '@/types';
import { API_BASE_URL } from '@/lib/api';

// Tiempo de inactividad máximo: 1 hora (en milisegundos)
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; rol: UserRole; message?: string }>;
  logout: () => void;
  updateProfile: (updatedData: Partial<User>) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = sessionStorage.getItem('user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch (e) {
        console.error('Error parsing user:', e);
      }
    }
    return null;
  });

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');
    setUser(null);
  }, []);

  // ── Temporizador de inactividad ──────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    // Solo iniciar temporizador si hay sesión activa
    const hasSession = sessionStorage.getItem('token');
    if (hasSession) {
      inactivityTimer.current = setTimeout(() => {
        console.warn('Sesión cerrada por inactividad (1 hora).');
        logout();
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [logout]);

  useEffect(() => {
    // Eventos que indican actividad del usuario
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach((event) =>
      window.addEventListener(event, handleActivity, { passive: true }),
    );

    // Iniciar temporizador al montar
    resetInactivityTimer();

    return () => {
      activityEvents.forEach((event) =>
        window.removeEventListener(event, handleActivity),
      );
      if (inactivityTimer.current) {
        clearTimeout(inactivityTimer.current);
      }
    };
  }, [resetInactivityTimer]);

  // Escuchar cambios en sessionStorage (para cerrar sesión en todas las pestañas)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' && e.newValue === null) {
        console.log('Sesión cerrada en otra pestaña. Sincronizando...');
        setUser(null);
      }
      if (e.key === 'user' && e.newValue !== null) {
        try {
          setUser(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Error parsing storage data:', err);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; rol: UserRole; message?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: email, password }),
      });
      const data = await response.json();
      if (response.ok && data.token) {
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('refresh_token', data.refresh_token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
        resetInactivityTimer();
        return { success: true, rol: data.user.rol };
      }
      return { success: false, rol: 'caja', message: data.mensaje || 'Credenciales inválidas' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, rol: 'caja', message: 'Error de conexión con el servidor' };
    }
  };

  const updateProfile = (updatedData: Partial<User>) => {
    if (user) {
      const newUser = { ...user, ...updatedData };
      setUser(newUser);
      sessionStorage.setItem('user', JSON.stringify(newUser));
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateProfile, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
