import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AppHeader } from '@/components/app-header'
import { StagingEnvironmentBanner } from '@/components/staging-environment-banner'
import { isProductionEnvironment } from '@/lib/runtime-environment'
import './globals.css'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

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
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-background text-foreground`}>
        <StagingEnvironmentBanner />
        <AppHeader />
        {children}
        {process.env.NODE_ENV === 'production' && isProductionEnvironment() && <Analytics />}
      </body>
    </html>
  )
}
