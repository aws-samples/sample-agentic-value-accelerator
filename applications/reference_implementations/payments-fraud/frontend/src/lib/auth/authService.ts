/**
 * Cognito authentication via Amplify. Adapted (trimmed) from the market-surveillance
 * reference app - sign-in / sign-out / session / current-user.
 */
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  type SignInInput,
} from "aws-amplify/auth";

export interface AuthUser {
  username: string;
  userId: string;
  email?: string;
}

export interface SignInResult {
  success: boolean;
  user?: AuthUser;
  nextStep?: string;
  error?: string;
}

class AuthService {
  async signIn(username: string, password: string): Promise<SignInResult> {
    try {
      const input: SignInInput = { username, password };
      const { isSignedIn, nextStep } = await signIn(input);
      if (isSignedIn) {
        const user = await this.getCurrentUser();
        return { success: true, user: user ?? undefined, nextStep: nextStep.signInStep };
      }
      return { success: false, nextStep: nextStep.signInStep };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : "Failed to sign in" };
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const session = await fetchAuthSession();
      return !!session.tokens?.accessToken;
    } catch {
      return false;
    }
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      if (!(await this.isAuthenticated())) return null;
      const { username, userId, signInDetails } = await getCurrentUser();
      return { username, userId, email: signInDetails?.loginId };
    } catch {
      return null;
    }
  }

  /** Cognito id/access tokens - for forwarding to a JWT-authorized backend if needed. */
  async getSession(): Promise<{ accessToken?: string; idToken?: string }> {
    try {
      const session = await fetchAuthSession();
      return {
        accessToken: session.tokens?.accessToken?.toString(),
        idToken: session.tokens?.idToken?.toString(),
      };
    } catch {
      return {};
    }
  }
}

export const authService = new AuthService();
