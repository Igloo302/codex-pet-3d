import { describe, it, expect } from "vitest";
import { getWindowOptions, WindowSize } from "../src/window-config";

describe("getWindowOptions", () => {
  it("should return correct default window options", () => {
    const options = getWindowOptions();

    expect(options.width).toBe(220);
    expect(options.height).toBe(240);
    expect(options.transparent).toBe(true);
    expect(options.frame).toBe(false);
    expect(options.alwaysOnTop).toBe(true);
    expect(options.hasShadow).toBe(false);
    expect(options.resizable).toBe(false);
  });

  it("should accept custom window size", () => {
    const customSize: WindowSize = { width: 300, height: 400 };
    const options = getWindowOptions(customSize);

    expect(options.width).toBe(300);
    expect(options.height).toBe(400);
  });

  it("should have transparent set to true", () => {
    const options = getWindowOptions();
    expect(options.transparent).toBe(true);
  });

  it("should have frame set to false", () => {
    const options = getWindowOptions();
    expect(options.frame).toBe(false);
  });

  it("should have alwaysOnTop set to true", () => {
    const options = getWindowOptions();
    expect(options.alwaysOnTop).toBe(true);
  });

  it("should have hasShadow set to false", () => {
    const options = getWindowOptions();
    expect(options.hasShadow).toBe(false);
  });

  it("should have resizable set to false", () => {
    const options = getWindowOptions();
    expect(options.resizable).toBe(false);
  });

  it("should have webPreferences with correct settings", () => {
    const options = getWindowOptions();

    expect(options.webPreferences).toBeDefined();
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.preload).toContain("preload.js");
  });
});