import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setError("Check your email for a verification code, then sign in.");
        setIsSignUp(false);
      } else {
        await signIn(email, password);
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">HQ</h1>
          <p className="text-neutral-500 text-sm mt-1">Personal OS for AI Workers</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm focus:outline-none focus:border-neutral-600"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm focus:outline-none focus:border-neutral-600"
            required
            minLength={8}
          />

          {error && (
            <p className="text-red-400 text-xs">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-white text-black rounded text-sm font-medium hover:bg-neutral-200 disabled:opacity-50"
          >
            {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full mt-4 text-neutral-500 text-xs hover:text-neutral-300"
        >
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </div>
    </div>
  );
}
