'use client';

import { useEffect, useState } from 'react';
import { initializeAmplify } from './amplifyConfig';

/**
 * Amplify Provider Component
 * 
 * Initializes Amplify on app mount and provides loading state.
 * This ensures Amplify is configured before any API calls are made.
 */
export function AmplifyProvider({ children }: { children: React.ReactNode }) {
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const init = async () => {
            await initializeAmplify();
            setIsInitialized(true);
        };
        init();
    }, []);

    // Show loading state while Amplify initializes
    if (!isInitialized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007FAA] mx-auto mb-4"></div>
                    <p className="text-gray-600 text-sm">Initializing...</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
