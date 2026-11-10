'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function OpeningPage() {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 sm:px-6 py-12 sm:py-20">
      <div className="w-full max-w-2xl mx-auto text-center space-y-8 sm:space-y-10">
        {/* Identity Badge */}
        <div className="space-y-4 sm:space-y-5">
          <div className="inline-flex items-center space-x-2 border border-border px-3 py-1 bg-white shadow-sm">
            <span className="w-2 h-2 bg-primary inline-block" />
            <span className="text-[10px] sm:text-[11px] uppercase tracking-widest text-secondary font-medium">
              Augmented Reality Platform
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-light tracking-tight text-foreground leading-[1.15]">
            SMC <span className="font-semibold text-primary">Doors & Windows</span>
          </h1>

          <p className="text-xs sm:text-sm md:text-base text-secondary max-w-lg mx-auto leading-relaxed">
            Architectural 3D door and window models rendered with true physical dimensions. Inspect on desktop or project at 1:1 scale in your physical space with Augmented Reality.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button asChild variant="gold" size="lg" className="w-full sm:w-auto min-w-[170px] h-12 text-xs uppercase tracking-wider font-semibold shadow-sm">
            <Link href="/login">Explore Showroom</Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full sm:w-auto min-w-[170px] h-12 text-xs uppercase tracking-wider font-semibold">
            <Link href="/register">Create Account</Link>
          </Button>
        </div>

        {/* Capability Feature Badges */}
        <div className="pt-6 sm:pt-8 border-t border-border/60 flex items-center justify-center gap-4 sm:gap-8 text-[11px] text-secondary flex-wrap">
          <div className="flex items-center space-x-1.5">
            <span className="text-primary font-bold">✓</span>
            <span>Google &lt;model-viewer&gt; 3D</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-primary font-bold">✓</span>
            <span>Android Scene Viewer</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-primary font-bold">✓</span>
            <span>Apple AR Quick Look</span>
          </div>
        </div>
      </div>
    </div>
  );
}
