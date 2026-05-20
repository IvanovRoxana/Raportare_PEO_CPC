import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type OperationalStatus =
  | 'conform'
  | 'aprobat'
  | 'cu_observatii'
  | 'neconform'
  | 'respins'
  | 'in_lucru'
  | 'in_analiza'
  | 'draft'
  | 'in_revizie'
  | 'partial'
  | 'verificat'
  | 'gata_export'
  | 'lipsa_documente'
  | 'lipsa'
  | 'deschisa'
  | 'inchisa'
  | 'informativ';

const statusClasses: Record<OperationalStatus, string> = {
  conform: 'border-emerald-200 bg-[#e9faf5] text-[#087a63]',
  aprobat: 'border-emerald-200 bg-[#e9faf5] text-[#087a63]',
  cu_observatii: 'border-amber-200 bg-[#fff7e6] text-[#b7791f]',
  neconform: 'border-red-200 bg-[#fff1f2] text-[#dc2626]',
  respins: 'border-red-200 bg-[#fff1f2] text-[#dc2626]',
  in_lucru: 'border-blue-200 bg-[#eaf3fb] text-[#0b3a67]',
  in_analiza: 'border-blue-200 bg-[#eaf3fb] text-[#0b3a67]',
  draft: 'border-blue-200 bg-[#eaf3fb] text-[#0b3a67]',
  in_revizie: 'border-amber-200 bg-[#fff7e6] text-[#b7791f]',
  partial: 'border-amber-200 bg-[#fff7e6] text-[#b7791f]',
  verificat: 'border-emerald-200 bg-[#e9faf5] text-[#087a63]',
  gata_export: 'border-emerald-200 bg-[#e9faf5] text-[#087a63]',
  lipsa_documente: 'border-red-200 bg-[#fff1f2] text-[#dc2626]',
  lipsa: 'border-red-200 bg-[#fff1f2] text-[#dc2626]',
  deschisa: 'border-emerald-200 bg-[#e9faf5] text-[#087a63]',
  inchisa: 'border-slate-200 bg-slate-100 text-slate-600',
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
