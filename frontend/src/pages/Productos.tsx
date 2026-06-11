import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Package, Search, Tag, Layers, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface Product {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean;
  id_categoria: number;
  categoria_nombre: string;
  descripcion: string;
}

interface Category {
  id_categoria: number;
  nombre_categoria: string;
}

export default function Productos() {
  const { user } = useAuth();
  const isAdministrador = user?.rol === 'administrador';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');

  // Dialogs
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Forms
  const [productForm, setProductForm] = useState({
    nombre: '',
    precio: '',
    id_categoria: '',
    activo: true,
    descripcion: ''
  });
  const [categoryForm, setCategoryForm] = useState({
    nombre_categoria: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        apiFetch('/productos'),
        apiFetch('/categorias')
      ]);
      
      if (prodRes.ok) setProducts(await prodRes.json());
      if (catRes.ok) setCategories(await catRes.json());
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  // --- PRODUCTOS ---
  const handleOpenProduct = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setProductForm({
        nombre: product.nombre,
        precio: product.precio.toString(),
        id_categoria: product.id_categoria.toString(),
        activo: product.activo,
        descripcion: product.descripcion || ''
      });
    } else {
      setEditingProduct(null);
      setProductForm({
        nombre: '',
        precio: '',
        id_categoria: categories[0]?.id_categoria.toString() || '',
        activo: true,
        descripcion: ''
      });
    }
    setProductDialogOpen(true);
  };

  const saveProduct = async () => {
    if (!productForm.nombre || !productForm.precio || !productForm.id_categoria) {
      toast.error('Complete todos los campos'); return;
    }

    if (parseFloat(productForm.precio) < 0) {
      toast.error('El precio no puede ser negativo');
      return;
    }
    setIsSaving(true);
    try {
      const url = editingProduct ? `/productos/${editingProduct.id}` : '/productos';
      const method = editingProduct ? 'PUT' : 'POST';
      const response = await apiFetch(url, {
        method,
        body: JSON.stringify({
          ...productForm,
          precio: parseFloat(productForm.precio),
          id_categoria: parseInt(productForm.id_categoria)
        })
      });
      const data = await response.json();
      if (response.ok) {
        if (editingProduct) setProducts(products.map(p => p.id === editingProduct.id ? data : p));
        else setProducts([...products, data]);
        toast.success(editingProduct ? 'Producto actualizado' : 'Producto creado');
        setProductDialogOpen(false);
      } else toast.error(data.error);
    } finally { setIsSaving(false); }
  };

  const toggleProductStatus = async (product: Product) => {
    try {
      const response = await apiFetch(`/productos/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ activo: !product.activo })
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(products.map(p => p.id === product.id ? data : p));
        toast.success(`Producto ${data.activo ? 'activado' : 'desactivado'}`);
      }
    } catch (err) { toast.error('Error de conexión'); }
  };

  // --- CATEGORÍAS ---
  const handleOpenCategory = (category?: Category) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({ nombre_categoria: category.nombre_categoria });
    } else {
      setEditingCategory(null);
      setCategoryForm({ nombre_categoria: '' });
    }
    setCategoryDialogOpen(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.nombre_categoria) { toast.error('Nombre obligatorio'); return; }
    setIsSaving(true);
    try {
      const url = editingCategory ? `/categorias/${editingCategory.id_categoria}` : '/categorias';
      const method = editingCategory ? 'PUT' : 'POST';
      const response = await apiFetch(url, { method, body: JSON.stringify(categoryForm) });
      const data = await response.json();
      if (response.ok) {
        if (editingCategory) {
          setCategories(categories.map(c => c.id_categoria === editingCategory.id_categoria ? data : c));
          fetchData(); // Refrescar nombres en productos
        } else setCategories([...categories, data]);
        toast.success(editingCategory ? 'Categoría actualizada' : 'Categoría creada');
        setCategoryDialogOpen(false);
      } else toast.error(data.error);
    } finally { setIsSaving(false); }
  };

  const filteredProducts = products.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.categoria_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.descripcion && p.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredCategories = categories.filter(c =>
    c.nombre_categoria.toLowerCase().includes(categorySearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
          Catálogo de Productos
        </h1>
        <p className="text-muted-foreground text-lg">Gestione los productos y categorías de Ecencia Andina</p>
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="products" className="gap-2"><Package className="h-4 w-4" /> Productos</TabsTrigger>
          <TabsTrigger value="categories" className="gap-2"><Layers className="h-4 w-4" /> Categorías</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar producto..." className="pl-10" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
            {isAdministrador && (
              <Button onClick={() => handleOpenProduct()} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20 h-11 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
                <Plus className="mr-2 h-4 w-4" />
                Nuevo Producto
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/10 hover:bg-secondary/10">
                    <TableHead className="text-cafe font-bold">Producto</TableHead>
                    <TableHead className="text-cafe font-bold">Categoría</TableHead>
                    <TableHead className="text-cafe font-bold">Precio</TableHead>
                    <TableHead className="text-cafe font-bold">Estado</TableHead>
                    {isAdministrador && <TableHead className="text-right text-cafe font-bold">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Cargando productos...</TableCell></TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No se encontraron productos.</TableCell></TableRow>
                  ) : filteredProducts.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground">
                        <div>
                          <p>{p.nombre}</p>
                          {p.descripcion && <p className="text-xs text-muted-foreground line-clamp-1">{p.descripcion}</p>}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{p.categoria_nombre}</Badge></TableCell>
                      <TableCell className="font-semibold">${p.precio.toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch 
                            checked={p.activo} 
                            onCheckedChange={() => toggleProductStatus(p)} 
                            disabled={!isAdministrador}
                          />
                          <Badge variant={p.activo ? 'default' : 'secondary'}>
                            {p.activo ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>
                      </TableCell>
                      {isAdministrador && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                             <Button variant="outline" size="sm" onClick={() => handleOpenProduct(p)} title="Editar producto">
                               <Pencil className="h-4 w-4" />
                             </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Buscar categoría..." 
                className="pl-10" 
                value={categorySearchTerm} 
                onChange={e => setCategorySearchTerm(e.target.value)} 
              />
            </div>
            {isAdministrador && (
              <Button onClick={() => handleOpenCategory()} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20 h-11 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
                <Plus className="mr-2 h-4 w-4" />
                Nueva Categoría
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-secondary/10 hover:bg-secondary/10">
                      <TableHead className="text-cafe font-bold">Nombre de la Categoría</TableHead>
                      <TableHead className="text-cafe font-bold">Productos Vinculados</TableHead>
                      {isAdministrador && <TableHead className="text-right text-cafe font-bold">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Cargando categorías...</TableCell></TableRow>
                    ) : filteredCategories.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No se encontraron categorías.</TableCell></TableRow>
                    ) : filteredCategories.map(c => (
                      <TableRow key={c.id_categoria}>
                        <TableCell className="font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <Tag className="h-4 w-4 text-primary" />
                            {c.nombre_categoria}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {products.filter(p => p.id_categoria === c.id_categoria).length} productos
                          </Badge>
                        </TableCell>
                        {isAdministrador && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => handleOpenCategory(c)} title="Editar categoría">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Producto */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
            <DialogDescription>Complete los datos del producto alimenticio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre del Producto *</Label>
              <Input value={productForm.nombre} onChange={e => setProductForm({...productForm, nombre: e.target.value})} placeholder="Ej: Almuerzo Ejecutivo" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Precio Unitario ($) *</Label>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Incluye IVA</span>
                </div>
                <Input type="number" step="0.01" min="0" value={productForm.precio} onChange={e => setProductForm({...productForm, precio: e.target.value})} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Categoría *</Label>
                <Select value={productForm.id_categoria} onValueChange={v => setProductForm({...productForm, id_categoria: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id_categoria} value={c.id_categoria.toString()}>{c.nombre_categoria}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea 
                value={productForm.descripcion} 
                onChange={e => setProductForm({...productForm, descripcion: e.target.value})} 
                placeholder="Detalle los ingredientes o características del producto..." 
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveProduct} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">{isSaving ? 'Guardando...' : 'Guardar Producto'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Categoría */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la Categoría *</Label>
              <Input value={categoryForm.nombre_categoria} onChange={e => setCategoryForm({nombre_categoria: e.target.value})} placeholder="Ej: Bebidas, Postres..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveCategory} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">{isSaving ? 'Guardando...' : 'Guardar Categoría'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
