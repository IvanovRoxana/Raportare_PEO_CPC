import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, FileText } from 'lucide-react'

export default function AuthErrorPage() {
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
            <div className="mx-auto mb-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-full w-fit">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-2xl">Eroare de autentificare</CardTitle>
            <CardDescription>
              A apărut o problemă la autentificare
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground text-center">
                Linkul de confirmare poate fi expirat sau invalid.
                Te rugăm să încerci din nou.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Button asChild>
                <Link href="/auth/login">
                  Mergi la autentificare
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/auth/sign-up">
                  Creează cont nou
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
