import { Button } from '@/components/ui/button';

export interface DailyMenu {
  fecha: string;
  estado: 'activo' | 'inactivo';
  imagen_url: string | null;
  sopas: string[];
  segundos: string[];
  guarniciones: string[];
  opciones: Record<string, string[]>;
  opciones_count: number;
}

interface RegisteredMenuListProps {
  menus: DailyMenu[];
  isLoading: boolean;
  error: string | null;
  isActivating: string | null;
  onLoad: (menu: DailyMenu) => void;
  onActivate: (menu: DailyMenu) => void;
}

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const MenuOptions = ({ label, options }: { label: string; options: string[] }) => (
  <p className="text-xs leading-relaxed text-muted-foreground">
    <span className="font-semibold text-foreground">{label}:</span>{' '}
    {options.length ? options.join(', ') : 'Sin opciones'}
  </p>
);

export function RegisteredMenuList({
  menus,
  isLoading,
  error,
  isActivating,
  onLoad,
  onActivate,
}: RegisteredMenuListProps) {
  if (isLoading) {
    return (
      <div role="status" className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Cargando menus registrados...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!menus.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No existen menus registrados.
      </div>
    );
  }

  return (
    <div aria-label="Lista de menus registrados" className="max-h-[36rem] space-y-3 overflow-y-auto pr-1">
      {menus.map((menu) => (
        <article key={menu.fecha} className="space-y-3 rounded-lg border bg-background p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-cafe">{formatDate(menu.fecha)}</p>
              <p className="text-xs text-muted-foreground">
                {menu.opciones_count} {menu.opciones_count === 1 ? 'opcion' : 'opciones'}
              </p>
            </div>
            <span
              className={
                menu.estado === 'activo'
                  ? 'rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700'
                  : 'rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground'
              }
            >
              {menu.estado === 'activo' ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          <div className="space-y-1 border-t pt-2">
            <MenuOptions label="Sopas" options={menu.sopas} />
            <MenuOptions label="Segundos" options={menu.segundos} />
            <MenuOptions label="Guarniciones" options={menu.guarniciones} />
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => onLoad(menu)}>
              Cargar
            </Button>
            <Button
              size="sm"
              variant={menu.estado === 'activo' ? 'secondary' : 'default'}
              className="flex-1"
              disabled={menu.estado === 'activo' || isActivating === menu.fecha}
              onClick={() => onActivate(menu)}
            >
              {isActivating === menu.fecha ? 'Activando...' : 'Activar'}
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
