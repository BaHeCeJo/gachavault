import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminMonitoringPage from "./page";

const logs = vi.fn();

// The real useAuth returns a referentially stable user; a fresh object per
// render would change the identity of every [user] effect dep and spin the
// page into an endless refetch loop.
const ADMIN = { user: { id: "u1", role: "admin" }, isLoading: false };
vi.mock("@/hooks/useAdminGuard", () => ({ useAdminGuard: () => ADMIN }));

// `metrics` is either the complete host+containers object or null — the page
// renders a placeholder for null but dereferences .host when it is set.
const noMetrics = { data: { data: null } };

vi.mock("@/lib/api", () => ({
  adminApi: {
    monitoring: {
      logs: (params: Record<string, unknown>) => logs(params),
      alerts: () => Promise.resolve({ data: { data: { alerts: [] } } }),
      logStats: () => Promise.resolve({ data: { data: { by_service: [] } } }),
      metrics: () => Promise.resolve(noMetrics),
      metricsRange: () => Promise.resolve(noMetrics),
    },
  },
}));

// recharts measures its container, which jsdom reports as 0x0 — the charts are
// irrelevant to the filter behaviour under test.
vi.mock("recharts", () => {
  const Stub = () => null;
  return {
    CartesianGrid: Stub,
    Line: Stub,
    LineChart: Stub,
    ResponsiveContainer: Stub,
    Tooltip: Stub,
    XAxis: Stub,
    YAxis: Stub,
  };
});

describe("admin monitoring filters", () => {
  beforeEach(() => {
    logs.mockReset();
    logs.mockResolvedValue({ data: { data: { lines: [] } } });
  });

  it("refetches with the new value when a filter changes", async () => {
    // Guards the ref-sync effect: it must be declared before the effect that
    // calls refresh(), otherwise the refetch fires with the previous filter
    // and the panel silently shows stale results.
    render(<AdminMonitoringPage />);

    await waitFor(() => expect(logs).toHaveBeenCalled());
    expect(logs.mock.calls[0][0]).toMatchObject({ service: undefined, level: undefined });

    fireEvent.change(screen.getByDisplayValue("All services"), {
      target: { value: "auth-service" },
    });

    await waitFor(() =>
      expect(logs.mock.calls.at(-1)?.[0]).toMatchObject({ service: "auth-service" }),
    );
  });

  it("passes the level filter through on change", async () => {
    render(<AdminMonitoringPage />);
    await waitFor(() => expect(logs).toHaveBeenCalled());

    fireEvent.change(screen.getByDisplayValue("All levels"), { target: { value: "error" } });

    await waitFor(() => expect(logs.mock.calls.at(-1)?.[0]).toMatchObject({ level: "error" }));
  });
});
