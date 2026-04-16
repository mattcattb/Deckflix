import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, CardContent, Input } from "../components/ui";
import { api, throwApiError } from "../lib/api";
import { useSession, signOut } from "../lib/auth";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const canFetch = useMemo(() => Boolean(session && !isPending), [session, isPending]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const response = await api.api.projects.$get();
      if (!response.ok) {
        await throwApiError(response, "GET /api/projects");
      }
      return response.json();
    },
    enabled: canFetch,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const response = await api.api.projects.$post({ json: payload });
      if (!response.ok) {
        await throwApiError(response, "POST /api/projects");
      }
      return response.json();
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Awaited<ReturnType<typeof projectsQuery["refetch"]>>["data"]>(
        ["projects"],
        (prev) => [created, ...(prev ?? [])],
      );
      setName("");
    },
  });

  const projects = projectsQuery.data ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({ name });
  };

  if (!isPending && !session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-1 flex-col px-5 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/" className="text-2xl font-bold tracking-tight font-display">
              Deck<span className="text-primary">flix</span>
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">
              {session?.user.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/rooms">
              <Button variant="outline" size="sm">Rooms</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="text-base font-semibold">New project</h3>
            <form onSubmit={handleCreate} className="flex gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
                className="flex-1"
              />
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </form>
            {createMutation.error ? (
              <div className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to create project"}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <section className="space-y-3">
          <h3 className="text-base font-semibold text-muted-foreground">Your projects</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardContent className="p-4">
                  <div className="font-semibold">{project.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                </CardContent>
              </Card>
            ))}
            {projectsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground py-4">Loading...</div>
            ) : null}
            {projectsQuery.error ? (
              <div className="text-sm text-danger py-4">
                {projectsQuery.error instanceof Error
                  ? projectsQuery.error.message
                  : "Failed to load projects"}
              </div>
            ) : null}
            {projects.length === 0 && !projectsQuery.isLoading && !projectsQuery.error ? (
              <div className="text-sm text-muted-foreground py-4">
                No projects yet.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
