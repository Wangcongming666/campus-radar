import type { Metadata } from 'next';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './globals.css';
import { Providers } from '@/components/providers';
export const metadata: Metadata = {
  title: { default: '校招雷达 Campus Radar · 让每一份努力都有回响', template: '%s · 校招雷达' },
  icons: { icon: '/favicon.svg' },
  description: '从发现心仪岗位到收获理想 Offer，你的校招全程助手。岗位探索、投递追踪与面试成长。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
