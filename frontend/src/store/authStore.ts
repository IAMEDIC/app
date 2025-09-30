import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState, User } from '@/types';

interface AuthStore extends AuthState {
  login: (user: User, token: string) => void;
  logout: () => void;
  updateToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: (user: User, token: string) => {
        // With httpOnly cookies, token is managed by the browser
        // Keep localStorage for backward compatibility
        if (token) {
          localStorage.setItem('access_token', token);
        }
        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      },

      logout: () => {
        // Clear token from localStorage (backward compatibility)
        localStorage.removeItem('access_token');
        
        // Call logout endpoint to clear httpOnly cookies
        fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include' // Include httpOnly cookies
        }).catch(err => {
          console.warn('Failed to call logout endpoint:', err);
        });
        
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      },

      updateToken: (token: string) => {
        // With httpOnly cookies, token is automatically updated by browser
        // Keep localStorage for backward compatibility
        if (token && token !== 'cookie-token') {
          localStorage.setItem('access_token', token);
        }
        // No need to update state as user info doesn't change
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading });
      },

      setError: (error: string | null) => {
        set({ error, isLoading: false });
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);