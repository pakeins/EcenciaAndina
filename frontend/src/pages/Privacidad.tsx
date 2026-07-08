import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PrivacyConfig {
  version: string;
  contact: string;
  policy_url: string;
  notice: string;
}

export default function Privacidad() {
  const [config, setConfig] = useState<PrivacyConfig | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/telegram/privacy`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Privacy configuration unavailable');
        setConfig(await response.json());
      })
      .catch(() => setConfig(null));
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-10 w-10 text-terracota" />
          <div>
            <h1 className="text-3xl font-bold">Politica de privacidad de Telegram</h1>
            <p className="text-muted-foreground">
              Eciencia Andina {config?.version ? `| Version ${config.version}` : ''}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Finalidad y datos tratados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>
              El bot usa el numero de telefono compartido mediante el boton oficial de Telegram,
              identificadores tecnicos del chat y las selecciones realizadas con botones para
              vincular al titular con su cliente, enviar menus y registrar reservas.
            </p>
            <p>
              No se usan cuentas personales ni Telegram Business. Los pedidos por texto estan
              deshabilitados y el sistema no conserva mensajes libres.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Base legal, conservacion y destinatarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>
              El tratamiento de Telegram se basa en consentimiento libre, especifico, informado
              e inequivoco. Solo las suscripciones aceptadas, activas y con la version vigente
              reciben menus.
            </p>
            <p>
              Los identificadores Telegram se eliminan cuando el titular usa{' '}
              <code className="mx-1 rounded bg-muted px-1">/eliminarmisdatos</code>.
              Los pedidos sujetos a obligaciones administrativas pueden conservarse durante el
              plazo legal aplicable y son revisados por un administrador.
            </p>
            <p>
              Los datos operativos se procesan mediante Telegram, el backend de Eciencia Andina,
              Supabase y la infraestructura contratada para prestar el servicio.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Derechos del titular</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6">
            <p>
              Puedes solicitar acceso, rectificacion, actualizacion, eliminacion, oposicion,
              limitacion o revocar el consentimiento conforme a la Ley Organica de Proteccion de
              Datos Personales de Ecuador.
            </p>
            <p>
              En Telegram usa <code className="rounded bg-muted px-1">/misdatos</code>,{' '}
              <code className="mx-1 rounded bg-muted px-1">/eliminarmisdatos</code> o{' '}
              <code className="ml-1 rounded bg-muted px-1">/revocar</code>.
            </p>
            <p>
              Contacto de privacidad: <strong>{config?.contact || 'Consulte al administrador de Eciencia Andina.'}</strong>
            </p>
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
