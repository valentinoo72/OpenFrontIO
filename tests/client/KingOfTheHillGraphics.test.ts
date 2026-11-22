import { UnitType } from "@openfront/engine-api/game/GameTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import atlas from "../../resources/atlases/msdf-atlas.json";
import { preloadAtlasData } from "../../src/client/render/gl/passes/name-pass/AtlasData";
import { PointLightPass } from "../../src/client/render/gl/passes/PointLightPass";
import { StructureLevelPass } from "../../src/client/render/gl/passes/StructureLevelPass";
import { StructurePass } from "../../src/client/render/gl/passes/StructurePass";
import { applyGraphicsOverrides } from "../../src/client/render/gl/RenderOverrides";
import { createRenderSettings } from "../../src/client/render/gl/RenderSettings";

function fakeGL() {
  const methods: Record<string, any> = {
    getUniformLocation: vi.fn((_program, name) => name),
  };
  return new Proxy(methods, {
    get: (target, key: string) => {
      if (/^[A-Z_0-9]+$/.test(key)) return 0;
      return (target[key] ??= vi.fn(() => 1));
    },
  });
}
const header = {
  mapWidth: 100,
  unitTypes: [
    UnitType.City,
    UnitType.Port,
    UnitType.Factory,
    UnitType.DefensePost,
    UnitType.SAMLauncher,
    UnitType.MissileSilo,
    UnitType.Throne,
  ],
};
const throne = {
  isActive: true,
  waitTicks: 0,
  unitType: UnitType.Throne,
  ownerID: 1,
  pos: 101,
  lastPos: 101,
  underConstruction: true,
  markedForDeletion: false,
  level: 1,
};
afterEach(() => vi.unstubAllGlobals());

describe("Throne graphics integration", () => {
  it("uses the normal white outline for automatic throne hover and clears it on dismissal", async () => {
    vi.stubGlobal(
      "Image",
      class {
        async decode() {}
      },
    );
    const gl = fakeGL(),
      settings = createRenderSettings();
    const pass = new StructurePass(
      gl as any,
      header as any,
      1 as any,
      1 as any,
      settings,
    );
    await Promise.resolve();
    pass.updateStructures(new Map([[1, throne as any]]));
    pass.updateGhostPreview({
      ghostType: UnitType.Throne,
      tileX: 1,
      tileY: 1,
      ownerID: 1,
      canBuild: true,
      canUpgrade: false,
    } as any);
    pass.draw(new Float32Array(9), 3);
    expect(gl.uniform1i).toHaveBeenCalledWith("uHighlightMask", 64);
    expect(gl.uniform1f).toHaveBeenCalledWith(
      "uHighlightOutlineW",
      settings.structure.highlightOutlineWidth,
    );
    pass.updateGhostPreview(null);
    pass.draw(new Float32Array(9), 3);
    expect(gl.uniform1i).toHaveBeenLastCalledWith("uHighlightMask", 0);
    pass.setHighlightTypes([UnitType.City]);
    pass.draw(new Float32Array(9), 3);
    expect(gl.uniform1i).toHaveBeenLastCalledWith("uHighlightMask", 1);
    pass.dispose();
  });

  it.each([36, 84])(
    "honours live structure settings at icon size %s",
    async (iconSize) => {
      vi.stubGlobal(
        "Image",
        class {
          async decode() {}
        },
      );
      const gl = fakeGL(),
        settings = createRenderSettings();
      const pass = new StructurePass(
        gl as any,
        header as any,
        1 as any,
        1 as any,
        settings,
      );
      await Promise.resolve();
      pass.updateStructures(new Map([[1, throne as any]]));
      applyGraphicsOverrides(settings, {
        structure: { iconSize, classicIcons: true, showDots: false },
      });
      pass.setAltView(true);
      pass.setHighlightOwner(1);
      pass.draw(new Float32Array(9), 3);
      expect(gl.uniform1f).toHaveBeenCalledWith("uIconSize", iconSize);
      expect(gl.uniform1f).toHaveBeenCalledWith("uDotsThreshold", 0);
      expect(gl.uniform1f).toHaveBeenCalledWith("uFillDarken", 1);
      expect(gl.uniform1f).toHaveBeenCalledWith("uIconDarken", 0.3);
      expect(gl.uniform1f).toHaveBeenCalledWith("uIconAlpha", 0.9);
      expect(gl.uniform1f).toHaveBeenCalledWith("uHoverOwner", 1);
      expect(gl.uniform1i).toHaveBeenCalledWith("uAltView", 1);
      const scales = gl.uniform1fv.mock.calls.find(
        ([name]: any) => name === "uShapeScales",
      )[1];
      expect(scales[6]).toBeCloseTo(
        settings.structure.shapes[UnitType.Throne].scale,
      );
      pass.dispose();
    },
  );

  it("keeps throne and silo graphics columns consistent for both level-number fonts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => atlas })),
    );
    await preloadAtlasData();
    const gl = fakeGL(),
      settings = createRenderSettings();
    const pass = new StructureLevelPass(gl as any, header as any, settings);
    expect((pass as any).typeToAtlasCol.get(UnitType.MissileSilo)).toBe(5);
    expect((pass as any).typeToAtlasCol.get(UnitType.Throne)).toBe(6);
    pass.setHighlightTypes([UnitType.Throne]);
    expect((pass as any).highlightMask).toBe(64);
    pass.dispose();
  });

  it("includes unfinished thrones in normal structure lighting and live glow controls", () => {
    const gl = fakeGL(),
      settings = createRenderSettings();
    const palette = new Float32Array(4096 * 8).fill(1);
    const pass = new PointLightPass(
      gl as any,
      header as any,
      palette,
      settings,
      { msPerTick: () => 100 } as any,
    );
    pass.updateLights(new Map([[1, throne as any]]));
    pass.draw(new Float32Array(9));
    expect(gl.drawArraysInstanced).toHaveBeenLastCalledWith(0, 0, 6, 1);
    let intensity = gl.uniform1fv.mock.calls.find(
      ([name]: any) => name === "uIntensity",
    )[1];
    expect(intensity[6]).toBeCloseTo(settings.lightConfigs.Throne.intensity);
    settings.lightConfigs.Throne.intensity = 0;
    settings.lightConfigs.Throne.radius = 24;
    settings.lighting.falloffPower = 2;
    settings.lighting.lightRadiusMultiplier = 1.5;
    gl.uniform1fv.mockClear();
    pass.draw(new Float32Array(9));
    intensity = gl.uniform1fv.mock.calls.find(
      ([name]: any) => name === "uIntensity",
    )[1];
    const radius = gl.uniform1fv.mock.calls.find(
      ([name]: any) => name === "uRadius",
    )[1];
    expect(intensity[6]).toBe(0);
    expect(radius[6]).toBe(24);
    expect(gl.uniform1f).toHaveBeenCalledWith("uFalloffPower", 2);
    expect(gl.uniform1f).toHaveBeenCalledWith("uRadiusMultiplier", 1.5);
    pass.dispose();
  });
});
