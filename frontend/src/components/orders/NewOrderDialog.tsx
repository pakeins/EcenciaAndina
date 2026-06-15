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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, X } from 'lucide-react';
import { OrderFormFields, OrderFormState } from './OrderFormFields';
import { toast } from 'sonner';
import { FIELD_LIMITS, isValidEcDocument, isValidEmail, isValidPhone, normalizePhone, onlyDigits } from '@/lib/validation';
import { CLIENT_TYPE, ORDER_SOURCE, ORDER_STATE } from '@/constants/domain';
import { useAuth } from '@/contexts/AuthContext';

const formSchema = z.object({
  clientMode: z.enum(['existing', 'new']),
  clienteId: z.string().optional(),
  cedula: z.string().optional(),
  nombre: z.string().optional(),
  apellido: z.string().optional(),
  correo: z.string().optional(),
  appMensajeria: z.string().optional(),
  tipoCliente: z.enum(['cliente', 'convenio']),
  convenioId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.clientMode === 'existing') {
    if (!data.clienteId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Seleccione un cliente", path: ["clienteId"] });
    }
  } else {
    if (!data.cedula || !isValidEcDocument(data.cedula)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ingrese una cedula o RUC ecuatoriano valido", path: ["cedula"] });
    }
    if (!data.nombre || data.nombre.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El nombre es requerido", path: ["nombre"] });
    }
    if (data.nombre && data.nombre.trim().length > FIELD_LIMITS.nombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nombre demasiado largo", path: ["nombre"] });
    }
    if (!data.apellido || data.apellido.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El apellido es requerido", path: ["apellido"] });
    }
    if (data.apellido && data.apellido.trim().length > FIELD_LIMITS.nombre) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Apellido demasiado largo", path: ["apellido"] });
    }
    if (!data.correo || !isValidEmail(data.correo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ingrese un correo valido", path: ["correo"] });
    }
    if (data.appMensajeria && !isValidPhone(data.appMensajeria)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Telefono invalido", path: ["appMensajeria"] });
    }
    if (data.tipoCliente === 'convenio' && !data.convenioId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Seleccione el convenio", path: ["convenioId"] });
    }
  }
});

type FormValues = z.infer<typeof formSchema>;

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (order: Order) => void;
}

