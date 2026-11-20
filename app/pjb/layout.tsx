import type { Metadata } from 'next'
import PinGate from './components/PinGate'

export const metadata: Metadata = {
  title: 'Budget Control System',
  description: 'BARE NOTE STUDIO プロジェクト予算管理',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Budget Control' },
}

export default function PjbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pjb-theme">
      {/* 配色・フォント（Asana風）：Inter＋Noto Sans JP。/pjb の中だけで読み込む */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <PinGate>{children}</PinGate>
    </div>
  )
}
