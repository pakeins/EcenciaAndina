import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TelegramTraceList } from './TelegramTraceList';
import type { TelegramOrderTrace } from './TelegramTraceList';

const trace: TelegramOrderTrace = {
  id: 'trace-1',
  chat_id: '123456',
  update_id: 99,
  id_orden: 'order-1',
  original_message: {
    type: 'callback',
    callbackAction: 'confirm',
  },
  interpreted_payload: {
    source: 'buttons',
    step: 'completed',
    sopa: 'Locro',
    segundo: 'Carne asada',
    guarnicion: 'Arroz',
  },
  outcome: 'success',
  error_message: null,
  created_at: '2026-06-10T15:00:00Z',
  updated_at: '2026-06-10T15:00:01Z',
  clientes: { nombre: 'Ana', apellido: 'Perez' },
};

describe('TelegramTraceList', () => {
  it('muestra metadatos, interpretacion y resultado sin texto libre', () => {
    render(<TelegramTraceList traces={[trace]} isLoading={false} error={null} />);

    expect(screen.getAllByText(/confirm/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Paso: completed \| Sopa: Locro/i)).toBeInTheDocument();
    expect(screen.getAllByText('Exitoso').length).toBeGreaterThan(0);
  });

  it('muestra un mensaje cuando no existe historial', () => {
    render(<TelegramTraceList traces={[]} isLoading={false} error={null} />);
    expect(screen.getByText('No existen registros de trazabilidad.')).toBeInTheDocument();
  });

  it('diferencia un error de consulta de un historial vacio', () => {
    render(
      <TelegramTraceList
        traces={[]}
        isLoading={false}
        error="No se pudo consultar la trazabilidad."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo consultar la trazabilidad.');
    expect(screen.queryByText('No existen registros de trazabilidad.')).not.toBeInTheDocument();
  });
});
