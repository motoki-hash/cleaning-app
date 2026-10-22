import type { Metadata } from 'next'
import PinGate from './components/PinGate'

export const metadata: Metadata = {
  title: 'BNS PJ管理システム',
  description: 'BARE NOTE STUDIO プロジェクト予算管理',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'BNS PJ管理' },
}

export default function PjbLayout({ children }: { children: React.ReactNode }) {
  return <div className="pjb-theme"><PinGate>{children}</PinGate></div>
}
