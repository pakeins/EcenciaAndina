import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  API_BASE_URL: 'http://test',
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import Convenios from './Convenios';

const jsonResponse = (data: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

const convenios = [
  {
    id: '1',
    nombre_empresa: 'ACME',
    ruc: '1790012345001',
    representante: 'Juan Perez',
    telefono: '',
    email: '',
    fecha_inicio: '2026-01-01',
    fecha_caducidad: '2030-12-31',
    activo: true,
    vigente: true,
    cupo_maximo: 10,
    totalColaboradores: 1,
    consumoMensual: 0,
    archivo_firmado: null,
  },
];

const rejectedClient = {
  id: 'c1',
  cedula: '0102030405',
  nombre: 'Ana',
  apellido: 'Lopez',
  email: 'ana@example.com',
  telefono: '0991112233',
  telegram: { consent_status: 'rejected', is_active: false, has_chat: false, updated_at: null },
};

beforeEach(() => {
  apiFetch.mockReset();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('Convenios (pagina)', () => {
  it('carga y muestra la lista de convenios', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/convenios') return Promise.resolve(jsonResponse(convenios));
      return Promise.resolve(jsonResponse([]));
    });

    render(<Convenios />);

    expect(await screen.findByText('ACME')).toBeInTheDocument();
    expect(screen.getByText(/1790012345001/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/convenios');
  });

  it('al editar muestra los colaboradores y genera la invitacion manual de Telegram', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/convenios') return Promise.resolve(jsonResponse(convenios));
      if (url === '/convenios/1/clientes') return Promise.resolve(jsonResponse([rejectedClient]));
      if (url.endsWith('/telegram-invitacion')) {
        return Promise.resolve(
          jsonResponse({
            inviteLink: 'https://t.me/bot?start=tok',
            invitationMessage: 'Hola Ana, registrate',
            telegramStatus: 'manual_required',
            emailTo: 'ana@example.com',
            emailStatus: 'sent',
          }),
        );
      }
      if (url.endsWith('/clientes/importar')) {
        return Promise.resolve(
          jsonResponse({
            resumen: { totalFilas: 1, creados: 1, vinculados: 0, omitidos: 0, rechazados: 0, invitacionesPendientesManual: 1 },
            resultados: [
              {
                fila: 2,
                cedula: '0606060606',
                nombre: 'Beto',
                apellido: 'Diaz',
                errores: [],
                estado: 'created',
                telegramStatus: 'manual_required',
                invitationMessage: 'Invita a Beto',
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<Convenios />);
    await screen.findByText('ACME');

    // abrir el dialogo de edicion
    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));

    // ir a la pestana de colaboradores (Radix Tabs activa al recibir foco)
    const tab = await screen.findByRole('tab', { name: /Colaboradores/i });
    fireEvent.focus(tab);

    // el contenido del tab debe mostrar al colaborador cargado
    await screen.findByText(/Ana Lopez/i);

    // el colaborador rechazado ofrece generar link manual
    const generar = await screen.findByRole('button', { name: /Reenviar link/i });
    fireEvent.click(generar);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/convenios/1/clientes/c1/telegram-invitacion', { method: 'POST' });
    });

    // se muestra el mensaje de invitacion generado
    expect(await screen.findByText(/Hola Ana, registrate/i)).toBeInTheDocument();
  });

  it('importa colaboradores desde un Excel y permite copiar el mensaje de invitacion', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/convenios') return Promise.resolve(jsonResponse(convenios));
      if (url === '/convenios/1/clientes') return Promise.resolve(jsonResponse([]));
      if (url.endsWith('/clientes/importar')) {
        return Promise.resolve(
          jsonResponse({
            resumen: { totalFilas: 1, creados: 1, vinculados: 0, omitidos: 0, rechazados: 0, invitacionesPendientesManual: 1 },
            resultados: [
              {
                fila: 2,
                cedula: '0606060606',
                nombre: 'Beto',
                apellido: 'Diaz',
                errores: [],
                estado: 'created',
                telegramStatus: 'manual_required',
                invitationMessage: 'Invita a Beto',
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<Convenios />);
    await screen.findByText('ACME');
    fireEvent.click(screen.getByRole('button', { name: /Editar/i }));
    fireEvent.focus(await screen.findByRole('tab', { name: /Colaboradores/i }));

    const fileInput = document.querySelector('input[type="file"][accept=".xlsx"]') as HTMLInputElement;
    const file = new File(['contenido'], 'empleados.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/convenios/1/clientes/importar',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // se renderiza la tabla de resultados de importacion
    expect(await screen.findByText('Beto Diaz')).toBeInTheDocument();

    // copiar el mensaje de invitacion usa el portapapeles
    fireEvent.click(await screen.findByRole('button', { name: /Copiar/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Invita a Beto'));
  });

  it('genera el reporte de consumos de un convenio', async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === '/convenios') return Promise.resolve(jsonResponse(convenios));
      if (url.startsWith('/convenios/1/reporte')) {
        return Promise.resolve(
          jsonResponse([
            {
              empleado: 'Ana Lopez',
              cedula: '0102030405',
              total: 25.5,
              consumos: [{ fecha: '2026-06-10', producto: 'Almuerzo', cantidad: 1, valor: 25.5 }],
            },
          ]),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    render(<Convenios />);
    await screen.findByText('ACME');

    // abrir el dialogo de reporte desde la tarjeta
    fireEvent.click(screen.getByRole('button', { name: /Generar Reporte/i }));

    // generar dentro del dialogo (fechas precargadas por handleOpenReport)
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Generar Reporte/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/convenios/1/reporte?fecha_inicio='));
    });
    expect(await screen.findByText('Total Consumo Mensual')).toBeInTheDocument();
    expect(screen.getByText('Ana Lopez')).toBeInTheDocument();
  });
});
