import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { userApi } from '../api/client';

interface UserInfo {
  email: string;
  role: string;
  role_level: number;
  can_deploy: boolean;
}

interface UserContextType {
  user: UserInfo | null;
  isLoading: boolean;
  switchUser: (email: string) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = async () => {
    // Don't fetch if there's no token - prevents 401 loop on initial load
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userInfo = await userApi.getCurrentUser();
      setUser(userInfo);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      // Don't set a default user - let authentication handle it
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const switchUser = (email: string) => {
    // Store the dev user email in localStorage
    localStorage.setItem('dev_user_email', email);
    // Fetch user info again with the new email
    fetchUser();
  };

  return (
    <UserContext.Provider value={{ user, isLoading, switchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
