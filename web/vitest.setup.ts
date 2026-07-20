import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import React from "react";

// next/image depends on build-time config injection and an optimizer endpoint
// that don't exist under jsdom. Swap it for a plain <img> that forwards src,
// alt, className and onError — that's the whole surface our components use,
// and it keeps the error-fallback path testable.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, className, onError, width, height }: Record<string, unknown>) =>
    React.createElement("img", { src, alt, className, onError, width, height }),
}));

afterEach(cleanup);
