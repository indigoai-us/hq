import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

type AuthStep = "credentials" | "confirm";

export function Login() {
  const { signIn, signUp, confirmSignUp, resendConfirmation } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [step, setStep] = useState<AuthStep>("credentials");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setStep("confirm");
        setMessage("We sent a verification code to your email.");
      } else {
        await signIn(email, password);
        navigate("/");
      }
    } catch (err: any) {
      // If user tries to sign in but isn't confirmed yet, show confirmation step
      if (err?.code === "UserNotConfirmedException" || err?.name === "UserNotConfirmedException") {
        setStep("confirm");
        setMessage("Your account isn't verified yet. Enter the code from your email.");
      } else {
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await confirmSignUp(email, code);
      // Auto sign-in after confirmation
      await signIn(email, password);
      navigate("/");
    } catch (err: any) {
      if (err?.code === "ExpiredCodeException" || err?.name === "ExpiredCodeException") {
        setError("Code expired. Click resend to get a new one.");
      } else if (err?.code === "CodeMismatchException" || err?.name === "CodeMismatchException") {
        setError("Invalid code. Please check and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Confirmation failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setMessage("");
    try {
      await resendConfirmation(email);
      setMessage("New code sent to your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    }
  };

  const resetToCredentials = () => {
    setStep("credentials");
    setCode("");
    setError("");
    setMessage("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">HQ by Indigo</h1>
          <p className="text-neutral-500 text-sm mt-1">Personal OS for AI Workers</p>
        </div>

        {step === "credentials" && (
          <>
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

              {error && <p className="text-red-400 text-xs">{error}</p>}
              {message && <p className="text-green-400 text-xs">{message}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-white text-black rounded text-sm font-medium hover:bg-neutral-200 disabled:opacity-50"
              >
                {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
              </button>
            </form>

            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setMessage("");
              }}
              className="w-full mt-4 text-neutral-500 text-xs hover:text-neutral-300"
            >
              {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <form onSubmit={handleConfirm} className="space-y-4">
              <p className="text-neutral-400 text-sm text-center">
                Enter the 6-digit code sent to <span className="text-white font-medium">{email}</span>
              </p>
              <input
                type="text"
                placeholder="Verification code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm text-center tracking-widest focus:outline-none focus:border-neutral-600"
                required
                maxLength={6}
                autoFocus
              />

              {error && <p className="text-red-400 text-xs">{error}</p>}
              {message && <p className="text-green-400 text-xs">{message}</p>}

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full py-2 bg-white text-black rounded text-sm font-medium hover:bg-neutral-200 disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
            </form>

            <div className="flex justify-between mt-4">
              <button
                onClick={handleResend}
                className="text-neutral-500 text-xs hover:text-neutral-300"
              >
                Resend code
              </button>
              <button
                onClick={resetToCredentials}
                className="text-neutral-500 text-xs hover:text-neutral-300"
              >
                Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
