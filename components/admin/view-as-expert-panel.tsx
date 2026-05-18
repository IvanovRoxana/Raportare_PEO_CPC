'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createAdminViewAsSession, setAdminViewAsSession } from '@/lib/admin-view-as';
import { getSignedInUser } from '@/lib/aws/auth';
import type { Expert } from '@/lib/types';

type Props = {
  experts: Expert[];
};

export function ViewAsExpertPanel({ experts }: Props) {
  const [selectedExpertId, setSelectedExpertId] = useState('');
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [canUseViewAs, setCanUseViewAs] = useState(false);

  useEffect(() => {
    getSignedInUser({ ignoreViewAs: true }).then((user) => {
      setCanUseViewAs(Boolean(user?.roles.includes('admin')));
      setIsCheckingAccess(false);
    }).catch(() => {
      setCanUseViewAs(false);
      setIsCheckingAccess(false);
    });
  }, []);

  const activeExperts = useMemo(
    () => experts.filter((expert) => expert.isActive !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [experts],
  );
  const selectedExpert = activeExperts.find((expert) => expert.id === selectedExpertId);

  const handleViewAs = () => {
    if (!selectedExpert || !canUseViewAs) return;

    setAdminViewAsSession(createAdminViewAsSession(selectedExpert));
    window.location.assign('/expert');
  };

  return (
    <Card className="rounded-lg border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-5 w-5 text-primary" />
          View as expert
        </CardTitle>
        <CardDescription>
          Selectează un expert și intră în aplicație exact cu perspectiva lui. În modul view-as apare butonul de revenire la dashboard admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Select value={selectedExpertId} onValueChange={setSelectedExpertId} disabled={!canUseViewAs || isCheckingAccess}>
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder="Alege expert" />
          </SelectTrigger>
          <SelectContent>
            {activeExperts.map((expert) => (
              <SelectItem key={expert.id} value={expert.id}>
                {expert.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!canUseViewAs && !isCheckingAccess && (
          <p className="text-xs leading-5 text-muted-foreground">
            Funcția este disponibilă doar pentru utilizatorii cu rol admin.
          </p>
        )}

        <Button className="w-full" onClick={handleViewAs} disabled={!selectedExpert || !canUseViewAs || isCheckingAccess}>
          {isCheckingAccess ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Rulează view as
        </Button>
      </CardContent>
    </Card>
  );
}
