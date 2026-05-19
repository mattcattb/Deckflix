# Project architecture rules

## Hono RPC

This project uses Hono RPC as the source of truth for API client types.

Do not manually recreate backend response types on the frontend when the type can be inferred from the Hono RPC client.

Prefer deriving types from the actual RPC client, route responses, helper return values, or existing schemas.

Avoid duplicate frontend/backend DTO definitions unless there is a clear boundary reason.

## Query organization

Do not create `*.queries.ts` files for queries used by only one route or component.

For route-local data fetching, colocate query options/mutations near the route/component.

Extract query helpers only when:

- reused across multiple routes/components
- complex enough to obscure the route
- needed for prefetching/shared invalidation patterns

## Services

Do not add service layers that only wrap existing Hono handlers, RPC calls, Drizzle queries, or utility functions.

A service/module is justified when it owns meaningful business logic, transaction boundaries, authorization decisions, orchestration, or non-trivial data shaping.

## Components

Do not split components prematurely.

Create a new component only when:

- the JSX block is large enough to distract from the parent
- it is reused
- it has its own state/behavior
- it represents a meaningful UI concept

Small one-off JSX sections should stay inline.

## Preferred bias

Bias toward:

- fewer files
- fewer names
- fewer manually written types
- colocated logic
- inferred types
- direct usage of existing APIs

Bias against:

- speculative reuse
- generic service layers
- parallel type hierarchies
- over-normalized file trees
- wrapper functions that only rename calls

## Fallow usage

This project uses Fallow for codebase analysis.

When implementing, refactoring, deleting, moving, or extracting TypeScript/JavaScript code, use Fallow to verify whether files, exports, types, and dependencies are actually used.

Prefer running Fallow before creating abstractions and after finishing changes.

Use Bun by default:

```bash
bunx fallow dead-code --format json
```
