import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12 text-center select-none">
      <div className="max-w-md w-full border border-border bg-white p-8 sm:p-10 shadow-sm space-y-5">
        <span className="text-[10px] uppercase tracking-widest text-[#C5A572] font-semibold block">
          404 Catalog Error
        </span>
        <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-[#202020]">
          Model Not Found
        </h1>
        <p className="text-xs text-secondary leading-relaxed">
          The requested architectural 3D door or window model, asset, or page could not be located in the catalog.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild variant="gold" size="sm" className="w-full sm:w-auto text-xs uppercase tracking-wider">
            <Link href="/dashboard">View 3D Collection</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto text-xs">
            <Link href="/">Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
