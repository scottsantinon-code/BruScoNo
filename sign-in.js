export function createSignInAttempt({login,onBusy,onStatus,onError}) {
 let pending=false;
 return async function signIn() {
  if(pending)return;
  pending=true;onBusy(true);onError('');onStatus('Choose your account in the Google sign-in window.');
  try {await login();}
  catch(error) {
   const messages={
    'auth/cancelled-popup-request':'Google sign-in was interrupted by another attempt. Close any extra sign-in windows, then try once more.',
    'auth/popup-closed-by-user':'The Google window closed before sign-in finished. Tap Continue with Google to try again.',
    'auth/popup-blocked':'Your browser blocked the Google window. Allow pop-ups for this site, then try again. If you opened the link inside another app, open it in Safari or Chrome.',
    'auth/network-request-failed':'Google sign-in could not connect. Check your internet connection and try again.',
    'auth/unauthorized-domain':'This browser address is not approved for household sign-in. Open the BruScoNo link in Safari or Chrome.'
   };
   onError(messages[error?.code]||error?.message||'Sign-in did not finish. Please try again.');
  } finally {pending=false;onBusy(false);onStatus('');}
 };
}
