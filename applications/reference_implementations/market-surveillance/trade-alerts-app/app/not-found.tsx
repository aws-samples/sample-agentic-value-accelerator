import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
            <div className="max-w-md w-full text-center">
                <div className="bg-white rounded-xl p-12 card-shadow">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-6xl font-bold text-[#232F3E] mb-4">404</h1>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-3">Alert Not Found</h2>
                    <p className="text-gray-600 mb-8">
                        The alert you're looking for doesn't exist or has been removed from the system.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center bg-[#007FAA] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#005276] transition-all duration-200 card-shadow hover:card-shadow-hover"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
