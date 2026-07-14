import { create } from 'zustand';
import Cookies from 'js-cookie';

interface User {
    id: string;
    email: string;
    role: string;
    tenant: string;
    tenant_id?: string;
    moneda?: string; // PEN | USD | EUR (moneda base de la empresa)
}

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    checkAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: null,
    isAuthenticated: false,

    login: (token: string, user: User) => {
        Cookies.set('token', token, { expires: 1 }); // 1 day
        Cookies.set('user', JSON.stringify(user), { expires: 1 });
        set({ token, user, isAuthenticated: true });
    },

    logout: () => {
        Cookies.remove('token');
        Cookies.remove('user');
        set({ token: null, user: null, isAuthenticated: false });
        // Optional: window.location.href = '/login';
    },

    checkAuth: () => {
        const token = Cookies.get('token');
        const userStr = Cookies.get('user');
        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                set({ token, user, isAuthenticated: true });
            } catch (e) {
                set({ token: null, user: null, isAuthenticated: false });
            }
        } else {
            set({ token: null, user: null, isAuthenticated: false });
        }
    }
}));
