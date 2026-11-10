'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/cn';
import { useAuth } from '@/hooks/useAuth';

export function Navbar() {
  const pathname = usePathname();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();

  const isAuthPage = pathname === '/login' || pathname === '/register';

  return (
    <header className="w-full border-b border-border bg-white sticky top-0 z-50 backdrop-blur-md bg-white/95">
      <div className="container max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Identity */}
        <Link href="/" className="flex items-center space-x-2.5 group select-none">
          <span className="w-2.5 h-2.5 bg-primary inline-block transition-transform group-hover:scale-110" />
          <span className="text-xs sm:text-sm font-semibold tracking-wider text-foreground uppercase">
            SMC <span className="font-light text-secondary hidden xs:inline sm:inline">Doors & Windows</span>
          </span>
        </Link>

        {/* Dynamic Navigation */}
        {!isAuthPage && (
          <nav className="flex items-center space-x-3 sm:space-x-5 text-xs tracking-wide">
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className={cn(
                    'px-2 py-1 text-xs transition-colors hover:text-foreground',
                    pathname === '/dashboard' ? 'text-foreground font-semibold' : 'text-secondary'
                  )}
                >
                  Collection
                </Link>

                {isAdmin && (
                  <Link
                    href="/admin"
                    className={cn(
                      'px-2 py-1 text-xs transition-colors hover:text-foreground',
                      pathname === '/admin' ? 'text-primary font-semibold' : 'text-secondary'
                    )}
                  >
                    Admin
                  </Link>
                )}

                <div className="h-3.5 w-px bg-border hidden sm:block" />

                {/* User Status Pill (Visible on sm+ screens) */}
                <div className="hidden md:flex items-center space-x-1.5 text-[11px] text-secondary">
                  <span className="truncate max-w-[120px] font-medium text-foreground">{user?.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 border border-border uppercase font-semibold text-secondary">
                    {user?.role}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="text-xs text-secondary hover:text-red-600 transition-colors px-1.5 py-1"
                >
                  Log Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(
                    'px-2 py-1 text-xs transition-colors hover:text-foreground',
                    pathname === '/login' ? 'text-foreground font-semibold' : 'text-secondary'
                  )}
                >
                  Log In
                </Link>
                <Link
                  href="/register"
                  className="text-xs bg-primary text-primary-foreground hover:bg-primary-hover px-3 py-1.5 font-medium transition-colors uppercase tracking-wider text-[11px]"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
