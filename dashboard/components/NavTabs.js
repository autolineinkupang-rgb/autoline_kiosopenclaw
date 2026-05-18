'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Dashboard' },
  { href: '/kasir', label: 'Kasir' },
  { href: '/gudang', label: 'Gudang' },
];

export default function NavTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 px-6 pt-1 pb-0">
      {TABS.map(t => (
        <Link key={t.href} href={t.href}
          className={`px-5 py-1.5 rounded-t-lg text-sm font-semibold transition-colors ${
            path === t.href
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-green-100 hover:bg-green-600'
          }`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
