import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';
import { Trash2, Plus, Loader2 } from 'lucide-react';
import { Category } from '@/types';

const normalizeName = (name: string) =>
  name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function CategoryManager({ onCategoriesChanged }: { onCategoriesChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<number | null>(null);

  const { toast } = useToast();

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/alimentos/categorias');
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchCategories();
  }, [open]);

  const handleAdd = async () => {
    const name = newCatName.trim();
    if (!name) return;

    const normalizedNew = normalizeName(name);
    const duplicate = categories.find((c) => normalizeName(c.nombre_categoria) === normalizedNew);
    if (duplicate) {
      toast({ variant: 'destructive', title: 'Ya existe una categoría con ese nombre' });
      return;
    }

    try {
      const res = await apiFetch('/alimentos/categorias', {
        method: 'POST',
        body: JSON.stringify({ nombre_categoria: name }),
      });
      if (res.ok) {
        toast({ title: 'Categoría agregada' });
        setNewCatName('');
        fetchCategories();
        onCategoriesChanged();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: 'destructive', title: 'Error', description: data.error || 'No se pudo agregar la categoría' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de red' });
    }
  };

  const handleDeleteClick = (id: number) => {
    setCategoryToDelete(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (categoryToDelete === null) return;
    try {
      const res = await apiFetch(`/alimentos/categorias/${categoryToDelete}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Categoría eliminada' });
        fetchCategories();
        onCategoriesChanged();
      } else {
        const data = await res.json();
        toast({ variant: 'destructive', title: 'Error', description: data.error || 'No se pudo eliminar' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error de red' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-cafe text-cafe hover:bg-cafe/10">Gestionar Categorías</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gestionar Categorías de Menú</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="flex gap-2">
            <Input 
              placeholder="Nueva categoría (ej: Entradas)" 
              value={newCatName} 
              onChange={e => setNewCatName(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-2" /> Agregar</Button>
          </div>
          
          <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-cafe" /></div>
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="border-cafe text-cafe hover:bg-cafe/10">Gestionar Categorías</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gestionar Categorías de Menú</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input 
                placeholder="Nueva categoría (ej: Entradas)" 
                value={newCatName} 
                onChange={e => setNewCatName(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd}><Plus className="h-4 w-4 mr-2" /> Agregar</Button>
            </div>
            
            <div className="border rounded-md divide-y max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="p-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-cafe" /></div>
              ) : categories.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-sm">No hay categorías</div>
              ) : (
                categories.map(c => (
                  <div key={c.id_categoria_menu} className="flex justify-between items-center p-3 hover:bg-muted/50">
                    <span className="font-medium text-sm">{c.nombre_categoria}</span>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(c.id_categoria_menu)} className="text-red-500 hover:text-red-700">
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
        title="¿Eliminar Categoría?"
        description="Solo se puede eliminar si no tiene productos asociados. ¿Estás seguro?"
        onConfirm={confirmDelete}
        confirmText="Sí, Eliminar"
        variant="destructive"
      />
    </>
  );
}
