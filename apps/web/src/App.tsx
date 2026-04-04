import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { FileBrowser } from "./pages/FileBrowser";
import { FileViewer } from "./pages/FileViewer";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { Workers } from "./pages/Workers";
import { Projects } from "./pages/Projects";
import { Team } from "./pages/Team";

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
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/files/*" element={<FileBrowser />} />
            <Route path="/view/*" element={<FileViewer />} />
            <Route path="/workers" element={<Workers />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
