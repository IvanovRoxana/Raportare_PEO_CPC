import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Mail, FileText } from 'lucide-react'

export default function SignUpSuccessPage() {
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
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-green-100 dark:bg-green-900/30 rounded-full w-fit">
              <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Cont creat cu succes!</CardTitle>
            <CardDescription>
              Am trimis un email de confirmare
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
              <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">Verifică-ți emailul</p>
                <p className="text-muted-foreground">
                  Ți-am trimis un link de confirmare. Apasă pe link pentru a activa contul tău.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                După confirmarea emailului, te poți autentifica:
              </p>
              <Button asChild className="w-full">
                <Link href="/auth/login">
                  Mergi la autentificare
                </Link>
              </Button>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Nu ai primit emailul? Verifică folderul de spam sau{' '}
                <Link href="/auth/sign-up" className="text-primary hover:underline">
                  încearcă din nou
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
