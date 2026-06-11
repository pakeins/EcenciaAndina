import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TelegramTraceList } from './TelegramTraceList';
import type { TelegramOrderTrace } from './TelegramTraceList';

const trace: TelegramOrderTrace = {
  id: 'trace-1',
  chat_id: '123456',
  update_id: 99,
  id_orden: 'order-1',
  phone_normalized: '593999999999',
  original_message: {
    type: 'text',
    text: 'sopa 1, segundo 2, guarnicion 1',
  },
  interpreted_payload: {
    source: 'text',
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
  it('muestra el mensaje, la interpretacion y el resultado completo', () => {
    render(<TelegramTraceList traces={[trace]} isLoading={false} error={null} />);

    expect(screen.getByText('1. Mensaje recibido')).toBeInTheDocument();
    expect(screen.getAllByText(/sopa 1, segundo 2, guarnicion 1/).length).toBeGreaterThan(0);
    expect(screen.getByText('2. Interpretacion')).toBeInTheDocument();
    expect(screen.getAllByText(/Carne asada/).length).toBeGreaterThan(0);
    expect(screen.getByText('3. Resultado')).toBeInTheDocument();
    expect(screen.getAllByText('Exitoso').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/order-1/).length).toBeGreaterThan(0);
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
