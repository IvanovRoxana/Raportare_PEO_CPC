'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSignedInUser, type AppUser } from '@/lib/aws/auth';

export function AdminAccessGuard({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    getSignedInUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .finally(() => {
        if (active) setChecked(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!checked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Se verifica accesul admin...
        </div>
      </div>
    );
  }

  if (!user?.roles.includes('admin')) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-lg border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <h1 className="text-lg font-semibold text-slate-950">Nu ai acces la Administrare</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Modulul admin este disponibil doar utilizatorilor cu rol Administrator confirmat in sesiunea curenta.
            </p>
          </div>
          <Button asChild>
            <Link href="/auth/select-dashboard">Alege dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
