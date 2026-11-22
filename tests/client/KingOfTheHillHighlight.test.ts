import { EventBus } from "@openfront/shared/EventBus";
import { expect, it, vi } from "vitest";
import { KingOfTheHillMapOverlay } from "../../src/client/controllers/KingOfTheHillMapOverlay";
import { AlternateViewEvent } from "../../src/client/InputHandler";
import { GPURenderer } from "../../src/client/render/gl/Renderer";

it("shows the site on spawn and Space, beneath structures, and hides it on release", () => {
  const draws: string[] = [];
  const emptyPass = new Proxy({}, { get: () => vi.fn() });
  const state: any = {
    gl: { enable: vi.fn(), disable: vi.fn(), blendFunc: vi.fn() },
    settings: { passEnabled: { structure: true } },
    inSpawnPhase: true,
    altView: false,
    gridView: false,
    throneZoneVisible: true,
    throneZonePass: { draw: () => draws.push("site") },
    structurePass: {
      draw: () => draws.push("structures"),
      setAltView: vi.fn(),
    },
    updateSelectionBox: vi.fn(),
  };
  const renderer = new Proxy(state, {
    get: (target, key) => (key in target ? target[key] : emptyPass),
  });
  const frame = () => {
    draws.length = 0;
    (GPURenderer.prototype as any).renderOverlays.call(
      renderer,
      new Float32Array(9),
      3,
    );
  };
  const bus = new EventBus();
  const overlay = new KingOfTheHillMapOverlay(
    { inSpawnPhase: () => state.inSpawnPhase } as any,
    {
      setThroneZoneVisible: (visible: boolean) =>
        GPURenderer.prototype.setThroneZoneVisible.call(renderer, visible),
      setThroneZones: vi.fn(),
    } as any,
    bus,
  );
  // Geometry is verified with real terrain in KingOfTheHillMapOverlay.test.
  bus.on(AlternateViewEvent, (overlay as any).onAlternateView);
  overlay.tick();
  frame();
  expect(draws).toEqual(["site", "structures"]);
  state.inSpawnPhase = false;
  overlay.tick();
  frame();
  expect(draws).toEqual(["structures"]);
  bus.emit(new AlternateViewEvent(true));
  frame();
  expect(draws).toEqual(["site", "structures"]);
  bus.emit(new AlternateViewEvent(false));
  frame();
  expect(draws).toEqual(["structures"]);
});
