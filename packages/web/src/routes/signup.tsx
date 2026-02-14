import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "../components/ui";
import { signUp } from "../lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signUp.email({
      name,
      email,
      password,
    });

    if (result.error) {
      setError(result.error.message ?? "Signup failed");
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
              to="/login"
              className="transition hover:text-foreground"
            >
              Sign in
            </Link>
          </div>
          <CardTitle className="text-center text-2xl">Create Account</CardTitle>
          <p className="text-center text-sm text-muted-foreground">
            Create an account to start a new project.
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
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
              />
            </div>
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
                placeholder="8+ characters"
                required
                minLength={8}
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
              effect="glow"
            >
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-foreground hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
