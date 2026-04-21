import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => {
        localStorage.removeItem('acadex_token');
        set({ token: null, user: null });
      },
    }),
    {
      name: 'acadex-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.token) localStorage.setItem('acadex_token', state.token);
      },
    }
  )
);

export default useStore;
