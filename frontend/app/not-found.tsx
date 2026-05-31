import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
      <p className="text-7xl font-black text-slate-200 select-none">404</p>
      <p className="text-lg font-semibold text-slate-700">Page not found</p>
      <p className="text-sm text-slate-400 max-w-xs">
        The page you&apos;re looking for doesn&apos;t exist or may have been moved.
      </p>
      <Link
        href="/home"
        className="mt-3 rounded-lg bg-[#1b3a6b] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#162d56] transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}
