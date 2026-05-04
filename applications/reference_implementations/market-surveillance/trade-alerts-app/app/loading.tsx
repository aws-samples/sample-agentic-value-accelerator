export default function Loading() {
    return (
        <div className="container mx-auto px-6 py-16">
            <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007FAA]"></div>
                <p className="text-gray-600">Loading alerts...</p>
            </div>
        </div>
    );
}
