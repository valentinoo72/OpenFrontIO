import { GameMapType } from "@openfront/engine-api/game/GameTypes";
import { EventBus } from "@openfront/shared/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RadialMenu } from "../../src/client/hud/layers/RadialMenu";
import {
  buildMenuElement,
  centerButtonElement,
  rootMenuElement,
} from "../../src/client/hud/layers/RadialMenuElements";

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
});
