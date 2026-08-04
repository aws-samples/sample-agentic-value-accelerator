import { Amplify } from 'aws-amplify';
import { signInWithRedirect, signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import config from './config';

const authEnabled = !!config?.AUTH?.USER_POOL_ID;

export function configureAuth() {
  const auth = config?.AUTH;
  if (!auth || !auth.USER_POOL_ID) return;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: auth.USER_POOL_ID,
        userPoolClientId: auth.USER_POOL_CLIENT_ID,
        identityPoolId: auth.IDENTITY_POOL_ID,
        loginWith: {
          oauth: {
            domain: auth.OAUTH_DOMAIN,
            scopes: ['openid', 'profile'],
            redirectSignIn: [auth.REDIRECT_SIGN_IN],
            redirectSignOut: [auth.REDIRECT_SIGN_OUT],
            responseType: 'code',
            providers: [{ custom: 'AmazonFederate' }],
          },
        },
      },
    },
  });
}

export async function getUser() {
  if (!authEnabled) return { username: 'guest' };
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}

export async function getSession() {
  if (!authEnabled) return null;
  try {
    return await fetchAuthSession();
  } catch {
    return null;
  }
}

export { authEnabled };

export function login() {
  signInWithRedirect({ provider: { custom: 'AmazonFederate' } });
}

export function logout() {
  signOut();
}
