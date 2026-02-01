/**
 * Auth context — Cognito authentication
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_USER_POOL_ID || "",
  ClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID || "",
};

const userPool = new CognitoUserPool(poolData);

interface AuthContextType {
  user: CognitoUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CognitoUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
      currentUser.getSession((err: Error | null) => {
        if (!err) setUser(currentUser);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    return new Promise<void>((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });
      const authDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: () => {
          setUser(cognitoUser);
          resolve();
        },
        onFailure: (err) => reject(err),
      });
    });
  };

  const signUp = async (email: string, password: string) => {
    return new Promise<void>((resolve, reject) => {
      userPool.signUp(email, password, [], [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  const signOut = () => {
    user?.signOut();
    setUser(null);
  };

  const getToken = async (): Promise<string | null> => {
    if (!user) return null;
    return new Promise((resolve) => {
      user.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) resolve(null);
        else resolve(session.getIdToken().getJwtToken());
      });
    });
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
