'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clearAdminViewAsSession, getAdminViewAsSession, type AdminViewAsSession } from '@/lib/admin-view-as';

export function AdminViewAsBanner() {
  const [session, setSession] = useState<AdminViewAsSession | null>(null);

  useEffect(() => {
    setSession(getAdminViewAsSession());
  }, []);

  if (!session) return null;

  const handleReturn = () => {
    const returnPath = session.returnPath || '/admin';
    clearAdminViewAsSession();
    window.location.assign(returnPath);
  };

  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-950">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4" />
          <span>
            Modul admin view-as este activ: vezi aplicația ca <strong>{session.expertName}</strong>.
          </span>
        </div>
        <Button size="sm" variant="outline" className="h-8 border-amber-400 bg-white text-amber-950 hover:bg-amber-100" onClick={handleReturn}>
          <ArrowLeft className="h-4 w-4" />
          Return to dashboard admin
        </Button>
      </div>
    </div>
  );
}
