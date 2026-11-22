import { GameMapType, UnitType } from "@openfront/engine-api/game/GameTypes";
import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";
import atlas from "../../resources/atlases/msdf-atlas.json";
import { RadialMenu } from "../../src/client/hud/layers/RadialMenu";
import {
  buildMenuElement,
  centerButtonElement,
  rootMenuElement,
} from "../../src/client/hud/layers/RadialMenuElements";
import { preloadAtlasData } from "../../src/client/render/gl/passes/name-pass/AtlasData";
import { WorldTextPass } from "../../src/client/render/gl/passes/WorldTextPass";
import defaults from "../../src/client/render/gl/render-settings.json";
import type { RenderSettings } from "../../src/client/render/gl/RenderSettings";

const menus: RadialMenu[] = [];
afterEach(() => {
  menus.splice(0).forEach((menu) => menu.destroy());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Throne presentation", () => {
  it.each([32, 48])(
    "renders a centred throne icon 26.5% bigger than a city at menu size %s",
    async (iconSize) => {
      // Use the actual build submenu so its throne sizing reaches the SVG renderer.
      const player = {};
      const params: any = {
        myPlayer: player,
        selected: player,
        game: {
          inSpawnPhase: () => false,
          config: () => ({
            isUnitDisabled: () => false,
            gameConfig: () => ({ gameMap: GameMapType.Luna }),
          }),
        },
        buildMenu: {
          canBuildOrUpgrade: () => true,
          cost: () => 2_000_000n,
          count: () => "0",
        },
      };
      // Avoid external image fetching; all compared SVGs have square viewBoxes.
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          text: async () => '<svg viewBox="0 0 64 64"></svg>',
        })),
      );
      const items = buildMenuElement.subMenu!(params).filter((item) =>
        ["build_City", "build_Throne", "build_SAM Launcher"].includes(item.id),
      );
      expect(items).toHaveLength(3);
      const menu = new RadialMenu(
        new EventBus(),
        rootMenuElement,
        centerButtonElement,
        { iconSize, menuTransitionDuration: 0 },
      );
      menus.push(menu);
      menu.init();
      (menu as any).params = params;
      (menu as any).renderMenuItems(items, 0);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const icon = (id: string) =>
        document.querySelector<SVGImageElement>(`g[data-id="${id}"] image`)!;
      const city = icon("build_City"),
        throne = icon("build_Throne"),
        sam = icon("build_SAM Launcher");
      expect(+throne.getAttribute("width")!).toBeCloseTo(
        +city.getAttribute("width")! * 1.265,
      );
      expect(+throne.getAttribute("height")!).toBeCloseTo(
        +city.getAttribute("height")! * 1.265,
      );
      expect(+sam.getAttribute("width")!).toBe(+city.getAttribute("width")!);
      const group = throne.parentElement!;
      expect(
        +throne.getAttribute("x")! + +throne.getAttribute("width")! / 2,
      ).toBeCloseTo(+group.getAttribute("data-cx")!);
      expect(
        +throne.getAttribute("y")! + +throne.getAttribute("height")! / 2,
      ).toBeCloseTo(+group.getAttribute("data-cy")!);
    },
  );

  it.each([1, 2])(
    "keeps real cost glyphs below every frame when zooming at DPR %s",
    async (dpr) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => atlas })),
      );
      await preloadAtlasData();
      vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(dpr);
      // This exercises the production constructor's atlas metrics and tick layout.
      const gl = new Proxy(
        {},
        {
          get: (_target, key) =>
            typeof key === "string" && /^[A-Z_0-9]+$/.test(key)
              ? 0
              : vi.fn(() => 1),
        },
      );
      const pass = new WorldTextPass(
        gl as any,
        defaults as unknown as RenderSettings,
        {} as any,
      );
      const paintedBottom: Record<string, number> = {
        [UnitType.City]: 0.45,
        [UnitType.Port]: 0.45 * Math.cos(Math.PI / 5),
        [UnitType.Factory]: 0.45 * Math.cos(Math.PI / 6),
        [UnitType.DefensePost]: 0.45 * Math.cos(Math.PI / 8),
        [UnitType.SAMLauncher]: 0.45 / Math.SQRT2,
        [UnitType.MissileSilo]: 0.45 / 2,
        [UnitType.Throne]: 0.424,
      };
      for (const [type, edge] of Object.entries(paintedBottom)) {
        for (const zoom of [0.8, 3, 8, 21]) {
          pass.setGhostCostLabel({
            ghostType: type,
            tileX: 0,
            tileY: 0,
            cost: 2_000_000,
            canAfford: true,
            canPlace: true,
          });
          pass.tick(zoom);
          const state = pass as any;
          expect(state.instanceCount).toBeGreaterThan(0);
          const structure = defaults.structure;
          const zoomScale =
            zoom <= 1.2 ? 0.3 : zoom >= 7 ? zoom / 7 : Math.min(1, zoom / 3);
          const shapeScale = (
            structure.shapes as Record<string, { scale: number }>
          )[type].scale;
          const frameBottom =
            edge * structure.iconSize * zoomScale * shapeScale;
          for (let i = 0; i < state.instanceCount; i++) {
            const off = i * 10;
            const glyph = atlas.chars.find(
              (ch) => ch.id === state.instanceData[off + 3],
            )!;
            const glyphTop =
              state.instanceData[off + 1] * zoom +
              ((-atlas.common.base / 2 + glyph.yoffset) / atlas.info.size) *
                state.instanceData[off + 8] *
                zoom;
            expect(
              glyphTop - frameBottom,
              `${type} at zoom ${zoom}`,
            ).toBeGreaterThanOrEqual(3 * dpr - 0.001);
          }
        }
      }
    },
  );
});
