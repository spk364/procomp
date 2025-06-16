import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@procomp/utils';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'ProComp - BJJ Tournament Management',
    template: '%s | ProComp',
  },
  description: 'Modern platform for managing Brazilian Jiu-Jitsu tournaments',
  keywords: ['BJJ', 'Brazilian Jiu-Jitsu', 'tournament', 'competition', 'martial arts'],
  authors: [{ name: 'ProComp Team' }],
  creator: 'ProComp Team',
  metadataBase: new URL('https://procomp.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://procomp.app',
    title: 'ProComp - BJJ Tournament Management',
    description: 'Modern platform for managing Brazilian Jiu-Jitsu tournaments',
    siteName: 'ProComp',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ProComp - BJJ Tournament Management',
    description: 'Modern platform for managing Brazilian Jiu-Jitsu tournaments',
    creator: '@procomp',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'google-verification-code',
    yandex: 'yandex-verification-code',
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, 'min-h-screen bg-background font-sans antialiased')}>
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
          </div>
        </Providers>
      </body>
    </html>
  );
} 