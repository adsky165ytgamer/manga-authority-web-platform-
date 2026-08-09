import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/manga/$id")({
  component: () => <Outlet />,
});
