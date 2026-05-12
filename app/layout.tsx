import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ProjectIdentityBanner } from '@/components/project-identity-banner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Proiect PEO 302141 - Raportare',
  description: 'Sistem de raportare și verificare pentru proiecte cu finanțare europeană',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ro" className="bg-background">
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <ProjectIdentityBanner />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
