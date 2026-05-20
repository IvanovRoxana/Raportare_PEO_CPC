import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { FileText, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DashboardTone = 'navy' | 'blue' | 'success' | 'warning' | 'danger' | 'violet' | 'slate';

const toneClasses: Record<DashboardTone, { icon: string; text: string; progress: string; soft: string }> = {
  navy: {
    icon: 'bg-[#eaf3fb] text-[#0b3a67]',
    text: 'text-[#0b3a67]',
    progress: 'bg-[#0b3a67]',
    soft: 'bg-[#eaf3fb]',
  },
  blue: {
    icon: 'bg-[#eaf3fb] text-blue-700',
    text: 'text-blue-700',
    progress: 'bg-blue-500',
    soft: 'bg-[#eaf3fb]',
  },
  success: {
    icon: 'bg-[#e9faf5] text-[#087a63]',
    text: 'text-[#087a63]',
    progress: 'bg-[#36c2a0]',
    soft: 'bg-[#e9faf5]',
  },
  warning: {
    icon: 'bg-[#fff7e6] text-[#b7791f]',
    text: 'text-[#b7791f]',
    progress: 'bg-amber-400',
    soft: 'bg-[#fff7e6]',
  },
  danger: {
    icon: 'bg-[#fff1f2] text-[#dc2626]',
    text: 'text-[#dc2626]',
    progress: 'bg-red-400',
    soft: 'bg-[#fff1f2]',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-700',
    text: 'text-violet-700',
    progress: 'bg-violet-500',
    soft: 'bg-violet-50',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-600',
    text: 'text-slate-600',
    progress: 'bg-slate-400',
    soft: 'bg-slate-100',
  },
};

export function ProgressBar({
  value,
  tone = 'success',
  className,
}: {
  value: number;
  tone?: DashboardTone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn('h-2.5 overflow-hidden rounded-full bg-slate-100', className)}>
      <div className={cn('h-full rounded-full', toneClasses[tone].progress)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  description,
  trend,
  progress,
  tone = 'navy',
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  description?: ReactNode;
  trend?: ReactNode;
  progress?: number;
  tone?: DashboardTone;
  className?: string;
}) {
  return (
    <Card className={cn('justify-between rounded-[1.5rem] py-0', className)}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem]', toneClasses[tone].icon)}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600">{label}</p>
            <div className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{value}</div>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {progress !== undefined ? (
          <div className="mt-4 flex items-center gap-3">
            <ProgressBar value={progress} tone={tone === 'danger' ? 'danger' : 'success'} className="flex-1" />
            <span className="text-sm font-semibold text-slate-700">{progress}%</span>
          </div>
        ) : null}
        {trend ? <div className={cn('mt-4 text-sm font-semibold', toneClasses[tone].text)}>{trend}</div> : null}
      </CardContent>
    </Card>
  );
}

export function RightInfoCard({
  title,
  icon: Icon,
  children,
  action,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('rounded-[1.5rem] py-0', className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-6 pt-6">
        <CardTitle className="flex items-center gap-3 text-lg font-bold text-slate-950">
          {Icon ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf3fb] text-[#0b3a67]">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-6 pt-4">{children}</CardContent>
    </Card>
  );
}

export function DataTable({
  columns,
  rows,
  footer,
  className,
}: {
  columns: string[];
  rows: ReactNode[][];
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('overflow-hidden rounded-[1.5rem] py-0', className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-6 py-4 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-50/80">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-6 py-4 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer ? <div className="border-t border-slate-100 px-6 py-4">{footer}</div> : null}
    </Card>
  );
}

export function FormSection({
  index,
  title,
  icon: Icon = FileText,
  children,
  className,
}: {
  index?: number;
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-b border-slate-100 pb-6 last:border-b-0 last:pb-0', className)}>
      <h2 className="mb-4 flex items-center gap-3 text-base font-bold text-slate-950">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#eaf3fb] text-[#0b3a67]">
          <Icon className="h-4 w-4" />
        </span>
        {index ? `${index}. ` : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

export function UploadDropzone({
  title = 'Trage și plasează fișierele aici',
  description = 'sau',
  actionLabel = 'Alege fișiere',
  helper = 'Formate acceptate: PDF, DOCX, XLSX, PPTX, ZIP',
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  helper?: string;
}) {
  return (
    <div>
      <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-[#b9cbe0] bg-white/70 px-4 py-6 text-center">
        <Upload className="h-7 w-7 text-[#0b3a67]" />
        <p className="mt-3 font-semibold text-slate-700">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button type="button" variant="outline" className="mt-3">
          {actionLabel}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

export function EmptyState({
  icon: Icon = FileText,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf3fb] text-[#0b3a67]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-bold text-slate-950">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
