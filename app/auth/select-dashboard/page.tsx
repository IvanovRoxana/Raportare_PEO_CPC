'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BriefcaseBusiness, CircleDollarSign, FileText, LayoutDashboard, Loader2 } from 'lucide-react';
import { getDashboardPathForRoles, getSignedInUser } from '@/lib/aws/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SelectDashboardPage() {
  const [canUseExpert, setCanUseExpert] = useState(false);
  const [canUsePm, setCanUsePm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getSignedInUser().then((user) => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }

      const expertAccess = user.roles.includes('expert');
      const pmAccess = user.roles.includes('pm') || user.roles.includes('admin');

      if (!(expertAccess && pmAccess)) {
        router.replace(getDashboardPathForRoles(user.roles));
        return;
      }

      setCanUseExpert(expertAccess);
      setCanUsePm(pmAccess);
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
              Contul tău are acces atât la zona de expert, cât și la zona PM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
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

                {canUsePm && (
                  <Button asChild size="lg" variant="secondary" className="h-24 flex-col gap-2">
                    <Link href="/financiar">
                      <CircleDollarSign className="h-6 w-6" />
                      Dashboard financiar
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
