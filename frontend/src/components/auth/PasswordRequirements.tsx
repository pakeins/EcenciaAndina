import { Check, X } from 'lucide-react';

interface PasswordRequirementsProps {
  password: string;
}

export function PasswordRequirements({ password }: PasswordRequirementsProps) {
  const reqs = [
    { label: 'Al menos 8 caracteres', isValid: password.length >= 8 },
    { label: 'Mayúsculas y minúsculas', isValid: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: 'Un número', isValid: /[0-9]/.test(password) },
    { label: 'Un carácter especial (@, $, !, etc.)', isValid: /[^A-Za-z0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1 rounded-md border bg-muted/20 p-3">
      <p className="mb-2 text-sm font-medium">La contraseña debe contener:</p>
      {reqs.map((req, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {req.isValid ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-destructive" />
          )}
          <span
            className={
              req.isValid ? 'text-muted-foreground line-through' : 'font-medium text-destructive'
            }
          >
            {req.label}
          </span>
        </div>
      ))}
    </div>
  );
}
