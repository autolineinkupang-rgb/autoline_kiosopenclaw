import './globals.css';
import NavTabs from '../components/NavTabs';

export const metadata = {
  title: 'Kios Desa Maju',
  description: 'Dashboard Manajemen Kios — Rote Barat Laut, NTT',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <header className="bg-green-900 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-5 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-green-700 rounded-xl flex items-center justify-center text-xl shadow-inner">
                🏪
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight tracking-tight">Kios Desa Maju</h1>
                <p className="text-green-400 text-xs">Rote Barat Laut, NTT</p>
              </div>
            </div>
            <span className="text-green-500 text-xs font-medium hidden md:block">v5.0</span>
          </div>
          <NavTabs />
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6 min-h-[calc(100vh-130px)]">
          {children}
        </main>

        <footer className="text-center text-gray-400 text-xs py-3 border-t border-gray-200">
          Kios Openclaw v5.0 &bull; {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
