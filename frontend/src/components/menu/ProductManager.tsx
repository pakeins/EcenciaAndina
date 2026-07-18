import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { Category, Alimento } from '@/types';

export function ProductManager({ onProductsChanged }: { onProductsChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [allProducts, setAllProducts] = useState<Alimento[]>([]);
  const [loading, setLoading] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<number | null>(null);

  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        apiFetch('/alimentos/categorias'),
        apiFetch('/alimentos')
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (prodRes.ok) setAllProducts(await prodRes.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchData();
  }, [open]);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categories[0].id_categoria_menu);
    }
  }, [categories, selectedCategoryId]);

  const handleAdd = async () => {
    if (!newProductName.trim() || !selectedCategoryId) return;
    try {
      const res = await apiFetch('/alimentos', {
        method: 'POST',
        body: JSON.stringify({ nombre: newProductName.trim(), id_categoria: selectedCategoryId }),
      });
      if (res.ok) {
        toast({ title: 'Producto agregado' });
        setNewProductName('');
        fetchData();
        onProductsChanged();
      } else {
        toast({ variant: 'destructive', title: 'Error al agregar producto' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de red' });
    }
  };

  const handleDeleteClick = (id: number) => {
    setProductToDelete(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (productToDelete === null) return;
    try {
      const res = await apiFetch(`/alimentos/${productToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Producto eliminado' });
        fetchData();
        onProductsChanged();
      } else {
        const data = await res.json();
        toast({ variant: 'destructive', title: 'Error', description: data.error || 'No se pudo eliminar' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de red' });
    }
  };

  const filteredProducts = allProducts.filter(p => p.id_categoria === selectedCategoryId);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="border-primary text-primary hover:bg-primary/10 w-full sm:w-auto">Gestionar Platos</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestionar Platos / Alimentos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <Button
                  key={c.id_categoria_menu}
                  size="sm"
                  variant={selectedCategoryId === c.id_categoria_menu ? 'default' : 'outline'}
                  onClick={() => setSelectedCategoryId(c.id_categoria_menu)}
                >
                  {c.nombre_categoria}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input 
                placeholder="Nuevo plato (ej: Arroz con Pollo)" 
                value={newProductName} 
                onChange={e => setNewProductName(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                disabled={!selectedCategoryId}
              />
              <Button onClick={handleAdd} disabled={!selectedCategoryId}><Plus className="h-4 w-4 mr-2" /> Agregar</Button>
            </div>
            
            <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-cafe" /></div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">No hay platos en esta categoría</div>
              ) : (
                filteredProducts.map(p => (
                  <div key={p.id} className="flex justify-between items-center p-3 hover:bg-muted/50">
                    <span className="font-medium text-sm">{p.nombre}</span>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(p.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar Producto?"
        description="No se podrá eliminar si está en menús anteriores. ¿Estás seguro?"
        onConfirm={confirmDelete}
        confirmText="Sí, Eliminar"
        variant="destructive"
      />
    </>
  );
}
