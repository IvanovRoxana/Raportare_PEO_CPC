'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BriefcaseBusiness, CircleDollarSign, ClipboardList, FileText, LayoutDashboard, Loader2, ShieldCheck } from 'lucide-react';
import { getDashboardPathForRoles, getSignedInUser } from '@/lib/aws/auth';
import { resolveDashboardAccess } from '@/lib/pm-dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SelectDashboardPage() {
  const [canUseExpert, setCanUseExpert] = useState(false);
  const [canUsePm, setCanUsePm] = useState(false);
  const [canUseAchizitii, setCanUseAchizitii] = useState(false);
  const [canUseAdmin, setCanUseAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getSignedInUser().then((user) => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }

      const { canUseExpert: expertAccess, canUsePm: pmAccess, canUseAchizitii: procurementAccess } = resolveDashboardAccess({ roles: user.roles });
      const adminAccess = user.roles.includes('admin');
      const availableDashboards = [expertAccess, pmAccess, procurementAccess, adminAccess].filter(Boolean).length;

      if (availableDashboards <= 1) {
        router.replace(getDashboardPathForRoles(user.roles));
        return;
      }

      setCanUseExpert(expertAccess);
      setCanUsePm(pmAccess);
      setCanUseAchizitii(procurementAccess);
      setCanUseAdmin(adminAccess);
      setIsLoading(false);
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="p-2 bg-primary/10 rounded-lg">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">PEO 302141</h1>
            <p className="text-sm text-muted-foreground">Sistem de raportare</p>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Alege zona de lucru</CardTitle>
            <CardDescription>
              Contul tău are mai multe roluri. Alege explicit dacă lucrezi ca Expert, PM sau Admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {canUseExpert && (
                  <Button asChild size="lg" className="h-24 flex-col gap-2">
                    <Link href="/expert">
                      <LayoutDashboard className="h-6 w-6" />
                      Dashboard Expert
                    </Link>
                  </Button>
                )}

                {canUsePm && (
                  <Button asChild size="lg" variant="outline" className="h-24 flex-col gap-2">
                    <Link href="/pm">
                      <BriefcaseBusiness className="h-6 w-6" />
                      Dashboard PM
                    </Link>
                  </Button>
                )}

                {canUseAchizitii && (
                  <Button asChild size="lg" variant="outline" className="h-24 flex-col gap-2">
                    <Link href="/achizitii">
                      <ClipboardList className="h-6 w-6" />
                      Modul Achiziții
                    </Link>
                  </Button>
                )}

                {canUsePm && (
                  <Button asChild size="lg" variant="secondary" className="h-24 flex-col gap-2">
                    <Link href="/financiar">
                      <CircleDollarSign className="h-6 w-6" />
                      Dashboard financiar
                    </Link>
                  </Button>
                )}

                {canUseAdmin && (
                  <Button asChild size="lg" variant="default" className="h-24 flex-col gap-2">
                    <Link href="/super-admin">
                      <ShieldCheck className="h-6 w-6" />
                      Super admin / tehnic
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
