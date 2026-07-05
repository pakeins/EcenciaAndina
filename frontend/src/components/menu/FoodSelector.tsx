import { useState, useEffect } from 'react';
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
import { Alimento } from '@/types';

interface FoodSelectorProps {
  value: string;
  onChange: (value: string) => void;
  idCategoria: number;
  placeholder?: string;
  exclude?: string[];
}


export function FoodSelector({ value, onChange, idCategoria, alimentos: initialAlimentos = [], placeholder = "Seleccionar plato...", exclude = [] }: FoodSelectorProps & { alimentos?: Alimento[] }) {
  const [open, setOpen] = useState(false);
  const [alimentos, setAlimentos] = useState<Alimento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    // Sincronizar alimentos cuando cambian los prop
    setAlimentos(initialAlimentos.filter(a => Number(a.id_categoria) === Number(idCategoria)));
  }, [initialAlimentos, idCategoria]);

  const handleCreateNew = async () => {
    if (!search.trim()) return;

    if ((exclude || []).includes(search.trim())) {
      toast.error(`"${search.trim()}" ya está seleccionado en otra opción`);
      return;
    }

    try {
      const res = await apiFetch('/alimentos', {
        method: 'POST',
        body: JSON.stringify({
          id_categoria: idCategoria,
          nombre: search.trim()
        })
      });

      if (res.ok) {
        const newFood: Alimento = await res.json();
        setAlimentos(prev => [...prev, newFood]);
        onChange(newFood.nombre);
        setOpen(false);
        setSearch("");
        toast.success(`"${newFood.nombre}" añadido al catálogo`);
      }
    } catch (err) {
      toast.error("Error al guardar el nuevo plato");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-12 bg-muted/30 focus:bg-background transition-all border-muted-foreground/20 text-base font-normal"
        >
          {value ? value : placeholder}
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
                <p className="text-sm text-muted-foreground mb-4">No se encontró "{search}"</p>
                <Button 
                  size="sm" 
                  onClick={handleCreateNew}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Añadir "{search}" al catálogo
                </Button>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {alimentos
                .filter(a => !exclude.some(ex => ex.toLowerCase() === a.nombre.toLowerCase()))
                .map((alimento) => (
                <CommandItem
                  key={alimento.id}
                  value={alimento.nombre}
                  onSelect={(currentValue) => {
                    onChange(currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === alimento.nombre ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {alimento.nombre}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
