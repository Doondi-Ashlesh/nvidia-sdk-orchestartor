import type { Metadata } from 'next';
import { Barlow } from 'next/font/google';
import './globals.css';

// Barlow is the closest freely available match to NVIDIA Sans
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
  variable: '--font-barlow',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NVIDIA AI Ecosystem',
  description:
    'Interactive map of the official NVIDIA AI stack — understand how every service connects and find your path.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${barlow.variable} h-full`}>
      <body className="h-full bg-[#050505] text-white antialiased" style={{ fontFamily: 'var(--font-barlow), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
