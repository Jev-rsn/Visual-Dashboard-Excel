import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: number;
  nama: string;
  email: string;
  peran: 'Owner' | 'Admin Purchasing & Gudang' | 'Kasir & Admin Online' | 'Admin Keuangan';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string, isPosMode?: boolean) => Promise<boolean>;
  logout: () => void;
  switchRole: (peran: User['peran']) => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
  canViewProfit: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('mcrw_token'));
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Invalid session');
        })
        .then(data => {
          setUser(data.user);
        })
        .catch(() => {
          localStorage.removeItem('mcrw_token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string, isPosMode: boolean = false): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, isPosMode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal');

      localStorage.setItem('mcrw_token', data.token);
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch (err: any) {
      console.error('Login error:', err);
      return false;
    }
  };

  const logout = () => {
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    localStorage.removeItem('mcrw_token');
    setToken(null);
    setUser(null);
  };

  const switchRole = async (peran: User['peran']) => {
    const roleEmailMap: Record<User['peran'], string> = {
      'Owner': 'owner@mcrw.com',
      'Admin Purchasing & Gudang': 'gudang@mcrw.com',
      'Kasir & Admin Online': 'kasir@mcrw.com',
      'Admin Keuangan': 'keuangan@mcrw.com'
    };
    const email = roleEmailMap[peran];
    await login(email, 'password123');
  };

  const hasRole = (...roles: string[]): boolean => {
    if (!user) return false;
    if (user.peran === 'Owner') return true;
    return roles.includes(user.peran);
  };

  // Rule BR-11: Kasir & Admin Online cannot see HPP and profit
  const canViewProfit = user?.peran !== 'Kasir & Admin Online';

  return (
    <AuthContext.Provider value={{ user, token, login, logout, switchRole, hasRole, canViewProfit, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
