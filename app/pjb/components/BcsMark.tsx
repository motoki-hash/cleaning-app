// Budget Control System のロゴマーク（青い角丸の四角に、右上がりの3本の棒と、先頭のコーラルの点）。
// 色は固定。大きさは size で指定する（px）。
export default function BcsMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="9" fill="#008CE3" />
      <rect x="7" y="17" width="4.4" height="8" rx="2.2" fill="#fff" fillOpacity=".55" />
      <rect x="13.8" y="13" width="4.4" height="12" rx="2.2" fill="#fff" fillOpacity=".8" />
      <rect x="20.6" y="9.5" width="4.4" height="15.5" rx="2.2" fill="#fff" />
      <circle cx="22.8" cy="6" r="2.2" fill="#F06A6A" />
    </svg>
  )
}
