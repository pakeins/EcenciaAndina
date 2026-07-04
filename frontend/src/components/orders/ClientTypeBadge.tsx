import { Badge } from '@/components/ui/badge';
import { ClientType } from '@/types';
import { cn } from '@/lib/utils';
import { Building2, User } from 'lucide-react';

interface ClientTypeBadgeProps {
  type: ClientType;
}

export function ClientTypeBadge({ type }: ClientTypeBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1',
        type === 'convenio'
          ? 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
      )}
    >
      {type === 'convenio' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
      {type === 'convenio' ? 'Cliente de convenio' : 'Cliente frecuente'}
    </Badge>
  );
}
