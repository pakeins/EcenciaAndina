import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { WalletDialog } from './WalletDialog';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  }
}));

describe('WalletDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockClient = { id: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '1234', id_tipo_cliente: 2, convenio: null };

  const mockBalances = [
    { productos: { nombre_producto: 'Almuerzo Ejecutivo' }, cantidad_disponible: 5 }
  ];

  const mockHistorial = [
    {
      tipo: 'recarga',
      fecha: '2023-10-01T10:00:00Z',
      producto: 'Almuerzo Ejecutivo',
      cantidad: 5,
      monto_total: 15.00,
      numero_factura: 'FAC-001',
      registrado_por: 'Admin',
      referencia: 'Recarga manual'
    },
    {
      tipo: 'consumo',
      fecha: '2023-10-02T12:00:00Z',
      producto: 'Almuerzo Ejecutivo',
      cantidad: 1,
      precio_aplicado: 3.00,
      registrado_por: 'Cajero',
      referencia: 'Pedido #123'
    }
  ];

  it('se renderiza correctamente y carga saldos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBalances)
    });

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <WalletDialog open={true} onOpenChange={vi.fn()} client={mockClient} />
      );
    });

    expect(screen.getByText('Monedero Virtual')).toBeInTheDocument();
    expect(screen.getByText('Almuerzo Ejecutivo')).toBeInTheDocument();
    expect(screen.getByText('5 und.')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/clientes/c1/saldo');
  });

  it('muestra mensaje si no hay saldos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    });

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <WalletDialog open={true} onOpenChange={vi.fn()} client={mockClient} />
      );
    });

    expect(screen.getByText('El cliente no tiene saldos disponibles.')).toBeInTheDocument();
  });

  it('carga y muestra el historial al cambiar de tab', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBalances)
      }) // for saldos
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockHistorial)
      }); // for historial

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <WalletDialog open={true} onOpenChange={vi.fn()} client={mockClient} />
      );
    });

    const btnHistorial = screen.getByRole('button', { name: /Historial/i });
    await act(async () => {
      fireEvent.click(btnHistorial);
    });

    expect(apiFetch).toHaveBeenCalledWith('/clientes/c1/historial');
    expect(screen.getByText('Recargas y Consumos')).toBeInTheDocument();
    
    // Check if historial items are rendered
    const items = screen.getAllByText(/Almuerzo Ejecutivo/i);
    expect(items.length).toBeGreaterThan(0);
    expect(screen.getByText('FAC: FAC-001')).toBeInTheDocument();
  });

  it('maneja errores al cargar saldos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <WalletDialog open={true} onOpenChange={vi.fn()} client={mockClient} />
      );
    });

    expect(toast.error).toHaveBeenCalledWith('Error al cargar saldos');
  });

  it('maneja errores al cargar historial', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBalances)
      }) // for saldos
      .mockRejectedValueOnce(new Error('Network error')); // for historial

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <WalletDialog open={true} onOpenChange={vi.fn()} client={mockClient} />
      );
    });

    const btnHistorial = screen.getByRole('button', { name: /Historial/i });
    await act(async () => {
      fireEvent.click(btnHistorial);
    });

    expect(toast.error).toHaveBeenCalledWith('Error al cargar historial');
  });
});
