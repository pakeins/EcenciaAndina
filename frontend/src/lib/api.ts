export const API_BASE_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:3001/api'
  : '/api';

export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = sessionStorage.getItem('token');
  
  // Si la URL no es absoluta, añadir el BASE_URL
  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const getHeaders = (t: string | null) => ({
    'Content-Type': 'application/json',
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  try {
    const response = await fetch(fullUrl, { ...options, headers: getHeaders(token) });

    if (response.status === 401) {
      const refreshToken = sessionStorage.getItem('refresh_token');

      if (refreshToken) {
        console.log('La sesión ha expirado. Intentando renovar token...');
        try {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            sessionStorage.setItem('token', data.token);
            sessionStorage.setItem('refresh_token', data.refresh_token);

            // Reintentar la petición original con el nuevo token
            console.log('Token renovado exitosamente. Reintentando petición original...');
            return await fetch(fullUrl, { ...options, headers: getHeaders(data.token) });
          }
        } catch (err) {
          console.error('Error crítico al intentar renovar el token:', err);
        }
      }

      // Si llegamos aquí es porque no hay refresh_token o el proceso falló
      console.warn('No se pudo renovar la sesión. Cerrando sesión por seguridad.');
      handleGlobalLogout();
      throw new Error('Sesión expirada');
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'Sesión expirada') throw error;
    console.error('Error en apiFetch:', error);
    throw error;
  }
};

// Función para manejar el cierre de sesión global (limpiar storage y redirigir)
export const handleGlobalLogout = () => {
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('user');
  
  // Despachar un evento de storage manualmente para que la pestaña actual también reaccione
  // si es necesario, aunque aquí usualmente redirigimos.
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
};
