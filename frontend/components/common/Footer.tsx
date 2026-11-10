import React from 'react';

export function Footer() {
  return (
    <footer className="border-t border-border bg-white py-6 sm:py-8 mt-auto">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-secondary text-center sm:text-left">
        <div className="flex items-center space-x-2 flex-wrap justify-center sm:justify-start">
          <span className="font-semibold text-foreground tracking-wider uppercase text-[11px]">SMC</span>
          <span>—</span>
          <span>Architectural Door & Window Showroom</span>
        </div>
        <div className="text-[11px] text-secondary">
          <span>WebXR • Android Scene Viewer • Apple ARKit</span>
        </div>
      </div>
    </footer>
  );
}
