'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { authService } from '@/lib/auth/authService';
import { useDomain } from '@/lib/context/DomainContext';
import { DOMAIN_OPTIONS } from '@/types/domain';
import type { DomainOption } from '@/types/domain';

export default function SelectDomainPage() {
  const router = useRouter();
  const { setSelectedDomain } = useDomain();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = await authService.isAuthenticated();
      if (!isAuthenticated) {
        router.push('/login');
      } else {
        setIsCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  const handleSelectDomain = (domain: DomainOption) => {
    setSelectedDomain(domain.id);
    router.push(domain.route);
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#232F3E] mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-[#232F3E] mb-2">Select Domain</h1>
          <p className="text-sm text-gray-600">Choose a product domain to get started</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {DOMAIN_OPTIONS.map((domain) => (
            <button
              key={domain.id}
              onClick={() => handleSelectDomain(domain)}
              className="bg-white rounded-xl p-6 text-left border-2 border-gray-200 hover:border-[#007FAA] hover:shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#007FAA] focus:ring-offset-2"
            >
              <h2 className="text-lg font-semibold text-[#232F3E] mb-2">{domain.name}</h2>
              <p className="text-sm text-gray-600">{domain.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
