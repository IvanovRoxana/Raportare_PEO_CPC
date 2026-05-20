import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type OperationalStatus =
  | 'conform'
  | 'cu_observatii'
  | 'neconform'
  | 'in_lucru'
  | 'verificat'
  | 'gata_export'
  | 'lipsa_documente'
  | 'informativ';

const statusClasses: Record<OperationalStatus, string> = {
  conform: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cu_observatii: 'border-amber-200 bg-amber-50 text-amber-800',
  neconform: 'border-red-200 bg-red-50 text-red-700',
  in_lucru: 'border-blue-200 bg-blue-50 text-blue-800',
  verificat: 'border-teal-200 bg-teal-50 text-teal-800',
  gata_export: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  lipsa_documente: 'border-orange-200 bg-orange-50 text-orange-800',
  informativ: 'border-slate-200 bg-slate-50 text-slate-700',
};

export function StatusBadge({
  status,
  className,
  children,
}: React.ComponentProps<typeof Badge> & {
  status: OperationalStatus;
}) {
  return (
    <Badge variant="outline" className={cn('rounded-full px-3 py-1 font-semibold', statusClasses[status], className)}>
      {children}
    </Badge>
  );
}
