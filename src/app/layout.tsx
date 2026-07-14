import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ForgePipeline AI — Never Miss a Lead',
  description:
    'AI-powered lead capture, missed-call recovery, and automated CRM for local service businesses. Roofers, HVAC, plumbers, and contractors.',
  keywords: 'AI lead generation, missed call automation, contractor CRM, roofer software, HVAC software',
  openGraph: {
    title: 'ForgePipeline AI',
    description: 'Stop losing jobs to faster competitors. AI responds to every lead in 60 seconds.',
    url: 'https://forgepipelineai.com',
    siteName: 'ForgePipeline AI',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
