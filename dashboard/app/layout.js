import './globals.css';
import NavTabs from '../components/NavTabs';

export const metadata = {
  title: 'Kios Desa Maju — Dashboard',
  description: 'Sistem Manajemen Kios Desa berbasis AI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <header className="bg-green-700 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-6 pt-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Kios Desa Maju</h1>
              <p className="text-green-200 text-xs">Sistem Manajemen Kios</p>
            </div>
            <span className="text-green-200 text-xs hidden md:block">Kios Openclaw v2.0</span>
          </div>
          <NavTabs />
        </header>
        <main className="max-w-7xl mx-auto px-4 py-5">{children}</main>
        <footer className="text-center text-gray-400 text-xs py-4 mt-6 border-t">
          Kios Openclaw v2.0 &bull; {new Date().getFullYear()}
        </footer>
      </body>
    </html>
  );
}
