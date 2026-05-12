'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { confirmPasswordReset, requestPasswordReset } from '@/lib/aws/auth';
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestCode = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await requestPasswordReset(email);
      setCodeSent(true);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : '';
      setError(message || 'Nu am putut trimite codul de resetare.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError('Parolele nu coincid.');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Parola trebuie să aibă cel puțin 8 caractere.');
      setIsLoading(false);
      return;
    }

    try {
      await confirmPasswordReset(email, code, password);
      setSuccess(true);
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : '';
      setError(message || 'Parola nu a putut fi resetată.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {success ? 'Parolă resetată' : 'Am uitat parola'}
            </CardTitle>
            <CardDescription className="text-center">
              {success
                ? 'Poți intra acum în aplicație cu noua parolă.'
                : codeSent
                  ? 'Introdu codul primit pe email și noua parolă.'
                  : 'Introdu emailul contului pentru a primi codul de resetare.'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {success ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-muted p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Parola a fost actualizată cu succes.
                  </p>
                </div>
                <Button asChild className="w-full">
                  <Link href="/auth/login">Mergi la autentificare</Link>
                </Button>
              </div>
            ) : (
              <form
                onSubmit={codeSent ? handleConfirmReset : handleRequestCode}
                className="space-y-4"
              >
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
                      disabled={isLoading || codeSent}
                    />
                  </div>
                </div>

                {codeSent && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="code">Cod de confirmare</Label>
                      <Input
                        id="code"
                        inputMode="numeric"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Parolă nouă</Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          placeholder="Introdu parola nouă"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="pl-10"
                          required
                          disabled={isLoading}
                          minLength={8}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmă parola nouă</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Confirmă parola nouă"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                        disabled={isLoading}
                        minLength={8}
                      />
                    </div>
                  </>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Se procesează...
                    </>
                  ) : codeSent ? (
                    'Resetează parola'
                  ) : (
                    'Trimite codul'
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/auth/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Înapoi la autentificare
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
