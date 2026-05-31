import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'

import './styles.css'
import { DOCS_URL } from '@/config/site'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-prose',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
})

export const metadata = {
  metadataBase: new URL(DOCS_URL),
  description: 'kai-chattr governance, architecture, and contract docs.',
  title: 'kai · chattr docs',
  icons: {
    icon: '/kai-chattr-glyph.svg',
  },
}

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} flex min-h-screen flex-col`}
        style={{
          ['--bd-font-ui' as string]: 'var(--font-sans), Inter, sans-serif',
          ['--bd-font-prose' as string]: 'var(--font-prose), "Plus Jakarta Sans", sans-serif',
          ['--bd-font-mono' as string]: 'var(--font-mono), "JetBrains Mono", monospace',
        }}
      >
        {children}
      </body>
    </html>
  )
}
