import { Suspense } from 'react'
import { LoginCard, LoginCardFallback } from '@/components/auth/login-card'
import { FileText } from 'lucide-react'

export default function LoginPage() {
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

        <Suspense fallback={<LoginCardFallback />}>
          <LoginCard />
        </Suspense>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Proiect PEO 302141 - Sistem de raportare și verificare
        </p>
      </div>
    </div>
  )
}
