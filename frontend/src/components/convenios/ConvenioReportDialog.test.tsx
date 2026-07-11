import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { ConvenioReportDialog } from './ConvenioReportDialog';

describe('ConvenioReportDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    reportConvenio: { id: 'c1', nombre_empresa: 'Empresa Test' } as any,
    reportDates: { desde: '2023-01-01', hasta: '2023-01-31' },
    setReportDates: vi.fn(),
    reportData: [
      {
        empleado: 'Juan Perez',
        cedula: '1234567890',
        total: 15.5,
        consumos: [
          { fecha: '2023-01-10', producto: 'Almuerzo Ejecutivo', cantidad: 1, valor: 3.5 }
        ]
      }
    ],
    setReportData: vi.fn(),
    isGeneratingReport: false,
    onGenerateReport: vi.fn(),
    onExportReportPDF: vi.fn(),
  };

  it('se renderiza correctamente y muestra datos', () => {
    render(<ConvenioReportDialog {...defaultProps} />);
    expect(screen.getByText(/Reporte de Consumos - Empresa Test/i)).toBeInTheDocument();
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    expect(screen.getByText(/C\.I: 1234567890/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$15\.50/i)[0]).toBeInTheDocument();
  });

  it('llama a onGenerateReport al presionar botón de generar', async () => {
    render(<ConvenioReportDialog {...defaultProps} />);
    
    const btnGenerate = screen.getByRole('button', { name: /Generar Reporte/i });
    await act(async () => {
      fireEvent.click(btnGenerate);
    });

    expect(defaultProps.setReportData).toHaveBeenCalledWith([]);
    expect(defaultProps.onGenerateReport).toHaveBeenCalled();
  });

  it('llama a onExportReportPDF al presionar botón de exportar', async () => {
    render(<ConvenioReportDialog {...defaultProps} />);
    
    const btnExport = screen.getByRole('button', { name: /Exportar \/ Imprimir/i });
    await act(async () => {
      fireEvent.click(btnExport);
    });

    expect(defaultProps.onExportReportPDF).toHaveBeenCalled();
  });
});
