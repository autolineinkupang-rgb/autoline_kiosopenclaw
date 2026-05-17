import './globals.css';

export const metadata = {
  title: 'Kios Desa Maju — Dashboard',
  description: 'Sistem Manajemen Kios Desa berbasis AI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <header className="bg-green-700 text-white px-6 py-3 flex items-center justify-between shadow">
          <div>
            <h1 className="text-xl font-bold">🏪 Kios Desa Maju</h1>
            <p className="text-green-200 text-xs">Dashboard Manajemen — by Ruflo</p>
          </div>
          <span className="text-green-200 text-sm hidden md:block">
            Powered by Groq + Gemini
          </span>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
        <footer className="text-center text-gray-400 text-xs py-4 mt-8">
          Kios Openclaw v1.0 • {new Date().getFullYear()} • kiossaya.vercel.app
        </footer>
      </body>
    </html>
  );
}
