import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, CardContent, Input, Label } from "../components/ui";
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

    const result = await signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Login failed");
      setLoading(false);
    } else {
      navigate({ to: "/" });
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <Link to="/" className="mb-10 text-2xl font-bold tracking-tight font-display enter-rise">
        Deck<span className="text-primary">flix</span>
      </Link>
      <Card className="enter-rise enter-delay-1 w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div>
            <h2 className="text-xl font-semibold font-display">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Welcome back to Deckflix.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}
            <div className="space-y-2">
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
            <div className="space-y-2">
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
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <Link to="/signup" className="text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
