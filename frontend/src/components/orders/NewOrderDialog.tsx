import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ClientType, Order } from '@/types';
import { apiFetch } from '@/lib/api';
import { useClientsAndConvenios } from '@/hooks/useClientsAndConvenios';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { UserPlus, X, Check, ChevronsUpDown } from 'lucide-react';
import { OrderFormFields, OrderFormState } from './OrderFormFields';
import { toast } from 'sonner';

const formSchema = z.object({
  clienteId: z.string().min(1, "Seleccione un cliente"),
});

type FormValues = z.infer<typeof formSchema>;

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (order: Order) => void;
}

export function NewOrderDialog({ open, onOpenChange, onCreate }: NewOrderDialogProps) {
  const { clientes, convenios, isLoading, refetchClients } = useClientsAndConvenios();
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clienteId: '',
    }
  });

  const { handleSubmit, reset, control, formState: { errors } } = form;
  
  const clienteId = form.watch('clienteId');

  const [openCombobox, setOpenCombobox] = useState(false);

  const [state, setState] = useState<OrderFormState>({
    items: [],
    observaciones: '',
  });

  const [availableBalances, setAvailableBalances] = useState<Record<string, number> | null>(null);



  useEffect(() => {
    if (open) {
      reset({
        clienteId: '',
      });
      setState({
        items: [],
        observaciones: '',
      });

    }
  }, [open, reset]);

  const selectedClient = clientes.find((c) => c.id === clienteId);
  const showOrderForm = !!clienteId;
  const blockMessage = showOrderForm ? '' : 'Seleccione un cliente para continuar con el pedido.';

  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (data: FormValues) => {
    if (state.items.length === 0) {
      toast.error('Agregue al menos un producto al pedido');
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch('/ordenes', {
        method: 'POST',
        body: JSON.stringify({
          id_cliente: data.clienteId,
          id_estado: 1, // 'Reservado' - Assuming ID 1
          id_origen: 2,
          canal_origen: 'Sistema',
          metodo_pago: (!selectedClient?.convenio && selectedClient?.id_tipo_cliente === 2) ? 'Saldo Prepago' : 'Convenio Empresa',
          observaciones: state.observaciones,
          detalles: state.items.map(item => {
            return {
              id_producto: item.id_producto,
              cantidad: item.cantidad,
              precio_aplicado: item.precio,
              opciones: item.opciones || {}
            };
          })
        })
      });

      if (response.ok) {
        toast.success('Pedido registrado exitosamente en la base de datos');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onCreate({} as any); // Refresh or handle local update if needed
        onOpenChange(false);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errorData: any = await response.json();
        toast.error(`Error al guardar: ${errorData.error}`);
      }
    } catch (err) {
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Nuevo Pedido</DialogTitle>
          <DialogDescription>Registre un pedido manualmente</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, () => toast.error('Complete los datos obligatorios del cliente'))} className="space-y-6 py-4">
          {/* Cliente */}
          <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/5">
            <Label className="text-sm font-semibold text-cafe flex items-center gap-2">
              Cliente
            </Label>
            
            <div className="space-y-1">
              <Controller
                name="clienteId"
                control={control}
                render={({ field }) => (
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className={cn(
                          "w-full justify-between bg-background text-cafe font-normal",
                          errors.clienteId && "border-destructive"
                        )}
                      >
                        {field.value
                          ? (() => {
                              const c = clientes.find((c) => c.id === field.value);
                              return c ? `${c.nombre} ${c.apellido} — ${c.telefono || 'Sin Teléfono'}` : "Buscar cliente por nombre o teléfono…";
                            })()
                          : (isLoading ? "Cargando clientes..." : "Buscar cliente por nombre o teléfono…")}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-white border border-border shadow-xl" align="start">
                      <Command>
                        <CommandInput placeholder="Escribe nombre o teléfono..." />
                        <CommandList>
                          <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                          <CommandGroup>
                            {clientes
                              .filter((c) => c.activo)
                              .map((c) => (
                                <CommandItem
                                  key={c.id}
                                  value={`${c.nombre} ${c.apellido} ${c.telefono || ''}`}
                                  onSelect={() => {
                                    field.onChange(c.id);
                                    setOpenCombobox(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      field.value === c.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {c.nombre} {c.apellido} — {c.telefono || 'Sin Teléfono'}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.clienteId && <span className="text-xs text-destructive">{errors.clienteId.message}</span>}
            </div>
          </div>

          {showOrderForm ? (
            <OrderFormFields state={state} onChange={setState} />
          ) : (
            <div className="p-8 border-2 border-dashed rounded-xl bg-muted/10 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-muted-foreground">{blockMessage}</p>
            </div>
          )}
          
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!showOrderForm || isSaving} className="flex-1 bg-cafe hover:bg-cafe/90 h-12 text-lg font-bold shadow-lg shadow-cafe/20 transition-all hover:scale-[1.02]">
              {isSaving ? 'Guardando...' : 'Crear Pedido'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
