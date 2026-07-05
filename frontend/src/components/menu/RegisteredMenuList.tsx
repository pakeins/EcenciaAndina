import { Button } from '@/components/ui/button';

export interface DailyMenu {
  fecha: string;
  estado: 'activo' | 'inactivo';
  imagen_url: string | null;
  entradas?: string[];
  sopas: string[];
  segundos: string[];
  postres?: string[];
  bebidas?: string[];
  guarniciones: string[];
  opciones: number;
  enviado?: boolean;
  sent_at?: string | null;
  send_count?: number;
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

const menuStatusClassName = (menu: DailyMenu) => {
  if (menu.enviado) return 'rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700';
  if (menu.estado === 'activo') return 'rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700';
  return 'rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground';
};

const menuStatusLabel = (menu: DailyMenu) => {
  if (menu.enviado) return 'Enviado';
  if (menu.estado === 'activo') return 'Activo';
  return 'Inactivo';
};

export function RegisteredMenuList({
  menus,
  isLoading,
  error,
  isActivating,
  onLoad,
  onActivate,
}: Readonly<RegisteredMenuListProps>) {
  if (isLoading) {
    return (
      <output className="block rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Cargando menus registrados...
      </output>
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
                {menu.opciones} {menu.opciones === 1 ? 'opcion' : 'opciones'}
              </p>
            </div>
            <span className={menuStatusClassName(menu)}>{menuStatusLabel(menu)}</span>
          </div>

          <div className="space-y-1 border-t pt-2">
            {menu.entradas?.length ? <MenuOptions label="Entradas" options={menu.entradas} /> : null}
            <MenuOptions label="Sopas" options={menu.sopas} />
            <MenuOptions label="Platos fuertes" options={menu.segundos} />
            {menu.postres?.length ? <MenuOptions label="Postres" options={menu.postres} /> : null}
            {menu.bebidas?.length ? <MenuOptions label="Bebidas" options={menu.bebidas} /> : null}
            {menu.guarniciones?.length ? <MenuOptions label="Guarniciones" options={menu.guarniciones} /> : null}
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
