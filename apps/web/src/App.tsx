import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Dashboard } from "./pages/Dashboard";
import { FileBrowser } from "./pages/FileBrowser";
import { FileViewer } from "./pages/FileViewer";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/files/*"
            element={
              <ProtectedRoute>
                <FileBrowser />
              </ProtectedRoute>
            }
          />
          <Route
            path="/view/*"
            element={
              <ProtectedRoute>
                <FileViewer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
