# Authentication Service

This directory contains the authentication service for integrating with AWS Cognito using AWS Amplify.

## Files

- **authService.ts** - Core authentication service with methods for sign in, sign out, sign up, password reset, etc.
- **amplifyConfig.ts** - Amplify configuration for Cognito
- **useAuth.ts** - React hook for managing authentication state in components

## Setup

### 1. Install Dependencies

```bash
npm install aws-amplify
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your Cognito details:

```bash
cp .env.example .env.local
```

Update the following variables:
- `NEXT_PUBLIC_AWS_REGION` - Your AWS region (e.g., us-east-1)
- `NEXT_PUBLIC_COGNITO_USER_POOL_ID` - Your Cognito User Pool ID
- `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID` - Your Cognito App Client ID
- `NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID` - (Optional) Your Identity Pool ID

### 3. Initialize Amplify

In your root layout or app entry point, initialize Amplify:

```typescript
import { initializeAmplify } from '@/lib/auth/amplifyConfig';

// Call this once when your app starts
initializeAmplify();
```

## Usage

### Using the Auth Service Directly

```typescript
import { authService } from '@/lib/auth/authService';

// Sign in
const result = await authService.signIn('username', 'password');
if (result.success) {
  console.log('Signed in:', result.user);
}

// Sign out
await authService.signOut();

// Get current user
const user = await authService.getCurrentUser();

// Check if authenticated
const isAuth = await authService.isAuthenticated();
```

### Using the useAuth Hook (Recommended for React Components)

```typescript
'use client';

import { useAuth } from '@/lib/auth/useAuth';

export default function MyComponent() {
  const { user, isLoading, isAuthenticated, signIn, signOut } = useAuth();

  const handleSignIn = async () => {
    const result = await signIn('username', 'password');
    if (result.success) {
      console.log('Signed in!');
    } else {
      console.error('Sign in failed:', result.error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <button onClick={handleSignIn}>Sign In</button>;
  }

  return (
    <div>
      <p>Welcome, {user?.username}!</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

## API Reference

### authService

#### signIn(username: string, password: string)
Sign in a user with username and password.

**Returns:** `Promise<SignInResult>`

#### signOut()
Sign out the current user.

**Returns:** `Promise<{ success: boolean; error?: string }>`

#### signUp(username: string, password: string, email: string, attributes?: Record<string, string>)
Register a new user.

**Returns:** `Promise<SignUpResult>`

#### confirmSignUp(username: string, confirmationCode: string)
Confirm user registration with verification code.

**Returns:** `Promise<{ success: boolean; error?: string }>`

#### resetPassword(username: string)
Initiate password reset flow.

**Returns:** `Promise<ResetPasswordResult>`

#### confirmResetPassword(username: string, confirmationCode: string, newPassword: string)
Complete password reset with verification code and new password.

**Returns:** `Promise<{ success: boolean; error?: string }>`

#### getCurrentUser()
Get the currently authenticated user.

**Returns:** `Promise<AuthUser | null>`

#### isAuthenticated()
Check if a user is currently authenticated.

**Returns:** `Promise<boolean>`

#### getSession()
Get the current auth session with tokens.

**Returns:** `Promise<{ accessToken?: string; idToken?: string; error?: string }>`

#### getUserAttributes()
Get user attributes from the current session.

**Returns:** `Promise<Record<string, string> | null>`

### useAuth Hook

Returns an object with:
- `user: AuthUser | null` - Current authenticated user
- `isLoading: boolean` - Loading state
- `isAuthenticated: boolean` - Whether user is authenticated
- `signIn(username, password)` - Sign in function
- `signOut()` - Sign out function
- `signUp(username, password, email)` - Sign up function
- `resetPassword(username)` - Password reset function
- `refreshUser()` - Refresh current user data

## Creating a Cognito User Pool

If you don't have a Cognito User Pool yet:

1. Go to AWS Console → Cognito
2. Click "Create user pool"
3. Configure sign-in options (email, username)
4. Configure security requirements (password policy, MFA)
5. Configure sign-up experience
6. Configure message delivery (email/SMS)
7. Integrate your app (create app client)
8. Review and create

After creation, note down:
- User Pool ID
- App Client ID
- AWS Region

## Security Best Practices

1. **Never commit `.env.local`** - It contains sensitive credentials
2. **Use HTTPS in production** - Required for secure authentication
3. **Enable MFA** - Add extra security layer for users
4. **Set strong password policies** - Enforce complexity requirements
5. **Monitor auth events** - Use CloudWatch for suspicious activity
6. **Rotate credentials** - Regularly update app client secrets
7. **Use least privilege** - Grant minimal IAM permissions needed

## Troubleshooting

### "User pool client does not exist"
- Verify your `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID` is correct
- Ensure the app client exists in your user pool

### "User does not exist"
- User may not be registered yet
- Check if email verification is required

### "Incorrect username or password"
- Verify credentials are correct
- Check if user account is confirmed

### "Network error"
- Check internet connection
- Verify AWS region is correct
- Ensure Cognito service is accessible

## Additional Resources

- [AWS Amplify Documentation](https://docs.amplify.aws/nextjs/)
- [Amazon Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [Amplify Auth API Reference](https://docs.amplify.aws/nextjs/build-a-backend/auth/)
