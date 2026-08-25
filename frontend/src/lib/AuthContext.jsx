import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchAdminProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchAdminProfile(session.user.id);
      } else {
        setAdminProfile(null);
        setIsSuperAdmin(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchAdminProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('app_admins')
        .select('*, role:role_id(name)')
        .eq('user_id', userId)
        .single();
      
      if (data) {
        setAdminProfile(data);
        setIsSuperAdmin(data.role?.name === 'Super Admin');
      } else {
        setAdminProfile(null);
        setIsSuperAdmin(false);
      }
    } catch (err) {
      console.error("Error fetching admin profile:", err);
      setAdminProfile(null);
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider value={{ session, adminProfile, isSuperAdmin, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
