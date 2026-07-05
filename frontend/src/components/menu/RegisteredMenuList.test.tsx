import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisteredMenuList } from './RegisteredMenuList';
import type { DailyMenu } from './RegisteredMenuList';

const makeMenu = (day: number): DailyMenu => ({
  fecha: `2026-06-${String(day).padStart(2, '0')}`,
  estado: day === 7 ? 'activo' : 'inactivo',
  imagen_url: null,
  sopas: [`Sopa ${day}`],
  segundos: [`Segundo ${day}`],
  guarniciones: [`Guarnicion ${day}`],
  opciones: { '1': [`Sopa ${day}`], '2': [`Segundo ${day}`], '3': [`Guarnicion ${day}`] },
  opciones_count: 3,
});

const defaultProps = {
  isLoading: false,
  error: null,
  isActivating: null,
  onLoad: vi.fn(),
  onActivate: vi.fn(),
};

describe('RegisteredMenuList', () => {
  it('muestra todos los menus con fecha, estado y opciones registradas', () => {
    const menus = Array.from({ length: 7 }, (_, index) => makeMenu(index + 1));

    render(<RegisteredMenuList {...defaultProps} menus={menus} />);

    expect(screen.getAllByRole('article')).toHaveLength(7);
    expect(screen.getAllByText('3 opciones')).toHaveLength(7);
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Sopa 1')).toBeInTheDocument();
    expect(screen.getByText('Segundo 7')).toBeInTheDocument();
    expect(screen.getByText('Guarnicion 4')).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no existen menus', () => {
    render(<RegisteredMenuList {...defaultProps} menus={[]} />);

    expect(screen.getByText('No existen menus registrados.')).toBeInTheDocument();
  });

  it('distingue la carga de una lista vacia', () => {
    render(<RegisteredMenuList {...defaultProps} menus={[]} isLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando menus registrados...');
    expect(screen.queryByText('No existen menus registrados.')).not.toBeInTheDocument();
  });

  it('muestra el error de consulta sin presentarlo como lista vacia', () => {
    render(
      <RegisteredMenuList
        {...defaultProps}
        menus={[]}
        error="No se pudieron cargar los menus registrados."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los menus registrados.');
    expect(screen.queryByText('No existen menus registrados.')).not.toBeInTheDocument();
  });
});
