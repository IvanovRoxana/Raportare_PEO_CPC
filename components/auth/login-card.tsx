'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getDashboardPathForRoles, getSignedInUser, signInWithEmail } from '@/lib/aws/auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Mail } from 'lucide-react';

type LoginCardProps = {
  redirectTo?: string;
  title?: string;
  description?: string;
};

export function LoginCard({
  redirectTo,
  title = 'Autentificare',
  description = 'Introdu datele de autentificare pentru a continua',
}: LoginCardProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const nextPath = redirectTo || searchParams.get('redirectTo') || '/expert';

  const redirectToDashboard = (userRoles?: Parameters<typeof getDashboardPathForRoles>[0]) => {
    const path = userRoles ? getDashboardPathForRoles(userRoles) : nextPath;
    window.location.assign(path);
  };

  useEffect(() => {
    let isMounted = true;

    getSignedInUser()
      .then((user) => {
        if (!isMounted || !user) return;
        redirectToDashboard(user.roles);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const existingUser = await getSignedInUser();
      if (existingUser) {
        redirectToDashboard(existingUser.roles);
        return;
      }

      if (!email.trim() || !password) {
        setError('Completează emailul și parola pentru autentificare.');
        setIsLoading(false);
        return;
      }

      const result = await signInWithEmail(email, password);

      if (result.nextStep.signInStep !== 'DONE') {
        setError('Autentificarea necesită confirmare sau un pas suplimentar în AWS Cognito.');
        setIsLoading(false);
        return;
      }

      const user = await getSignedInUser();
      redirectToDashboard(user?.roles);
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : '';
      const normalizedMessage = message.toLowerCase();

      if (normalizedMessage.includes('already') && normalizedMessage.includes('signed in')) {
        const user = await getSignedInUser();
        redirectToDashboard(user?.roles);
        return;
      }

      setError(
        message.includes('Incorrect username or password') || message.includes('User does not exist')
          ? 'Email sau parolă incorecte.'
          : message || 'Autentificarea AWS nu a reușit.',
      );
      setIsLoading(false);
    }
  };

  return (
    <Card className="rounded-lg border-border shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="email@concordia.ro"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="pl-10"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Parolă</Label>
              <Link
                href="/auth/forgot-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                Am uitat parola
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="Introdu parola"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pl-10"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Se autentifică...
              </>
            ) : (
              'Intră în aplicație'
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
        <p>
          Nu ai cont?{' '}
          <Link href="/auth/sign-up" className="font-medium text-primary hover:underline">
            Înregistrează-te
          </Link>
        </p>
        <p className="text-xs">
          Accesul este destinat experților și echipei de management de proiect.
        </p>
      </CardFooter>
    </Card>
  );
}

export function LoginCardFallback() {
  return (
    <Card className="rounded-lg border-border shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Autentificare</CardTitle>
        <CardDescription>Se încarcă formularul...</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
