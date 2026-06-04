import { useState, useEffect, useRef } from 'react';
import { Convenio, Client, ConvenioHistorial } from '@/types';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Users, Building2, Mail, Phone, CalendarDays, Trash2, Search, UserPlus, ArrowLeft, FileDown, ShieldCheck, Eye, Upload, History, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { differenceInYears } from 'date-fns';
import { FIELD_LIMITS, isNonNegativeNumber, isValidEcDocument, isValidPhone, isValidRuc, normalizePhone, onlyDigits } from '@/lib/validation';
import { escapeHtml, formatMoney, openPrintWindow, openSafeBlankWindow, toFiniteNumber } from '@/lib/html';

export default function Convenios() {
  const [convenios, setConvenios] = useState<Convenio[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConvenio, setEditingConvenio] = useState<Convenio | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [convenioToToggle, setConvenioToToggle] = useState<Convenio | null>(null);

  const [isRenewalDialogOpen, setIsRenewalDialogOpen] = useState(false);
  const [convenioToRenew, setConvenioToRenew] = useState<Convenio | null>(null);
  const [renewalDates, setRenewalDates] = useState({ fecha_inicio: '', fecha_caducidad: '' });

  const [convenioHistorial, setConvenioHistorial] = useState<ConvenioHistorial[]>([]);
  const [isUploading, setIsUploading] = useState(false);

interface ReportConsumo {
  fecha: string;
  producto: string;
  cantidad: number;
  valor: number;
}
interface ReportEmployee {
  empleado: string;
  cedula: string;
  total: number;
  consumos: ReportConsumo[];
}

  // -- REPORTE DE CONSUMOS --
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [reportConvenio, setReportConvenio] = useState<Convenio | null>(null);
  const [reportDates, setReportDates] = useState({ desde: '', hasta: '' });
  const [reportData, setReportData] = useState<ReportEmployee[]>([]);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const isExpired = (dateStr: string) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiryDate = new Date(dateStr + 'T00:00:00');
    return expiryDate < today;
  };

  const [formData, setFormData] = useState({
    ruc: '',
    nombre_empresa: '',
    representante: '',
    telefono: '',
    email: '',
    fecha_inicio: '',
    fecha_caducidad: '',
    cupo_maximo: 0,
  });

  // --- GESTIÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œN DE COLABORADORES ---
  const [associatedClients, setAssociatedClients] = useState<Client[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClientData, setNewClientData] = useState({
    cedula: '',
    nombre: '',
    apellido: '',
    telefono: ''
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    fetchConvenios();
  }, []);

  const fetchConvenios = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/convenios');
      const data = await response.json();
      if (response.ok) setConvenios(data);
    } catch (err) { toast.error('Error de conexiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n'); }
    finally { setIsLoading(false); }
  };

  const fetchAssociatedClients = async (id: string) => {
    setIsLoadingClients(true);
    try {
      const response = await apiFetch(`/convenios/${id}/clientes`);
      if (response.ok) setAssociatedClients(await response.json());
    } finally { setIsLoadingClients(false); }
  };

  const fetchAllClientsForSelection = async () => {
    try {
      const response = await apiFetch('/clientes');
      if (response.ok) setAvailableClients(await response.json());
    } catch (err) { console.error(err); }
  };

  const handleOpenNew = () => {
    setEditingConvenio(null);
    setFormData({ ruc: '', nombre_empresa: '', representante: '', telefono: '', email: '', fecha_inicio: '', fecha_caducidad: '', cupo_maximo: 0 });
    setAssociatedClients([]);
    setDialogOpen(true);
    setShowCreateForm(false);
  };

  const handleEdit = (convenio: Convenio) => {
    setEditingConvenio(convenio);
    setFormData({
      ruc: convenio.ruc,
      nombre_empresa: convenio.nombre_empresa,
      representante: convenio.representante,
      telefono: convenio.telefono,
      email: convenio.email,
      fecha_inicio: convenio.fecha_inicio,
      fecha_caducidad: convenio.fecha_caducidad,
      cupo_maximo: convenio.cupo_maximo,
    });
    fetchAssociatedClients(convenio.id);
    fetchHistorial(convenio.id);
    fetchAllClientsForSelection();
    setDialogOpen(true);
    setShowCreateForm(false);
  };

  const handleSave = async () => {
    if (!formData.ruc || !formData.nombre_empresa || !formData.fecha_inicio || !formData.fecha_caducidad) {
      toast.error('Campos obligatorios faltantes'); return;
    }

    if (!isValidRuc(formData.ruc)) {
      toast.error('Ingrese un RUC ecuatoriano valido');
      return;
    }
    if (formData.nombre_empresa.trim().length > FIELD_LIMITS.empresa || formData.representante.trim().length > FIELD_LIMITS.empresa) {
      toast.error(`Empresa y representante no pueden superar ${FIELD_LIMITS.empresa} caracteres`);
      return;
    }
    if (formData.email && formData.email.length > FIELD_LIMITS.email) {
      toast.error('El correo es demasiado largo');
      return;
    }
    if (!isValidPhone(formData.telefono)) {
      toast.error('El telefono debe tener entre 8 y 15 digitos');
      return;
    }
    if (!isNonNegativeNumber(formData.cupo_maximo)) {
      toast.error('El cupo maximo no puede ser negativo');
      return;
    }
    if (new Date(formData.fecha_caducidad) < new Date(formData.fecha_inicio)) {
      toast.error('La fecha de caducidad no puede ser anterior a la fecha de inicio');
      return;
    }
    setIsSaving(true);
    try {
      const url = editingConvenio ? `/convenios/${editingConvenio.id}` : '/convenios';
      const method = editingConvenio ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        ruc: onlyDigits(formData.ruc),
        telefono: normalizePhone(formData.telefono),
      };
      const response = await apiFetch(url, { method, body: JSON.stringify(payload) });
      const data = await response.json();
      if (response.ok) {
        if (editingConvenio) {
          setConvenios(convenios.map(c => c.id === editingConvenio.id ? data : c));
        } else {
          setConvenios([data, ...convenios]);
          // Generar PDF automÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ticamente para el nuevo convenio
          setTimeout(() => handleExportPDF(data), 500);
        }
        toast.success(editingConvenio ? 'Actualizado' : 'Convenio creado. Generando documento para firma...');
        setDialogOpen(false);
      } else toast.error(data.error);
    } finally { setIsSaving(false); }
  };

  const handleAddClient = async (clientId: string) => {
    if (!editingConvenio) return;
    try {
      const response = await apiFetch(`/convenios/${editingConvenio.id}/clientes`, {
        method: 'POST', body: JSON.stringify({ id_cliente: clientId })
      });
      if (response.ok) {
        toast.success('Cliente agregado');
        fetchAssociatedClients(editingConvenio.id);
        fetchConvenios();
      } else {
        const data = await response.json();
        toast.error(data.error);
      }
    } catch (err) { toast.error('Error de conexiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n'); }
  };

  const handleCreateAndAddClient = async () => {
    if (!newClientData.cedula || !newClientData.nombre || !newClientData.apellido) {
      toast.error('CÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dula, nombre y apellido son obligatorios'); return;
    }
    if (!isValidEcDocument(newClientData.cedula)) {
      toast.error('Ingrese una cedula o RUC ecuatoriano valido');
      return;
    }
    if (newClientData.nombre.trim().length > FIELD_LIMITS.nombre || newClientData.apellido.trim().length > FIELD_LIMITS.nombre) {
      toast.error(`Nombre y apellido no pueden superar ${FIELD_LIMITS.nombre} caracteres`);
      return;
    }
    if (!isValidPhone(newClientData.telefono)) {
      toast.error('El telefono debe tener entre 8 y 15 digitos');
      return;
    }
    if (!editingConvenio) return;
    setIsSaving(true);
    try {
      const response = await apiFetch(`/convenios/${editingConvenio.id}/clientes/nuevo`, {
        method: 'POST',
        body: JSON.stringify({
          ...newClientData,
          cedula: onlyDigits(newClientData.cedula),
          telefono: normalizePhone(newClientData.telefono),
        })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success('Cliente creado y vinculado');
        setAssociatedClients([...associatedClients, data]);
        setShowCreateForm(false);
        setNewClientData({ cedula: '', nombre: '', apellido: '', telefono: '' });
        fetchConvenios();
      } else toast.error(data.error);
    } finally { setIsSaving(false); }
  };

  const handleRemoveClient = async (clientId: string) => {
    if (!editingConvenio) return;
    try {
      const response = await apiFetch(`/convenios/${editingConvenio.id}/clientes/${clientId}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success('Retirado');
        setAssociatedClients(associatedClients.filter(c => c.id !== clientId));
        fetchConvenios();
      }
    } catch (err) { toast.error('Error de conexiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n'); }
  };

  const fetchHistorial = async (id: string) => {
    try {
      const response = await apiFetch(`/convenios/${id}/historial`);
      if (response.ok) {
        const data = await response.json();
        setConvenioHistorial(data);
      }
    } catch (err) { console.error('Error fetching historial:', err); }
  };

  const handleToggleClick = (convenio: Convenio) => {
    if (isExpired(convenio.fecha_caducidad)) {
      setConvenioToRenew(convenio);
      setRenewalDates({
        fecha_inicio: new Date().toISOString().split('T')[0],
        fecha_caducidad: ''
      });
      setIsRenewalDialogOpen(true);
      return;
    }

    if (convenio.activo) { setConvenioToToggle(convenio); setIsAlertOpen(true); }
    else confirmToggle(convenio.id, true);
  };

  const confirmToggle = async (id: string, newState: boolean) => {
    try {
      const response = await apiFetch(`/convenios/${id}`, { method: 'PUT', body: JSON.stringify({ activo: newState }) });
      if (response.ok) {
        const data = await response.json();
        setConvenios(convenios.map(c => c.id === id ? data : c));
      }
    } finally { setIsAlertOpen(false); setConvenioToToggle(null); }
  };

  const handleRenew = async () => {
    if (!convenioToRenew || !renewalDates.fecha_inicio || !renewalDates.fecha_caducidad) {
      toast.error('Por favor seleccione ambas fechas'); return;
    }

    if (new Date(renewalDates.fecha_caducidad) < new Date(renewalDates.fecha_inicio)) {
      toast.error('La fecha de caducidad no puede ser anterior a la fecha de inicio');
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiFetch(`/convenios/${convenioToRenew.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...renewalDates,
          activo: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        setConvenios(convenios.map(c => c.id === convenioToRenew.id ? data : c));
        toast.success('Convenio renovado y activado. Generando nuevo contrato...');
        setIsRenewalDialogOpen(false);
        setTimeout(() => handleExportPDF(data), 500);
      } else {
        const err = await response.json();
        toast.error(err.error);
      }
    } finally { setIsSaving(false); }
  };

  const handleOpenReport = (convenio: Convenio) => {
    setReportConvenio(convenio);
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    setReportDates({
      desde: firstDay.toISOString().split('T')[0],
      hasta: lastDay.toISOString().split('T')[0]
    });
    setReportData([]);
    setIsReportDialogOpen(true);
  };

  const handleGenerateReport = async () => {
    if (!reportDates.desde || !reportDates.hasta) {
      toast.error('Por favor seleccione ambas fechas');
      return;
    }
    if (new Date(reportDates.hasta) < new Date(reportDates.desde)) {
      toast.error('La fecha "Hasta" no puede ser inferior a la fecha "Desde"');
      return;
    }
    setIsGeneratingReport(true);
    try {
      const response = await apiFetch(`/convenios/${reportConvenio?.id}/reporte?fecha_inicio=${reportDates.desde}&fecha_fin=${reportDates.hasta}`);
      if (response.ok) {
        const data = await response.json();
        setReportData(data);
      } else {
        toast.error('Error al generar el reporte');
      }
    } catch (err) {
      toast.error('Error al generar reporte');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleExportReportPDF = () => {
    try {
      const printWindow = openPrintWindow();
      if (!printWindow) {
        toast.error('Ventana emergente bloqueada');
        return;
      }

      const granTotal = reportData.reduce((acc, curr) => acc + toFiniteNumber(curr.total), 0);
      const empresaReporte = escapeHtml(reportConvenio?.nombre_empresa);
      const fechaDesde = escapeHtml(reportDates.desde);
      const fechaHasta = escapeHtml(reportDates.hasta);

      let contenido = `
        <html>
          <head>
            <title>Reporte de Consumos - ${empresaReporte}</title>
            <style>
              body { font-family: 'Arial', sans-serif; padding: 20px 40px; color: #333; }
              .header { text-align: center; border-bottom: 2px solid #8B4513; margin-bottom: 20px; padding-bottom: 10px; }
              .header h2 { margin: 0; color: #8B4513; }
              .header p { margin: 5px 0 0 0; font-size: 14px; color: #666; }
              .totales { display: flex; justify-content: space-between; background: #fdf8f5; padding: 15px; border-radius: 8px; border: 1px solid #eaddd7; margin-bottom: 20px; }
              .gran-total { font-size: 20px; font-weight: bold; color: #8B4513; }
              .empleado-card { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
              .empleado-header { background: #f5f5f5; padding: 10px 15px; display: flex; justify-content: space-between; border-bottom: 1px solid #ddd; }
              .empleado-header h4 { margin: 0; font-size: 16px; }
              .empleado-total { font-weight: bold; color: #8B4513; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 8px 15px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
              th { background: #fafafa; font-weight: bold; color: #555; }
              .text-right { text-align: right; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2>ECENCIA ANDINA</h2>
              <p>REPORTE DE CONSUMOS: <strong>${empresaReporte}</strong></p>
              <p>Periodo: ${fechaDesde} al ${fechaHasta}</p>
            </div>

            <div class="totales">
              <div><strong>Total de Colaboradores:</strong> ${reportData.length}</div>
              <div class="gran-total">Total Consumo Mensual: $${formatMoney(granTotal)}</div>
            </div>
      `;

      reportData.forEach(emp => {
        const empleado = escapeHtml(emp.empleado);
        const cedula = escapeHtml(emp.cedula);
        const totalEmpleado = formatMoney(emp.total);

        contenido += `
            <div class="empleado-card">
              <div class="empleado-header">
                <div>
                  <h4>${empleado}</h4>
                  <span style="font-size: 12px; color: #666;">C.I: ${cedula}</span>
                </div>
                <div class="empleado-total">Total: $${totalEmpleado}</div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto</th>
                    <th class="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
        `;

        emp.consumos.forEach((cons: ReportConsumo) => {
          const fechaConsumo = escapeHtml(new Date(cons.fecha).toLocaleDateString('es-EC'));
          const producto = escapeHtml(cons.producto);
          const cantidad = toFiniteNumber(cons.cantidad);
          const valor = formatMoney(cons.valor);

          contenido += `
                  <tr>
                    <td>${fechaConsumo}</td>
                    <td>${cantidad}x ${producto}</td>
                    <td class="text-right">$${valor}</td>
                  </tr>
          `;
        });

        contenido += `
                </tbody>
              </table>
            </div>
        `;
      });

      contenido += `
          </body>
        </html>
      `;

      printWindow.document.write(contenido);
      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 500);
    } catch (err) {
      toast.error('Error al generar el documento de reporte');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formDataUpload = new FormData();
    formDataUpload.append('archivo', file);

    setIsUploading(true);
    try {
      // Usamos fetch directo para manejar FormData correctamente sin los headers JSON de apiFetch
      const token = localStorage.getItem('token');
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${API_BASE_URL}/convenios/${id}/upload`, {
        method: 'POST',
        headers,
        body: formDataUpload
      });

      if (response.ok) {
        const data = await response.json();
        setConvenios(convenios.map(c => c.id === id ? data : c));
        if (editingConvenio?.id === id) setEditingConvenio(data);
        toast.success('Convenio firmado subido correctamente');
      } else {
        const errData = await response.json();
        toast.error(errData.error || 'Error al subir archivo');
      }
    } catch (err) {
      toast.error('Error de conexiÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n al subir archivo');
    } finally {
      setIsUploading(false);
    }
  };

  const openProtectedFile = async (filePath?: string | null) => {
    if (!filePath) return;

    const opened = openSafeBlankWindow();
    if (!opened) {
      toast.error('Ventana emergente bloqueada');
      return;
    }

    try {
      const response = await apiFetch(filePath);
      if (!response.ok) {
        opened.close();
        toast.error('No se pudo abrir el archivo firmado');
        return;
      }

      const blobUrl = URL.createObjectURL(await response.blob());
      opened.location.href = blobUrl;

      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      opened.close();
      toast.error('Error al abrir el archivo firmado');
    }
  };

  const handleExportPDF = (convenio: Convenio) => {
    try {
      const printWindow = openPrintWindow();
      if (!printWindow) {
        toast.error('Ventana emergente bloqueada');
        return;
      }

      const inicio = convenio.fecha_inicio || '';
      const fin = convenio.fecha_caducidad || '';
      const empresaContrato = escapeHtml(convenio.nombre_empresa);
      const rucContrato = escapeHtml(convenio.ruc);
      const cupoContrato = escapeHtml(convenio.cupo_maximo);
      const inicioContrato = escapeHtml(inicio);
      const finContrato = escapeHtml(fin);
      const representanteContrato = escapeHtml(convenio.representante || '________________');
      const contactoContrato = escapeHtml(convenio.email || convenio.telefono || '________________');

      // Calculo de anios
      let anios = 1;
      if (inicio && fin) {
        const d1 = new Date(inicio);
        const d2 = new Date(fin);
        anios = Math.abs(differenceInYears(d2, d1));
        if (anios === 0) anios = 1;
      }

      const contenido = `
        <html>
          <head>
            <title>Contrato ${empresaContrato}</title>
            <style>
              body { font-family: 'Times New Roman', serif; padding: 40px 60px; line-height: 1.6; text-align: justify; }
              .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 30px; padding-bottom: 10px; }
              .titulo { text-align: center; font-weight: bold; text-decoration: underline; margin-bottom: 30px; }
              .firma { margin-top: 60px; display: flex; justify-content: space-between; }
              .linea { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; }
              .dato { font-weight: bold; border-bottom: 1px solid #ccc; }
            </style>
          </head>
          <body>
            <div class="header">
              <h2 style="margin:0">ECENCIA ANDINA</h2>
              <p style="margin:0; font-size:12px">CONVENIOS DE ALIMENTACIÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œN</p>
            </div>
            <div class="titulo">CONTRATO DE SERVICIO DE ALIMENTACIÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œN</div>

            <p>Se celebra el presente convenio con fecha <span class="dato">${escapeHtml(new Date().toLocaleDateString())}</span> para brindar servicios de almuerzos a la empresa <span class="dato">${empresaContrato}</span> con RUC <span class="dato">${rucContrato}</span>.</p>

            <p>El convenio contempla un mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ximo de <span class="dato">${cupoContrato}</span> colaboradores debidamente registrados en el sistema.</p>

            <p>La duracion del contrato sera de <span class="dato">${anios} anio(s)</span>, iniciando el dia <span class="dato">${inicioContrato}</span> y finalizando el dia <span class="dato">${finContrato}</span>.</p>

            <p>Representante legal: <span class="dato">${representanteContrato}</span><br>
               Contacto: <span class="dato">${contactoContrato}</span></p>

            <div class="firma">
              <div class="linea">Por ECencia Andina</div>
              <div class="linea">Por ${empresaContrato}</div>
            </div>
          </body>
        </html>
      `;

      printWindow.document.write(contenido);
      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 300);
    } catch (err) {
      console.error(err);
      toast.error('Error al generar el documento');
    }
  };

  const filteredAvailableClients = availableClients.filter(c =>
    c.id_tipo_cliente === 1 &&
    !c.convenio &&
    !associatedClients.find(ac => ac.id === c.id) &&
    (clientSearch === '' || c.nombre.toLowerCase().includes(clientSearch.toLowerCase()) || c.cedula.includes(clientSearch))
  ).slice(0, 10);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-cafe to-terracota">
            Convenios
          </h1>
          <p className="text-muted-foreground text-lg">AdministraciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de alianzas empresariales de Ecencia Andina</p>
        </div>
        <Button onClick={handleOpenNew} className="gap-2 bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20 h-12 px-6 rounded-xl font-bold transition-all hover:scale-[1.02]">
          <Plus className="h-5 w-5" /> Nuevo Convenio
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {convenios.map((convenio) => (
            <Card key={convenio.id} className="border-border shadow-sm border-t-4 border-t-primary bg-primary/5 group hover:shadow-md transition-all duration-300">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white shadow-sm group-hover:scale-110 transition-transform">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div><CardTitle className="text-lg font-bold text-cafe">{convenio.nombre_empresa}</CardTitle><CardDescription className="font-medium">RUC: {convenio.ruc}</CardDescription></div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={isExpired(convenio.fecha_caducidad) ? 'destructive' : (convenio.activo ? 'default' : 'secondary')}>
                      {isExpired(convenio.fecha_caducidad) ? 'Vencido' : (convenio.activo ? 'Activo' : 'Inactivo')}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                   <div className="flex items-center gap-2 text-foreground font-medium"><Users className="h-4 w-4 text-terracota" /> {convenio.representante || 'ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â'}</div>
                   <div className="flex items-center gap-2 text-foreground font-medium"><CalendarDays className="h-4 w-4 text-oro" /> {formatDate(convenio.fecha_inicio)} ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â {formatDate(convenio.fecha_caducidad)}</div>
                </div>
                <div className="space-y-3 py-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ximo de Colaboradores</span>
                    <span className={`px-2 py-0.5 rounded-full ${convenio.totalColaboradores >= convenio.cupo_maximo ? "bg-destructive/10 text-destructive font-bold" : "bg-primary/10 text-primary font-bold"}`}>
                      {convenio.totalColaboradores} / {convenio.cupo_maximo}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-accent/50 rounded-full overflow-hidden border border-border/50">
                    <div
                      className={`h-full transition-all ${convenio.totalColaboradores >= convenio.cupo_maximo ? 'bg-destructive' : 'bg-oro'}`}
                      style={{ width: `${Math.min((convenio.totalColaboradores / (convenio.cupo_maximo || 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={convenio.activo && !isExpired(convenio.fecha_caducidad)}
                          onCheckedChange={() => handleToggleClick(convenio)}
                        />
                        <span className={`text-[10px] font-bold uppercase ${isExpired(convenio.fecha_caducidad) ? 'text-destructive' : (convenio.activo ? 'text-primary' : 'text-muted-foreground')}`}>
                          {isExpired(convenio.fecha_caducidad) ? 'Vencido' : (convenio.activo ? 'Activo' : 'Inactivo')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(convenio)}
                          disabled={isExpired(convenio.fecha_caducidad)}
                        >
                          <Pencil className="mr-1 h-4 w-4" /> Editar
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {convenio.archivo_firmado ? (
                        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs flex-1 min-w-[100px] border-primary/30 text-primary hover:bg-primary/10" onClick={() => openProtectedFile(convenio.archivo_firmado)}>
                          <Eye className="h-3.5 w-3.5" /> Ver Contrato
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-8 text-xs flex-1 min-w-[100px]"
                          onClick={() => handleExportPDF(convenio)}
                          title="Generar documento para firmar"
                        >
                          <FileDown className="h-3.5 w-3.5 text-muted-foreground" /> Generar Contrato
                        </Button>
                      )}

                      <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs flex-1 min-w-[100px] border-cafe/30 text-cafe hover:bg-cafe/10" onClick={() => handleOpenReport(convenio)}>
                        <FileText className="h-3.5 w-3.5" /> Generar Reporte
                      </Button>
                    </div>
                  </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingConvenio ? 'Editar Convenio' : 'Nuevo Convenio'}</DialogTitle>
            <DialogDescription>Gestione la informaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n y los colaboradores del convenio.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="info" className="w-full mt-4">
            <TabsList className={`grid w-full ${editingConvenio ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="info">InformaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n General</TabsTrigger>
              <TabsTrigger value="clients" disabled={!editingConvenio}>Colaboradores ({associatedClients.length})</TabsTrigger>
              {editingConvenio && <TabsTrigger value="history">Historial</TabsTrigger>}
            </TabsList>

            <TabsContent value="info" className="space-y-4 py-4">
               <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>RUC *</Label><Input value={formData.ruc} onChange={e => setFormData({...formData, ruc: e.target.value})} maxLength={13} inputMode="numeric" /></div>
                  <div className="space-y-2"><Label>Empresa *</Label><Input value={formData.nombre_empresa} onChange={e => setFormData({...formData, nombre_empresa: e.target.value})} maxLength={FIELD_LIMITS.empresa} /></div>
               </div>
               <div className="space-y-2"><Label>Representante</Label><Input value={formData.representante} onChange={e => setFormData({...formData, representante: e.target.value})} maxLength={FIELD_LIMITS.empresa} /></div>
               <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>TelÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©fono</Label><Input value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} maxLength={16} inputMode="tel" /></div>
                  <div className="space-y-2"><Label>Email</Label><Input value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} maxLength={FIELD_LIMITS.email} /></div>
               </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Fecha Inicio *</Label>
                    <Input
                      type="date"
                      value={formData.fecha_inicio}
                      onChange={e => setFormData({...formData, fecha_inicio: e.target.value})}
                      disabled={!!editingConvenio}
                      className={editingConvenio ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha Caducidad *</Label>
                    <Input
                      type="date"
                      value={formData.fecha_caducidad}
                      onChange={e => setFormData({...formData, fecha_caducidad: e.target.value})}
                      disabled={!!editingConvenio}
                      className={editingConvenio ? "bg-muted" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>MÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ximo de Colaboradores *</Label>
                      <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <Input
                      type="number"
                      min="0"
                      value={formData.cupo_maximo}
                      onChange={e => setFormData({...formData, cupo_maximo: Math.max(0, parseInt(e.target.value) || 0)})}
                    />
                  </div>
                </div>

                {editingConvenio && (
                  <div className="flex justify-end px-1">
                    <Button
                      variant="link"
                      size="sm"
                      className="text-primary font-bold h-auto p-0 flex items-center gap-1"
                      onClick={() => {
                        setDialogOpen(false);
                        setConvenioToRenew(editingConvenio);
                        setRenewalDates({
                          fecha_inicio: new Date().toISOString().split('T')[0],
                          fecha_caducidad: ''
                        });
                        setIsRenewalDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" /> Renovar vigencia del convenio
                    </Button>
                  </div>
                )}

                {editingConvenio && (
                  <div className="space-y-4 border-t pt-4">
                    <Label className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-primary" />
                      Documento del Convenio
                    </Label>

                    {!editingConvenio.archivo_firmado ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-destructive">
                          ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¯ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¸ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â El convenio aÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºn no cuenta con el documento firmado, por favor subirlo lo antes posible.
                        </p>
                        <Input
                          type="file"
                          ref={fileInputRef}
                          accept=".pdf,image/*"
                          onChange={(e) => handleFileUpload(e, editingConvenio.id)}
                          disabled={isUploading}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full gap-2 border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          <Upload className="h-4 w-4" />
                          {isUploading ? 'Subiendo documento...' : 'Seleccionar documento firmado'}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                          <div className="flex items-center gap-2 text-primary">
                            <ShieldCheck className="h-5 w-5" />
                            <span className="text-sm font-semibold">Convenio Firmado Cargado</span>
                          </div>
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-2 shadow-sm"
                            onClick={() => openProtectedFile(editingConvenio.archivo_firmado)}
                          >
                            <Eye className="h-4 w-4" />
                            Ver convenio firmado
                          </Button>
                        </div>
                        <div className="flex items-center justify-between px-1">
                          <p className="text-[10px] text-muted-foreground italic">
                            Cargado correctamente en el sistema local.
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            className="text-muted-foreground hover:text-primary text-[10px] h-auto p-0"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.pdf,image/*';
                              input.onchange = (e) => {
                                const target = e.target as HTMLInputElement;
                                if (target.files && target.files.length > 0) {
                                  handleFileUpload({ target } as React.ChangeEvent<HTMLInputElement>, editingConvenio.id);
                                }
                              };
                              input.click();
                            }}
                          >
                            Cambiar archivo
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

               <DialogFooter className="pt-4"><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button><Button onClick={handleSave} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">{isSaving ? 'Guardando...' : 'Guardar Datos'}</Button></DialogFooter>
            </TabsContent>

            <TabsContent value="clients" className="space-y-4 py-4">
              {!showCreateForm ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nombre o cÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dula..."
                        className="pl-10"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                      />
                      {(clientSearch || isSearchFocused) && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
                          <div className="p-2 border-b bg-accent/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            {clientSearch ? 'Resultados de bÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºsqueda' : 'Sugerencias de clientes'}
                          </div>
                          {filteredAvailableClients.length > 0 ? (
                            filteredAvailableClients.map(c => (
                              <div key={c.id} className="flex items-center justify-between p-2 hover:bg-accent cursor-pointer" onClick={() => { handleAddClient(c.id); setClientSearch(''); }}>
                                <div><p className="text-sm font-medium">{c.nombre} {c.apellido}</p><p className="text-xs text-muted-foreground">{c.cedula}</p></div>
                                <UserPlus className="h-4 w-4 text-primary" />
                              </div>
                            ))
                          ) : (
                            <div className="p-4 text-center space-y-2">
                              <p className="text-sm text-muted-foreground">No se encontrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³ al cliente.</p>
                              <Button size="sm" variant="outline" onClick={() => setShowCreateForm(true)} className="gap-2 border-cafe text-cafe hover:bg-cafe/10"><Plus className="h-4 w-4" /> Registrar nuevo colaborador</Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => setShowCreateForm(true)} title="Registrar nuevo"><UserPlus className="h-4 w-4" /></Button>
                  </div>

                  <div className="rounded-md border max-h-[300px] overflow-y-auto">
                    {isLoadingClients ? <p className="p-4 text-center text-sm">Cargando...</p> : associatedClients.length === 0 ? <p className="p-4 text-center text-sm text-muted-foreground">No hay colaboradores asignados.</p> :
                      associatedClients.map(c => (
                        <div key={c.id} className="flex items-center justify-between p-3 border-b last:border-0">
                          <div><p className="text-sm font-medium">{c.nombre} {c.apellido}</p><p className="text-xs text-muted-foreground">{c.cedula}</p></div>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveClient(c.id)} className="text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)} className="h-8 w-8 p-0"><ArrowLeft className="h-4 w-4" /></Button>
                    <h3 className="font-semibold">Nuevo Colaborador</h3>
                  </div>
                  <div className="space-y-2"><Label>CÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©dula *</Label><Input value={newClientData.cedula} onChange={e => setNewClientData({...newClientData, cedula: e.target.value})} maxLength={13} inputMode="numeric" /></div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>Nombre *</Label><Input value={newClientData.nombre} onChange={e => setNewClientData({...newClientData, nombre: e.target.value})} maxLength={FIELD_LIMITS.nombre} /></div>
                    <div className="space-y-2"><Label>Apellido *</Label><Input value={newClientData.apellido} onChange={e => setNewClientData({...newClientData, apellido: e.target.value})} maxLength={FIELD_LIMITS.nombre} /></div>
                  </div>
                  <div className="space-y-2"><Label>TelÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©fono</Label><Input value={newClientData.telefono} onChange={e => setNewClientData({...newClientData, telefono: e.target.value})} maxLength={16} inputMode="tel" /></div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" className="flex-1" onClick={() => setShowCreateForm(false)}>Cancelar</Button>
                    <Button className="flex-1" onClick={handleCreateAndAddClient} disabled={isSaving}>{isSaving ? 'Guardando...' : 'Crear y Vincular'}</Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 py-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <History className="h-5 w-5" />
                  <h3>Historial de Periodos y Contratos</h3>
                </div>

                {convenioHistorial.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    No hay registros anteriores para este convenio.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {convenioHistorial.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-4 bg-accent/30 rounded-xl border group hover:border-primary/50 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{formatDate(h.fecha_inicio)} ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â {formatDate(h.fecha_caducidad)}</span>
                            <Badge variant="outline" className="text-[10px]">Periodo Finalizado</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Registrado el {new Date(h.fecha_registro).toLocaleString()}</p>
                        </div>
                        {h.archivo_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-2 text-primary hover:bg-primary/10"
                            onClick={() => openProtectedFile(h.archivo_url)}
                          >
                            <FileText className="h-4 w-4" />
                            Ver contrato
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic px-2">Sin documento firmado</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¿Desactivar convenio?</AlertDialogTitle><AlertDialogDescription>El convenio quedarÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ inactivo hasta que se reactive manualmente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setConvenioToToggle(null)}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => convenioToToggle && confirmToggle(convenioToToggle.id, false)} className="bg-destructive text-destructive-foreground">SÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â­, desactivar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isRenewalDialogOpen} onOpenChange={setIsRenewalDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>RenovaciÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â³n de Convenio</DialogTitle>
            <DialogDescription>
              Su convenio debe renovarse. Por favor seleccione el nuevo periodo para reactivarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nueva Fecha Inicio</Label>
                <Input
                  type="date"
                  value={renewalDates.fecha_inicio}
                  onChange={e => setRenewalDates({...renewalDates, fecha_inicio: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Nueva Fecha Fin</Label>
                <Input
                  type="date"
                  value={renewalDates.fecha_caducidad}
                  onChange={e => setRenewalDates({...renewalDates, fecha_caducidad: e.target.value})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenewalDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleRenew} disabled={isSaving} className="bg-cafe hover:bg-cafe/90 shadow-lg shadow-cafe/20">
              {isSaving ? 'Renovando...' : 'Renovar y Activar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reporte de Consumos - {reportConvenio?.nombre_empresa}</DialogTitle>
            <DialogDescription>Generar reporte de consumos por periodo.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-4 items-end mb-4 bg-muted/20 p-4 rounded-lg border">
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input type="date" value={reportDates.desde} onChange={e => setReportDates({...reportDates, desde: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input type="date" value={reportDates.hasta} onChange={e => setReportDates({...reportDates, hasta: e.target.value})} />
            </div>
            <Button
              onClick={() => {
                setReportData([]);
                handleGenerateReport();
              }}
              disabled={isGeneratingReport}
              className="bg-cafe hover:bg-cafe/90"
            >
              {isGeneratingReport ? 'Generando...' : 'Generar Reporte'}
            </Button>
          </div>

          {reportData.length > 0 ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center bg-primary/10 p-4 rounded-xl border border-primary/20">
                <span className="font-bold text-lg text-primary">Total Consumo Mensual</span>
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-black text-primary">
                    ${reportData.reduce((acc, curr) => acc + curr.total, 0).toFixed(2)}
                  </span>
                  <Button
                    onClick={handleExportReportPDF}
                    variant="outline"
                    className="gap-2 border-cafe text-cafe hover:bg-cafe/10"
                  >
                    <FileDown className="h-4 w-4" /> Exportar / Imprimir
                  </Button>
                </div>
              </div>
              <div className="grid gap-4 grid-cols-1">
                {reportData.map((emp: ReportEmployee) => (
                  <Card key={emp.cedula} className="border shadow-sm">
                    <CardHeader className="py-3 px-4 bg-muted/20 border-b">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-sm font-bold text-cafe">{emp.empleado}</CardTitle>
                          <CardDescription className="text-xs">C.I: {emp.cedula}</CardDescription>
                        </div>
                        <Badge variant="secondary" className="font-bold text-sm bg-primary/10 text-primary border-primary/20">
                          ${emp.total.toFixed(2)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="max-h-40 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-accent/50 sticky top-0">
                            <tr>
                              <th className="text-left py-1.5 px-3 font-semibold">Fecha</th>
                              <th className="text-left py-1.5 px-3 font-semibold">Producto</th>
                              <th className="text-right py-1.5 px-3 font-semibold">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {emp.consumos.map((cons: ReportConsumo, idx: number) => (
                              <tr key={idx} className="border-b last:border-0 hover:bg-muted/10">
                                <td className="py-1.5 px-3 text-muted-foreground">
                                  {new Date(cons.fecha).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })}
                                </td>
                                <td className="py-1.5 px-3">{cons.cantidad}x {cons.producto}</td>
                                <td className="py-1.5 px-3 text-right font-medium">${cons.valor.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground bg-muted/5 rounded-xl border border-dashed">
              {isGeneratingReport ? 'Cargando datos...' : 'No se encontraron consumos confirmados en este rango de fechas. AsegÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âºrese de que los pedidos estÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©n en estado "Consumido".'}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
