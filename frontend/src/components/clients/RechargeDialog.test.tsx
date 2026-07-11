import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { RechargeDialog } from './RechargeDialog';
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

describe('RechargeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockClients = [
    { id: 'c1', nombre: 'Juan', apellido: 'Perez', cedula: '1234', id_tipo_cliente: 2, convenio: null },
    { id: 'c2', nombre: 'Ana', apellido: 'Gomez', cedula: '5678', id_tipo_cliente: 1, convenio: { id: 'conv1' } }
  ];

  const mockProducts = [
    { id: 10, nombre: 'Almuerzo Ejecutivo Completo', precio: 3.50 },
    { id: 11, nombre: 'Cola', precio: 1.00 }
  ];

  it('se renderiza correctamente y carga productos', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProducts)
    });

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <RechargeDialog open={true} onOpenChange={vi.fn()} clients={mockClients} />
      );
    });

    expect(screen.getByText('Recargar Monedero')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/productos');
  });

  it('permite recargar saldo correctamente', async () => {
    (apiFetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProducts) // for fetchProducts
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ mensaje: 'Recarga exitosa' }) // for POST /recargar
      });

    const onOpenChange = vi.fn();

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <RechargeDialog open={true} onOpenChange={onOpenChange} clients={mockClients} />
      );
    });

    const selects = screen.getAllByRole('combobox');
    const selectCliente = selects[0]; // Cliente Frecuente is first
    await act(async () => {
      fireEvent.click(selectCliente);
    });
    const optionCliente = await screen.findByText(/Juan Perez/i);
    await act(async () => {
      fireEvent.click(optionCliente);
    });

    const selectProducto = selects[1]; // Producto is second
    await act(async () => {
      fireEvent.click(selectProducto);
    });
    const optionProducto = await screen.findByText(/Almuerzo Ejecutivo Completo/i);
    await act(async () => {
      fireEvent.click(optionProducto);
    });

    const inputFactura = screen.getByPlaceholderText(/Ej: FAC-0042/i);
    await act(async () => {
      fireEvent.change(inputFactura, { target: { value: 'FAC-123' } });
    });

    const btnConfirmar = screen.getByRole('button', { name: /Confirmar Recarga/i });
    await act(async () => {
      fireEvent.click(btnConfirmar);
    });

    expect(apiFetch).toHaveBeenCalledWith('/clientes/c1/recargar', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        id_producto: 10,
        cantidad_comprada: 1,
        monto_total: 0,
        numero_factura: 'FAC-123'
      })
    }));

    expect(toast.success).toHaveBeenCalledWith('Recarga exitosa. El saldo del cliente ha sido actualizado.');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('muestra error si falta informacion', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProducts)
    });

    await act(async () => {
      render(
// @ts-expect-error - mock client
        <RechargeDialog open={true} onOpenChange={vi.fn()} clients={mockClients} />
      );
    });

    const btnConfirmar = screen.getByRole('button', { name: /Confirmar Recarga/i });
    await act(async () => {
      fireEvent.click(btnConfirmar);
    });

    expect(toast.error).toHaveBeenCalledWith('Seleccione un cliente');
    expect(apiFetch).toHaveBeenCalledTimes(1); // Only for fetchProducts
  });
});
