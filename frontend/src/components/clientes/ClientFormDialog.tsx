import { useState, useEffect } from 'react';
import { Client, Convenio } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { FIELD_LIMITS, isValidEcDocument, isValidEmail, onlyDigits } from '@/lib/validation';
import { CLIENT_TYPE } from '@/constants/domain';

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClient: Client | null;
  clientTypes: any[];
  convenios: Convenio[];
  isAdmin: boolean;
  onSuccess: (data: any, isNew: boolean) => void;
}

export function ClientFormDialog({
  open,
  onOpenChange,
  editingClient,
  clientTypes,
  convenios,
  isAdmin,
  onSuccess
}: ClientFormDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    cedula: '',
    nombre: '',
    apellido: '',
    telefono: '',
    correo: '',
    id_tipo_cliente: CLIENT_TYPE.DIRECT,
    id_convenio: '',
  });

  useEffect(() => {
    if (open) {
      if (editingClient) {
        setFormData({
          cedula: editingClient.cedula,
          nombre: editingClient.nombre,
          apellido: editingClient.apellido,
          telefono: editingClient.telefono || '',
          correo: editingClient.correo,
          id_tipo_cliente: editingClient.id_tipo_cliente || CLIENT_TYPE.DIRECT,
          id_convenio: editingClient.convenio?.id || '',
        });
      } else {
        setFormData({
          cedula: '',
          nombre: '',
          apellido: '',
          telefono: '',
          correo: '',
          id_tipo_cliente: CLIENT_TYPE.DIRECT,
          id_convenio: '',
        });
      }
    }
  }, [open, editingClient]);

  const handleSave = async () => {
    if (!formData.cedula || !formData.nombre || !formData.apellido || !formData.correo) {
      toast.error('Cedula, nombre, apellido y correo son requeridos');
      return;
    }

    if (formData.cedula.length !== 10 || !isValidEcDocument(formData.cedula)) {
      toast.error('Ingrese una cedula valida de 10 digitos');
      return;
    }
    if (formData.nombre.trim().length > FIELD_LIMITS.nombre || formData.apellido.trim().length > FIELD_LIMITS.nombre) {
      toast.error(`Nombre y apellido no pueden superar ${FIELD_LIMITS.nombre} caracteres`);
      return;
    }
    if (formData.telefono && formData.telefono.length !== 10) {
      toast.error('El telefono debe tener exactamente 10 digitos');
      return;
    }
    if (!isValidEmail(formData.correo)) {
      toast.error('Ingrese un correo electronico valido');
      return;
    }
    if (formData.id_tipo_cliente === CLIENT_TYPE.AGREEMENT && !formData.id_convenio) {
      toast.error('Debe seleccionar un convenio activo para un Cliente Convenio');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        cedula: onlyDigits(formData.cedula),
        telefono: onlyDigits(formData.telefono),
        correo: formData.correo.trim().toLowerCase(),
        id_convenio: formData.id_tipo_cliente === CLIENT_TYPE.AGREEMENT
          ? formData.id_convenio || null
          : null,
      };
      if (editingClient) {
        const response = await apiFetch(`/clientes/${editingClient.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (response.ok) {
          toast.success('Cliente actualizado correctamente');
          onSuccess(data, false);
          onOpenChange(false);
        } else {
          toast.error(data.error || 'Error al actualizar el cliente');
        }
      } else {
        const response = await apiFetch('/clientes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await response.json();

        if (response.ok) {
          toast.success('Cliente registrado correctamente');
          onSuccess(data, true);
          onOpenChange(false);
        } else {
          toast.error(data.error || 'Error al crear el cliente');
        }
      }
    } catch (err) {
      console.error('Error guardando cliente:', err);
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
          </DialogTitle>
          <DialogDescription>
            {editingClient ? 'Modifique los datos del cliente' : 'Registre un nuevo cliente'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="cedula">Cédula *</Label>
            <Input
              id="cedula"
              value={formData.cedula}
              onChange={(e) => setFormData({ ...formData, cedula: e.target.value.replace(/\D/g, '') })}
              placeholder="Ej: 1712345678"
              maxLength={10}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="correo">Correo electrónico *</Label>
            <Input
              id="correo"
              type="email"
              value={formData.correo}
              onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
              placeholder="cliente@example.test"
              maxLength={FIELD_LIMITS.email}
              autoComplete="email"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '') })}
                placeholder="Nombre del cliente"
                maxLength={FIELD_LIMITS.nombre}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apellido">Apellido *</Label>
              <Input
                id="apellido"
                value={formData.apellido}
                onChange={(e) => setFormData({ ...formData, apellido: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '') })}
                placeholder="Apellido del cliente"
                maxLength={FIELD_LIMITS.nombre}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value.replace(/\D/g, '') })}
                placeholder="Ej: 0999999999"
                maxLength={10}
                inputMode="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Cliente</Label>
              <Select
                value={String(formData.id_tipo_cliente)}
                disabled={!isAdmin}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    id_tipo_cliente: Number.parseInt(value),
                    id_convenio: Number.parseInt(value) === CLIENT_TYPE.AGREEMENT
                      ? formData.id_convenio || (convenios.length > 0 ? convenios[0].id : '')
                      : '',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {clientTypes
                    .filter((tipo) => isAdmin || tipo.id_tipo_cliente === CLIENT_TYPE.DIRECT)
                    .map((tipo) => (
                    <SelectItem key={tipo.id_tipo_cliente} value={String(tipo.id_tipo_cliente)}>
                      {tipo.nombre_tipo}
                    </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isAdmin && formData.id_tipo_cliente === CLIENT_TYPE.AGREEMENT && (
            <div className="space-y-2">
              <Label htmlFor="convenio">Convenio</Label>
              <Select
                value={formData.id_convenio || ''}
                onValueChange={(value) =>
                  setFormData({ ...formData, id_convenio: value })
                }
              >
                <SelectTrigger id="convenio">
                  <SelectValue placeholder="Seleccione un convenio" />
                </SelectTrigger>
                <SelectContent>
                  {convenios.map((convenio) => (
                    <SelectItem key={convenio.id} value={convenio.id}>
                      {convenio.nombre_empresa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Solo los clientes de tipo convenio pueden vincularse a una empresa.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">
            {isSaving
              ? editingClient
                ? 'Guardando...'
                : 'Registrando...'
              : editingClient
                ? 'Guardar Cambios'
                : 'Registrar Cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
