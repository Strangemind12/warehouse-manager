import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { FlaskConical } from "lucide-react";

function GlobalPending() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <FlaskConical className="h-8 w-8 animate-pulse text-primary" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: GlobalPending,
    defaultPendingMs: 0,
  });

  return router;
};
