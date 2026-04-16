export default function Footer() {
  return (
    <footer className="relative py-8 mt-12">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <p className="text-slate-400 text-sm flex items-center justify-center gap-1.5">
          Made with
          <svg
            className="w-4 h-4 text-red-500 animate-heartbeat"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 20 20"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
            />
          </svg>
          by FSI PACE Prototyping Team
        </p>
      </div>
    </footer>
  );
}
