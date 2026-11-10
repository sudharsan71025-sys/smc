export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
      <div className="w-8 h-8 border-2 border-border border-t-[#C5A572] rounded-full animate-spin" />
      <span className="text-[10px] uppercase tracking-widest text-secondary font-medium">
        Loading SMC Architectural Space...
      </span>
    </div>
  );
}

