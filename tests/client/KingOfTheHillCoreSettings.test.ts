import {
  maps,
  GameMapType,
  GameMapSize,
  GameType,
  Difficulty,
  GameMode,
  HumansVsNations,
} from "@openfront/engine-api/game/GameTypes";
import { KING_OF_THE_HILL_MAPS } from "@openfront/engine-lib/game/KingOfTheHill";
import { render as renderTemplate } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapPicker } from "../../src/client/components/map/MapPicker";
import { HostLobbyModal } from "../../src/client/HostLobbyModal";
import { SettingsModal } from "../../src/client/hud/layers/SettingsModal";
import { SinglePlayerModal } from "../../src/client/SinglePlayerModal";
import { getActiveModifiers, getGameModeLabel } from "../../src/client/Utils";

const make = () => {
  const modal = new HostLobbyModal() as any;
  modal.putGameConfig = vi.fn(async () => {});
  modal.loadNationCount = vi.fn(async () => {});
  return modal;
};
const toggle = (m: any, labelKey: string, checked = true) =>
  m.handleConfigOptionToggleChanged(
    new CustomEvent("option-toggle-changed", { detail: { labelKey, checked } }),
  );
afterEach(() => vi.restoreAllMocks());

describe("KOTH host settings", () => {
  it("adds KOTH without changing the selected human team format or ordinary options", () => {
    const m = make();
    m.gameMode = GameMode.Team;
    m.teamCount = 3;
    m.compactMap = true;
    m.randomSpawn = true;
    toggle(m, "king_of_the_hill.name");
    expect(m.kingOfTheHill).toBe(true);
    expect(m.teamCount).toBe(3);
    expect(m.gameMode).toBe(GameMode.Team);
    expect(m.compactMap).toBe(true);
    expect(m.randomSpawn).toBe(true);
    expect(KING_OF_THE_HILL_MAPS).toContain(m.selectedMap);
    toggle(m, "king_of_the_hill.name", false);
    expect(m.teamCount).toBe(3);
  });
  it("blocks Water Nukes and Humans vs Nations in both selection orders", () => {
    const m = make();
    const warnings: string[] = [];
    const listener = (e: Event) =>
      warnings.push((e as CustomEvent).detail.message);
    window.addEventListener("show-message", listener);
    try {
      m.waterNukes = true;
      toggle(m, "king_of_the_hill.name");
      expect(m.kingOfTheHill).toBe(false);
      m.waterNukes = false;
      m.gameMode = GameMode.Team;
      m.teamCount = HumansVsNations;
      toggle(m, "king_of_the_hill.name");
      expect(m.kingOfTheHill).toBe(false);
      m.teamCount = 3;
      toggle(m, "king_of_the_hill.name");
      expect(m.kingOfTheHill).toBe(true);
      toggle(m, "game_settings.water_nukes");
      expect(m.waterNukes).toBe(false);
      m.handleTeamCountSelection(HumansVsNations);
      expect(m.teamCount).toBe(3);
      m.nations = 0;
      m.handleNationsChange(
        new CustomEvent("nations-changed", { detail: { value: 70 } }),
      );
      expect(m.nations).toBe(0);
      expect(warnings).toEqual([
        "king_of_the_hill.water_nukes_blocked",
        "king_of_the_hill.humans_vs_nations_blocked",
        "king_of_the_hill.water_nukes_blocked",
        "king_of_the_hill.humans_vs_nations_blocked",
        "king_of_the_hill.nations_blocked",
      ]);
    } finally {
      window.removeEventListener("show-message", listener);
    }
  });
  it("allows hosts to select clocks in either selection order", () => {
    const m = make();
    m.doomsdayClock = true;
    m.overtime = true;
    toggle(m, "king_of_the_hill.name");
    expect(m.kingOfTheHill).toBe(true);
    expect(m.doomsdayClock).toBe(true);
    expect(m.overtime).toBe(true);
    toggle(m, "game_settings.doomsday_clock", false);
    toggle(m, "game_settings.doomsday_clock", true);
    m.handleOvertimeToggle(false, 3);
    m.handleOvertimeToggle(true, 3);
    expect(m.doomsdayClock).toBe(true);
    expect(m.overtime).toBe(true);
    expect(m.overtimeStartMinutes).toBe(3);
  });
});

describe("KOTH presentation", () => {
  it("shows all supported maps together", async () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    const picker = new MapPicker();
    picker.allowedMaps = KING_OF_THE_HILL_MAPS;
    document.body.append(picker);
    try {
      await picker.updateComplete;
      const ids = [...picker.querySelectorAll("map-display")].map(
        (e) => (e as any).mapKey,
      );
      expect(ids).toEqual(
        KING_OF_THE_HILL_MAPS.map(
          (type) => maps.find((m) => m.type === type)!.id,
        ),
      );
      expect(picker.querySelector('[role="tablist"]')).toBeNull();
    } finally {
      picker.remove();
      vi.unstubAllGlobals();
    }
  });
  it("labels KOTH as the mode rather than adding a modifier badge", () => {
    const c = { kingOfTheHill: true, gameMode: GameMode.FFA } as any;
    expect(getGameModeLabel(c)).toContain("king_of_the_hill.name");
    expect(getActiveModifiers({ goldMultiplier: 2 })).toHaveLength(1);
  });
});

it("does not expose KOTH in Solo or save it in Solo presets", () => {
  const solo = new SinglePlayerModal() as any;
  expect(JSON.stringify(solo.render())).not.toContain("king_of_the_hill.name");
  expect(solo.exportPresetConfig()).not.toHaveProperty("kingOfTheHill");
});

it("uses the standard in-game menu with King of the Hill enabled", () => {
  const renderMenu = (kingOfTheHill: boolean) => {
    const menu = new SettingsModal() as any;
    menu.gameConfig = {
      kingOfTheHill,
      gameMap: GameMapType.Tourney4,
      gameMapSize: GameMapSize.Compact,
      gameMode: GameMode.FFA,
      gameType: GameType.Private,
      difficulty: Difficulty.Medium,
      nations: "disabled",
      bots: 400,
      infiniteGold: true,
      infiniteTroops: true,
      instantBuild: true,
      randomSpawn: true,
      startingGold: 5_000_000,
      goldMultiplier: 2,
    };
    menu.isVisible = true;
    const target = document.createElement("div");
    renderTemplate(menu.render(), target);
    return target;
  };
  const standard = renderMenu(false);
  expect(standard.querySelector("[data-header-badges]")).not.toBeNull();
  expect(standard.querySelector("[data-game-modifiers]")).not.toBeNull();
  expect(renderMenu(true).innerHTML).toBe(standard.innerHTML);
});
