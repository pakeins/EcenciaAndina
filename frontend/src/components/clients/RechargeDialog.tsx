import { useEffect, useState } from 'react';
import { Client, Alimento } from '@/types';
import { apiFetch } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Banknote, Receipt } from 'lucide-react';
import { FIELD_LIMITS, isPositiveInteger } from '@/lib/validation';
import { CLIENT_TYPE } from '@/constants/domain';

interface RechargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: Client[];
}

export function RechargeDialog({ open, onOpenChange, clients }: RechargeDialogProps) {
  const [products, setProducts] = useState<Alimento[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [selectedClient, setSelectedClient] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [numeroFactura, setNumeroFactura] = useState<string>('');

  useEffect(() => {
    if (open) {
      fetchProducts();
      setSelectedClient('');
      setSelectedProduct('');
      setCantidad(1);
      setNumeroFactura('');
    }
  }, [open]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/productos');
      if (response.ok) {
        const data = await response.json();
        const OFFICIAL_LUNCHES = [
          'Almuerzo Ejecutivo Completo',
          'Almuerzo Ejecutivo Sin Sopa',
          'Almuerzo Ejecutivo Simple',
          'Almuerzo del Dia',
          'Almuerzo del Dia Simple'
        ];
        const almuerzos = data.filter((p: Alimento) =>
          OFFICIAL_LUNCHES.includes(p.nombre)
        );
        setProducts(almuerzos);
      }
    } catch (err) {
      toast.error('Error al cargar productos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecargar = async () => {
    if (!selectedClient) {
      toast.error('Seleccione un cliente');
      return;
    }
    if (!selectedProduct) {
      toast.error('Seleccione un producto para recargar');
      return;
    }
    if (!isPositiveInteger(cantidad) || cantidad > 1000) {
      toast.error('Ingrese una cantidad valida entre 1 y 1000');
      return;
    }
    if (!numeroFactura.trim()) {
      toast.error('El numero de factura es requerido para trazabilidad');
      return;
    }
    if (numeroFactura.trim().length > FIELD_LIMITS.factura) {
      toast.error(`La factura no puede superar ${FIELD_LIMITS.factura} caracteres`);
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`/clientes/${selectedClient}/recargar`, {
        method: 'POST',
        body: JSON.stringify({
          id_producto: Number.parseInt(selectedProduct),
          cantidad_comprada: cantidad,
          monto_total: 0, // El monto lo maneja caja
          numero_factura: numeroFactura.trim(),
        })
      });

      if (response.ok) {
        toast.success('Recarga exitosa. El saldo del cliente ha sido actualizado.');
        onOpenChange(false);
      } else {
        const data = await response.json();
        toast.error(data.error || 'Error al procesar recarga');
      }
    } catch (err) {
      toast.error('Error de conexión con el servidor');
    } finally {
      setIsSaving(false);
    }
  };

  // Solo mostrar clientes frecuentes (sin convenio)
  const frequentClients = clients.filter(
    (client) => !client.convenio && client.id_tipo_cliente === CLIENT_TYPE.DIRECT,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cafe">
            <Banknote className="h-5 w-5" />
            Recargar Monedero
          </DialogTitle>
          <DialogDescription>
            Agrega saldo prepago a la cuenta de un cliente frecuente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Número de Factura — destacado al tope */}
          <div className="rounded-lg border border-cafe/30 bg-cafe/5 p-3 space-y-2">
            <Label className="text-xs font-bold text-cafe flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5" />
              Número de Factura *
            </Label>
            <Input
              id="numero_factura"
              placeholder="Ej: FAC-0042"
              value={numeroFactura}
              onChange={e => setNumeroFactura(e.target.value)}
              className="bg-background font-mono tracking-wide"
              maxLength={FIELD_LIMITS.factura}
            />
            <p className="text-[10px] text-muted-foreground">
              Ingrese el número de factura entregado en caja para trazabilidad.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">Cliente Frecuente</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Seleccione el cliente" />
              </SelectTrigger>
              <SelectContent>
                {frequentClients.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre} {c.apellido} ({c.cedula})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">Producto</Label>
            <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={isLoading}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder={isLoading ? "Cargando..." : "Seleccionar producto"} />
              </SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.nombre} (${p.precio})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-foreground">Cantidad (Und.)</Label>
            <Input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={cantidad}
              onChange={e => setCantidad(Number.parseInt(e.target.value) || 0)}
              className="bg-background"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20"
            onClick={handleRecargar}
            disabled={isSaving}
          >
            {isSaving ? 'Procesando...' : 'Confirmar Recarga'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
