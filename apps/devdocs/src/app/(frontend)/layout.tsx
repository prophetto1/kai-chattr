import type { ReactNode } from 'react'
import { IBM_Plex_Sans, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google'

import './styles.css'
import { DOCS_URL, SITE_NAME, SITE_TAGLINE } from '@/config/site'

// KAI CIBI fonts — Space Grotesk display, IBM Plex Sans UI/body, IBM Plex Mono code.
// Brand source of truth: E:\kai-ai\apps\web\src\styles\kai-brand.css
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
})

export const metadata = {
  metadataBase: new URL(DOCS_URL),
  description: SITE_TAGLINE,
  title: SITE_NAME,
  icons: {
    icon: '/kai-chattr-glyph.svg',
  },
}

export default function RootLayout(props: { children: ReactNode }) {
  const { children } = props

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${plexSans.variable} ${spaceGrotesk.variable} ${plexMono.variable} flex min-h-screen flex-col`}
        style={{
          ['--bd-font-ui' as string]: 'var(--font-sans), "IBM Plex Sans", system-ui, sans-serif',
          ['--bd-font-display' as string]: 'var(--font-display), "Space Grotesk", system-ui, sans-serif',
          ['--bd-font-prose' as string]: 'var(--font-sans), "IBM Plex Sans", system-ui, sans-serif',
          ['--bd-font-mono' as string]: 'var(--font-mono), "IBM Plex Mono", ui-monospace, monospace',
        }}
      >
        {children}
      </body>
    </html>
  )
}
