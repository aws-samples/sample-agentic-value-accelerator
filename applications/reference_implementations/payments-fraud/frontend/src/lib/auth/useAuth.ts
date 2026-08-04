"use client";

import { useState, useEffect, useCallback } from "react";
import { Hub } from "aws-amplify/utils";

import { authService, type AuthUser } from "./authService";

export interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setIsLoading(true);
    try {
      setUser(await authService.getCurrentUser());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    const unlisten = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") loadUser();
      if (payload.event === "signedOut") setUser(null);
    });
    return () => unlisten();
  }, [loadUser]);

  const signIn = async (username: string, password: string) => {
    const result = await authService.signIn(username, password);
    if (result.success && result.user) {
      setUser(result.user);
      return { success: true };
    }
    return { success: false, error: result.error || "Sign in failed" };
  };

  const signOut = async () => {
    await authService.signOut();
    setUser(null);
  };

  return {
    user,
    isLoading,
    isAuthenticated: user !== null,
    signIn,
    signOut,
  };
}
