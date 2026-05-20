'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/kasir', label: 'Kasir', icon: '🛒' },
  { href: '/gudang', label: 'Gudang', icon: '📦' },
];

export default function NavTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 px-5 pt-2">
      {TABS.map(t => (
        <Link key={t.href} href={t.href}
          className={`flex items-center gap-2 px-5 py-2 rounded-t-xl text-sm font-semibold transition-all ${
            path === t.href
              ? 'bg-slate-50 text-green-800 shadow-sm'
              : 'text-green-300 hover:bg-green-800/70 hover:text-white'
          }`}>
          <span className="text-base leading-none">{t.icon}</span>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
