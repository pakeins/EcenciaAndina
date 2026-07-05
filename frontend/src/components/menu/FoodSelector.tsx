import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Alimento } from '@/types';
import { FIELD_LIMITS } from '@/lib/validation';

interface FoodSelectorProps {
  value: string;
  onChange: (value: string) => void;
  idCategoria: number;
  alimentos?: Alimento[];
  placeholder?: string;
  exclude?: string[];
  disabled?: boolean;
  onFoodCreated?: (food: Alimento) => void;
}

const normalizeOption = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function FoodSelector({
  value,
  onChange,
  idCategoria,
  alimentos: initialAlimentos = [],
  placeholder = 'Seleccionar plato...',
  exclude = [],
  disabled = false,
  onFoodCreated,
}: FoodSelectorProps) {
  const [open, setOpen] = useState(false);
  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setAlimentos(initialAlimentos.filter((food) => Number(food.id_categoria) === Number(idCategoria)));
  }, [initialAlimentos, idCategoria]);

  const handleCreateNew = async () => {
    const name = search.trim().replace(/\s+/g, ' ');
    if (!name || isLoading) return;
    if (!Number.isInteger(idCategoria) || idCategoria <= 0) {
      toast.error('La categoría del plato no está disponible. Recarga la página.');
      return;
    }
    if (name.length > FIELD_LIMITS.menuOption) {
      toast.error(`La opción no puede superar ${FIELD_LIMITS.menuOption} caracteres`);
      return;
    }
    if (exclude.some((item) => normalizeOption(item) === normalizeOption(name))) {
      toast.error(`"${name}" ya está seleccionado en otra opción`);
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch('/alimentos', {
        method: 'POST',
        body: JSON.stringify({
          id_categoria: idCategoria,
          nombre: name,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo guardar el nuevo plato.');
      }

      const newFood = data as Alimento;
      setAlimentos((current) => {
        if (current.some((food) => food.id === newFood.id)) return current;
        return [...current, newFood];
      });
      onFoodCreated?.(newFood);
      onChange(newFood.nombre);
      setOpen(false);
      setSearch('');
      toast.success(`"${newFood.nombre}" añadido al catálogo`);
    } catch (error) {
      toast.error('No se pudo guardar el nuevo plato', {
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || idCategoria <= 0}
          className="h-12 w-full justify-between border-muted-foreground/20 bg-muted/30 text-base font-normal transition-all focus:bg-background"
        >
          {value || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar plato..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              <div className="p-4 text-center">
                <p className="mb-4 text-sm text-muted-foreground">No se encontró "{search}"</p>
                <Button
                  size="sm"
                  onClick={handleCreateNew}
                  disabled={isLoading || !search.trim()}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {isLoading ? 'Guardando...' : `Añadir "${search}" al catálogo`}
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {alimentos
                .filter(
                  (food) => !exclude.some((item) => normalizeOption(item) === normalizeOption(food.nombre)),
                )
                .map((food) => (
                  <CommandItem
                    key={food.id}
                    value={food.nombre}
                    onSelect={() => {
                      onChange(food.nombre);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === food.nombre ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {food.nombre}
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