export function NewOrderDialog({ open, onOpenChange, onCreate }: NewOrderDialogProps) {
  const { user } = useAuth();
  const isAdmin = user?.rol === 'administrador';
  const { clientes, convenios, isLoading, refetchClients } = useClientsAndConvenios();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      clientMode: 'existing',
      clienteId: '',
      cedula: '',
      nombre: '',
      apellido: '',
      correo: '',
      appMensajeria: '',
      tipoCliente: 'cliente',
      convenioId: '',
    }
  });

  const { watch, handleSubmit, reset, control, setValue, formState: { errors } } = form;

  const clientMode = watch('clientMode');
  const tipoCliente = watch('tipoCliente');
  const clienteId = watch('clienteId');

  const [state, setState] = useState<OrderFormState>({
    items: [],
    observaciones: '',
  });

  const [availableBalances, setAvailableBalances] = useState<Record<string, number> | null>(null);



  useEffect(() => {
    if (open) {
      reset({
        clientMode: 'existing',
        clienteId: '',
        cedula: '',
        nombre: '',
        apellido: '',
        correo: '',
        appMensajeria: '',
        tipoCliente: 'cliente',
        convenioId: '',
      });
      setState({
        items: [],
        observaciones: '',
      });

    }
  }, [open, reset]);

  const selectedClient = clientes.find((c) => c.id === clienteId);
  const effectiveTipoCliente: ClientType = clientMode === 'existing'
    ? selectedClient?.convenio
      ? 'convenio'
      : 'cliente'
    : (tipoCliente as ClientType);
  const showProductos = effectiveTipoCliente === 'convenio';

  const isClientSelected = (clientMode === 'existing' && !!clienteId) || (clientMode === 'new' && !!tipoCliente && !!watch('cedula'));
  const isFrecuente = clientMode === 'existing'
    ? !selectedClient?.convenio && selectedClient?.id_tipo_cliente === CLIENT_TYPE.DIRECT
    : tipoCliente === 'cliente';

  const showOrderForm = isClientSelected;
  const blockMessage = isClientSelected ? '' : 'Seleccione un cliente para continuar con el pedido.';

  const [isSaving, setIsSaving] = useState(false);

  const onSubmit = async (data: FormValues) => {
    let finalClienteId = '';

    if (data.clientMode === 'existing') {
      finalClienteId = data.clienteId!;
    } else {
      const cedulaNormalizada = onlyDigits(data.cedula || '');
      const telefonoNormalizado = normalizePhone(data.appMensajeria || '');
      const cedulaExists = clientes.some((c) => c.cedula === cedulaNormalizada);
      if (cedulaExists) {
        toast.error('Ya existe un cliente registrado con esta cédula o RUC');
        form.setError('cedula', { type: 'manual', message: 'Cédula ya registrada' });
        return;
      }

      setIsSaving(true);
      try {
        let createRes;
        if (data.tipoCliente === 'convenio' && isAdmin) {
          createRes = await apiFetch(`/convenios/${data.convenioId}/clientes/nuevo`, {
            method: 'POST',
            body: JSON.stringify({
              cedula: cedulaNormalizada,
              nombre: data.nombre,
              apellido: data.apellido,
              correo: data.correo?.trim().toLowerCase(),
              telefono: telefonoNormalizado
            })
          });
        } else {
          createRes = await apiFetch('/clientes', {
            method: 'POST',
            body: JSON.stringify({
              cedula: cedulaNormalizada,
              nombre: data.nombre,
              apellido: data.apellido,
              correo: data.correo?.trim().toLowerCase(),
              telefono: telefonoNormalizado,
              id_tipo_cliente: CLIENT_TYPE.DIRECT,
            })
          });
        }

        if (!createRes.ok) {
          const errData = await createRes.json();
          toast.error(errData.error || 'Error al registrar el nuevo cliente');
          setIsSaving(false);
          return;
        }

        const newClientData = await createRes.json();
        finalClienteId = newClientData.id;
        refetchClients(); // Actualizar caché de React Query
      } catch (err) {
        toast.error('Error de conexión al crear el cliente');
        setIsSaving(false);
        return;
      }
    }

    if (state.items.length === 0) {
      toast.error('Agregue al menos un producto al pedido');
      setIsSaving(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch('/ordenes', {
        method: 'POST',
        body: JSON.stringify({
          id_cliente: finalClienteId,
          id_estado: ORDER_STATE.RESERVED,
          id_origen: ORDER_SOURCE.SYSTEM,
          canal_origen: 'Sistema',
          metodo_pago: (clientMode === 'existing' && (!selectedClient?.convenio && selectedClient?.id_tipo_cliente === CLIENT_TYPE.DIRECT)) || (clientMode === 'new' && tipoCliente === 'cliente') ? 'Saldo Prepago' : 'Convenio Empresa',
          observaciones: state.observaciones,
          detalles: state.items.map(item => {
            const opciones: Record<string, string> = {};
            if (item.sopa) opciones.sopa = item.sopa;
            if (item.segundo) opciones.segundo = item.segundo;
            if (item.guarnicion) opciones.guarnicion = item.guarnicion;
            return {
              id_producto: item.id_producto,
              cantidad: item.cantidad,
              precio_aplicado: item.precio,
              opciones
            };
          })
        })
      });

      if (response.ok) {
        toast.success('Pedido registrado exitosamente en la base de datos');
        onCreate({} as Order);
        onOpenChange(false);
      } else {
        const errorData = await response.json() as { error?: string };
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
              {clientMode === 'new' && <span className="text-xs font-bold text-white bg-oro px-2 py-0.5 rounded-full shadow-sm">Nuevo</span>}
            </Label>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                {clientMode === 'existing' ? (
                  <div className="space-y-1">
                    <Controller
                      name="clienteId"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className={`bg-background text-cafe ${errors.clienteId ? 'border-destructive' : ''}`}>
                            <SelectValue placeholder={isLoading ? "Cargando clientes..." : "Buscar cliente por nombre o teléfono…"} />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-border shadow-xl">
                            {clientes
                              .filter((c) => c.activo)
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nombre} {c.apellido} — {c.telefono || 'Sin Teléfono'}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.clienteId && <span className="text-xs text-destructive">{errors.clienteId.message}</span>}
                  </div>
                ) : (
                  <div className="h-10 flex items-center px-3 border rounded-md bg-muted/20 text-sm text-muted-foreground">
                    Completando datos de nuevo cliente...
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="default"
                size="icon"
                className={cn("shrink-0", clientMode === 'existing' ? "bg-cafe hover:bg-cafe/90" : "bg-destructive hover:bg-destructive/90")}
                onClick={() => {
                  setValue('clientMode', clientMode === 'existing' ? 'new' : 'existing');
                  setValue('clienteId', '');
                }}
                title={clientMode === 'existing' ? 'Crear Nuevo Cliente' : 'Cancelar creación'}
              >
                {clientMode === 'existing' ? <UserPlus className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </div>

            {clientMode === 'new' && (
              <div className="grid gap-4 md:grid-cols-2 pt-2 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-cafe/70">Cédula *</Label>
                  <Input {...form.register('cedula')} placeholder="Ej: 1712345678" maxLength={13} inputMode="numeric" className={`bg-background ${errors.cedula ? 'border-destructive' : ''}`} />
                  {errors.cedula && <span className="text-xs text-destructive">{errors.cedula.message}</span>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-cafe/70">Nombre *</Label>
                  <Input {...form.register('nombre')} placeholder="Ej: Juan" maxLength={FIELD_LIMITS.nombre} className={`bg-background ${errors.nombre ? 'border-destructive' : ''}`} />
                  {errors.nombre && <span className="text-xs text-destructive">{errors.nombre.message}</span>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-cafe/70">Apellido *</Label>
                  <Input {...form.register('apellido')} placeholder="Ej: Pérez" maxLength={FIELD_LIMITS.nombre} className={`bg-background ${errors.apellido ? 'border-destructive' : ''}`} />
                  {errors.apellido && <span className="text-xs text-destructive">{errors.apellido.message}</span>}
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs text-cafe/70">Correo electrónico *</Label>
                  <Input
                    type="email"
                    {...form.register('correo')}
                    placeholder="cliente@example.test"
                    maxLength={FIELD_LIMITS.email}
                    className={`bg-background ${errors.correo ? 'border-destructive' : ''}`}
                  />
                  {errors.correo && <span className="text-xs text-destructive">{errors.correo.message}</span>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-cafe/70">App de Mensajería</Label>
                  <Input {...form.register('appMensajeria')} placeholder="099..." maxLength={16} inputMode="tel" className="bg-background" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-cafe/70">Tipo de Cliente</Label>
                  <Controller
                    name="tipoCliente"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => {
                        field.onChange(v);
                        if (v === 'cliente') setValue('convenioId', '');
                      }}>
                        <SelectTrigger className="bg-background text-cafe">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cliente">Cliente Frecuente</SelectItem>
                          {isAdmin && (
                            <SelectItem value="convenio">Cliente de convenio</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                {tipoCliente === 'convenio' && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <Label className="text-xs text-cafe/70">Seleccione el Convenio</Label>
                    <Controller
                      name="convenioId"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className={`bg-background ${errors.convenioId ? 'border-destructive' : ''}`}>
                            <SelectValue placeholder={isLoading ? "Cargando..." : "Seleccionar"} />
                          </SelectTrigger>
                          <SelectContent>
                            {convenios
                              .filter((c) => c.activo)
                              .map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.nombre_empresa}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {errors.convenioId && <span className="text-xs text-destructive">{errors.convenioId.message}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {showOrderForm ? (
            <OrderFormFields state={state} onChange={setState} showProductos={showProductos} isFrecuente={isFrecuente} />
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
