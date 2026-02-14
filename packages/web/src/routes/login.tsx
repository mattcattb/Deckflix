import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "../components/ui";
import { signIn } from "../lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn.email({
      email,
      password,
    });

    if (result.error) {
      setError(result.error.message ?? "Login failed");
      setLoading(false);
    } else {
      navigate({ to: "/" });
    }
  };

  return (
    <div className="mx-auto mt-16 w-full max-w-md px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <Link to="/" className="transition hover:text-foreground">
              ← Back
            </Link>
            <Link
              to="/signup"
              className="transition hover:text-foreground"
            >
              Create account
            </Link>
          </div>
          <CardTitle className="text-center text-2xl">Sign In</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Welcome back. Sign in to your workspace.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}
            <div className="field-grid">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
              />
            </div>
            <div className="field-grid">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              effect="glow"
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              New here?{" "}
              <Link to="/signup" className="text-foreground hover:underline">
                Create an account
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
