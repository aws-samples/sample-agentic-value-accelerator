export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg"></div>
            <span className="text-xl font-semibold text-gray-900">
              Control Plane
            </span>
          </div>

          <nav className="flex items-center space-x-6">
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">
              Documentation
            </a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">
              Templates
            </a>
            <a href="/health" className="text-sm text-gray-600 hover:text-gray-900">
              Status
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
