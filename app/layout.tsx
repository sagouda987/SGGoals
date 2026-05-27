import type { Metadata, Viewport } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import '@/app/globals.css';
import { Providers } from '@/app/providers';

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin']
});

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin']
});

export const metadata: Metadata = {
  title: 'SG Goals',
  description: 'Track daily goals, streaks, scorecards, failures, and progress.',
  applicationName: 'SG Goals',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SG Goals'
  },
  icons: {
    icon: '/sg-goals-icon.svg',
    apple: '/sg-goals-icon.svg'
  }
};

export const viewport: Viewport = {
  themeColor: '#07070f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${manrope.variable} ${spaceGrotesk.variable}`}>
      <body className="font-[var(--font-manrope)]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
