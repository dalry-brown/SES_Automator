'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// The configured MSAL redirectUri is the app root (NEXT_PUBLIC_MSAL_REDIRECT_URI),
// not this path. If someone lands here directly, send them to login.
export default function AuthCallbackPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return null;
}
