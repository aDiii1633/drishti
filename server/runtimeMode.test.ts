import { afterEach, describe, expect, it } from "vitest";
import { getAppMode, isDemoMode } from "./runtimeMode";

const originalNodeEnv = process.env.NODE_ENV;
const originalAppMode = process.env.APP_MODE;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.APP_MODE = originalAppMode;
});

describe("runtime mode", () => {
  it("defaults to real and requires an explicit demo mode", () => {
    process.env.NODE_ENV = "development";
    delete process.env.APP_MODE;
    process.env.DEMO_MODE = "true";
    expect(getAppMode()).toBe("real");
    expect(isDemoMode()).toBe(false);
  });

  it("uses demo only when APP_MODE explicitly requests it", () => {
    process.env.NODE_ENV = "development";
    process.env.APP_MODE = "demo";
    expect(getAppMode()).toBe("demo");
  });
});
