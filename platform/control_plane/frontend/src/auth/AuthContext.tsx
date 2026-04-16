import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
};

const isValidPoolId = poolData.UserPoolId && poolData.UserPoolId.includes('_');
const userPool = isValidPoolId ? new CognitoUserPool(poolData) : null;

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: CognitoUser | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<{ needsNewPassword?: boolean }>;
  completeNewPassword: (newPassword: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Store cognitoUser for new-password flow
  const [pendingUser, setPendingUser] = useState<CognitoUser | null>(null);

  useEffect(() => {
    // Dev bypass when Cognito is not configured
    if (!userPool) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      setIsLoading(false);
      return;
    }
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (!err && session?.isValid()) {
        const idToken = session.getIdToken().getJwtToken();
        setUser(currentUser);
        setToken(idToken);
        localStorage.setItem('auth_token', idToken);
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    });
  }, []);

  const signIn = (email: string, password: string): Promise<{ needsNewPassword?: boolean }> => {
    return new Promise((resolve, reject) => {
      if (!userPool) return reject(new Error('Cognito not configured'));
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          const idToken = session.getIdToken().getJwtToken();
          setUser(cognitoUser);
          setToken(idToken);
          localStorage.setItem('auth_token', idToken);
          setIsAuthenticated(true);
          resolve({});
        },
        onFailure: (err) => reject(err),
        newPasswordRequired: () => {
          setPendingUser(cognitoUser);
          resolve({ needsNewPassword: true });
        },
      });
    });
  };

  const completeNewPassword = (newPassword: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!pendingUser) return reject(new Error('No pending user'));
      pendingUser.completeNewPasswordChallenge(newPassword, {}, {
        onSuccess: (session) => {
          const idToken = session.getIdToken().getJwtToken();
          setUser(pendingUser);
          setToken(idToken);
          localStorage.setItem('auth_token', idToken);
          setIsAuthenticated(true);
          setPendingUser(null);
          resolve();
        },
        onFailure: (err) => reject(err),
      });
    });
  };

  const forgotPassword = (email: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!userPool) return reject(new Error('Cognito not configured'));
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.forgotPassword({
        onSuccess: () => resolve(),
        onFailure: (err) => reject(err),
      });
    });
  };

  const confirmForgotPassword = (email: string, code: string, newPassword: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!userPool) return reject(new Error('Cognito not configured'));
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => resolve(),
        onFailure: (err) => reject(err),
      });
    });
  };

  const signOut = () => {
    if (user) user.signOut();
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    localStorage.removeItem('auth_token');
  };

  const changePassword = (oldPassword: string, newPassword: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!user) return reject(new Error('Not authenticated'));
      user.changePassword(oldPassword, newPassword, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, token, signIn, completeNewPassword, forgotPassword, confirmForgotPassword, changePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
