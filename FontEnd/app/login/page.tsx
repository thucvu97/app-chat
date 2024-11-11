'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth'
import { useAuthState } from 'react-firebase-hooks/auth'
import { auth } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Chrome } from 'lucide-react'

export default function GoogleLogin() {
  const [user, loading, error] = useAuthState(auth)
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  useEffect(() => {
    if (user) {
      router.push('/')
    }
  }, [user, router])

  const signInWithGoogle = async () => {
    setIsSigningIn(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (error) {
      setAuthError('Failed to sign in with Google. Please try again.')
      console.error('Error signing in with Google', error)
    } finally {
      setIsSigningIn(false)
    }
  }

  const signOut = async () => {
    try {
      await auth.signOut()
    } catch (error) {
      console.error('Error signing out', error)
    }
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (error) {
    return <div>Error: {error.message}</div>
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md">
        <h1 className="mb-6 text-2xl font-bold text-center">Google Login</h1>
        {user ? (
          <div className="text-center">
            <p className="mb-4">Welcome, {user.displayName}!</p>
            <Button onClick={signOut} variant="outline">Sign Out</Button>
          </div>
        ) : (
          <div className="text-center">
            <Button 
              onClick={signInWithGoogle} 
              disabled={isSigningIn}
              className="flex items-center gap-2"
            >
              <Chrome className="w-5 h-5" />
              {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
            </Button>
            {authError && <p className="mt-4 text-red-500">{authError}</p>}
          </div>
        )}
      </div>
    </div>
  )
}