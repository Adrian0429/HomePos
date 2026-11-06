import './globals.css';
import Navigation from '@/components/navigation';
export const metadata = {title:'HomePOS · Kasir & Gudang', description:'Kasir minuman, pembelian plastik, dan pengiriman pabrik'};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="id"><body><Navigation/>{children}</body></html>;
}
