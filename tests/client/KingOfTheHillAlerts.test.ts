import { GameMode, GameType } from "@openfront/engine-api/game/GameTypes";
import { GameUpdateType } from "@openfront/engine-api/game/GameUpdates";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import english from "../../resources/lang/en.json";
import { HeadsUpMessage } from "../../src/client/hud/layers/HeadsUpMessage";
import { PlayerInfoOverlay } from "../../src/client/hud/layers/PlayerInfoOverlay";

describe("KOTH core alerts", () => {
  let hud: HeadsUpMessage;
  let lang: HTMLElement;
  let ended = false;
  let koth = true;
  let owner = 3;
  let spawning = false;
  let randomSpawn = false;
  let extendedImmunity = false;
  let spawnImmune = false;
  let pauseUpdates: { paused: boolean }[] = [];
  let tick = 101;
  let mode = GameMode.Team;
  let gameType = GameType.Private;
  let thrones: any[];
  const throne = (id: number, ownerId: number, start: number) => ({
    id: () => id,
    owner: () => player(ownerId),
    isActive: () => true,
    isUnderConstruction: () => true,
    state: { constructionStartTick: start },
  });
  const player = (id: number) => ({
    smallID: () => id,
    isOnSameTeam: (p: any) => p.smallID() === 2,
    isAlliedWith: (p: any) => p.smallID() === 4,
    isFriendly: (p: any) => [2, 4].includes(p.smallID()),
  });
  beforeEach(() => {
    vi.useFakeTimers();
    ended = false;
    koth = true;
    owner = 3;
    spawning = false;
    randomSpawn = false;
    extendedImmunity = false;
    spawnImmune = false;
    pauseUpdates = [];
    tick = 101;
    mode = GameMode.Team;
    gameType = GameType.Private;
    thrones = [throne(1, 3, 0)];
    lang = document.createElement("lang-selector");
    Object.assign(lang, {
      currentLang: "en",
      translations: Object.fromEntries(
        Object.entries({
          heads_up_message: english.heads_up_message,
          king_of_the_hill: english.king_of_the_hill,
        }).flatMap(([section, messages]) =>
          Object.entries(messages).map(([key, text]) => [
            `${section}.${key}`,
            text,
          ]),
        ),
      ),
    });
    document.body.append(lang);
    hud = new HeadsUpMessage();
    hud.game = {
      config: () => ({
        isKingOfTheHill: () => koth,
        isRandomSpawn: () => randomSpawn,
        isReplay: () => false,
        isIntentionalSpectator: () => false,
        gameConfig: () => ({
          gameMode: mode,
          gameType,
        }),
        numSpawnPhaseTurns: () => 150,
        hasExtendedSpawnImmunity: () => extendedImmunity,
        spawnImmunityDuration: () => 600,
        overtimeConfig: () => ({ enabled: false, startMinutes: 30 }),
      }),
      myPlayer: () => player(1),
      inSpawnPhase: () => spawning,
      gameOver: () => ended,
      ticks: () => tick,
      elapsedGameSeconds: () => 10,
      isSpawnImmunityActive: () => spawnImmune,
      updatesSinceLastTick: () => ({
        [GameUpdateType.GamePaused]: pauseUpdates,
      }),
      units: () =>
        thrones.map((t) =>
          t.id() === 1 ? { ...t, owner: () => player(owner) } : t,
        ),
    } as any;
    document.body.append(hud);
    hud.init();
  });
  afterEach(() => {
    hud.remove();
    lang.remove();
    vi.useRealTimers();
  });
  it.each([
    [1, "own", "YOU PLACED A THRONE.", "20s until you win"],
    [2, "teammate", "YOUR TEAM PLACED A THRONE.", "20s until you win"],
    [3, "enemy", "ENEMY PLACED A THRONE.", "20s until they win"],
  ] as const)(
    "shows the current owner relation %s",
    async (id, key, label, timer) => {
      owner = id;
      hud.tick();
      await hud.updateComplete;
      const banner = hud.querySelector(`[data-throne-alert="${key}"]`)!;
      expect(banner.textContent?.replace(/\s+/g, " ").trim()).toBe(
        `${label} ${timer}`,
      );
      expect(banner.querySelector("strong")?.textContent?.trim()).toBe(timer);
      expect(banner.className).toContain(
        key === "enemy" ? "border-red" : "border-green",
      );
    },
  );
  it("switches ownership wording on capture without restarting the timer", async () => {
    hud.tick();
    await hud.updateComplete;
    const original = hud.querySelector('[data-throne-alert="enemy"]');
    expect(original).not.toBeNull();
    owner = 1;
    hud.tick();
    await hud.updateComplete;
    const captured = hud.querySelector('[data-throne-alert="own"]');
    expect(captured).toBe(original);
    expect(captured?.textContent).toContain("20s until you win");
    ended = true;
    hud.tick();
    await hud.updateComplete;
    expect(hud.querySelector("[data-throne-alert]")).toBeNull();
  });
  it.each([
    [false, "choose_spawn"],
    [true, "random_spawn"],
  ] as const)(
    "shows the KOTH instructions above the original spawn prompt (random: %s)",
    async (random, prompt) => {
      randomSpawn = random;
      spawning = true;
      hud.tick();
      await hud.updateComplete;
      const messages = hud.querySelector("[data-openfront-messages]")!;
      const instructions = messages.querySelector("[data-koth-description]")!;
      expect(instructions.textContent?.trim()).toBe(
        "Place a throne on the highlighted area to win.",
      );
      expect(instructions).toBe(messages.firstElementChild);
      expect(instructions.nextElementSibling?.textContent).toContain(
        english.heads_up_message[prompt],
      );
      expect(hud.querySelector("[data-koth-guide]")).toBeNull();
      expect(hud.querySelector("[data-throne-alert]")).toBeNull();

      spawning = false;
      hud.tick();
      await hud.updateComplete;
      expect(hud.querySelector("[data-openfront-messages]")).toBeNull();
      expect(hud.querySelector("[data-throne-alert]")).not.toBeNull();
    },
  );
  it("groups the stock game and collusion notices in one KOTH box", async () => {
    spawning = true;
    gameType = GameType.Public;
    mode = GameMode.FFA;
    hud.tick();
    await hud.updateComplete;

    const messages = hud.querySelector("[data-openfront-messages]")!;
    expect([...messages.classList]).toEqual(
      expect.arrayContaining([
        "bg-gray-800/70",
        "backdrop-blur-xs",
        "lg:text-xl",
        "py-1",
      ]),
    );
    expect(messages.getAttribute("style")).toBe(
      "word-wrap: break-word; hyphens: auto;",
    );
    expect(messages.querySelector("[data-game-instruction]")).not.toBeNull();
    const collusion = messages.querySelector("[data-collusion-warning]")!;
    expect(collusion.textContent).toContain(
      english.heads_up_message.ffa_collusion,
    );
    expect(collusion.querySelector("button")?.textContent).toContain(
      english.heads_up_message.dont_show_again,
    );
  });
  it("preserves the immunity window and the priority of pause notices", async () => {
    const notice = () =>
      hud.querySelector("[data-game-instruction]")?.textContent;
    extendedImmunity = true;
    spawnImmune = true;
    tick = 249;
    hud.tick();
    await hud.updateComplete;
    expect(notice()).toContain(
      english.heads_up_message.pvp_immunity_active.replace("{seconds}", "60"),
    );

    pauseUpdates = [{ paused: false }, { paused: true }];
    hud.tick();
    await hud.updateComplete;
    expect(notice()).toContain(
      english.heads_up_message.multiplayer_game_paused,
    );

    gameType = GameType.Singleplayer;
    pauseUpdates = [];
    hud.tick();
    await hud.updateComplete;
    expect(notice()?.trim()).toBe(
      english.heads_up_message.singleplayer_game_paused,
    );

    pauseUpdates = [{ paused: false }];
    tick = 250;
    hud.tick();
    await hud.updateComplete;
    expect(notice()).toBeUndefined();

    tick = 249;
    spawnImmune = false;
    hud.tick();
    await hud.updateComplete;
    expect(notice()).toBeUndefined();
  });
  it("uses solid grey KOTH warnings with no blur", async () => {
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: {
          message: "You can't place a throne during PvP immunity.",
          color: "red",
        },
      }),
    );
    await hud.updateComplete;
    const warning = hud.querySelector<HTMLElement>(
      "[data-game-toast-content]",
    )!;
    expect(warning.style.backgroundColor).toBe("rgb(30, 41, 59)");
    expect(warning.getAttribute("style")).toContain("backdrop-filter: none");
    expect(warning.style.borderColor).toBe("rgba(239, 68, 68, 0.5)");
  });
  it("shows the closest friendly and enemy thrones and sorts simultaneous arrivals by completion time", async () => {
    thrones = [
      throne(10, 3, 0),
      throne(11, 1, 50),
      throne(12, 2, 100),
      throne(13, 4, 150),
      throne(14, 1, 200),
    ];
    hud.tick();
    await hud.updateComplete;
    expect(
      [...hud.querySelectorAll("[data-throne-alert]")].map((e) => [
        e.getAttribute("data-throne-alert"),
        e.getAttribute("data-throne-id"),
      ]),
    ).toEqual([
      ["enemy", "10"],
      ["own", "11"],
    ]);
    thrones[1].isActive = () => false;
    hud.tick();
    await hud.updateComplete;
    expect(
      [...hud.querySelectorAll("[data-throne-alert]")].map((e) => [
        e.getAttribute("data-throne-alert"),
        e.getAttribute("data-throne-id"),
      ]),
    ).toEqual([
      ["enemy", "10"],
      ["teammate", "12"],
    ]);
    thrones[0].isActive = () => false;
    hud.tick();
    await hud.updateComplete;
    expect(
      [...hud.querySelectorAll("[data-throne-alert]")].map((e) => [
        e.getAttribute("data-throne-alert"),
        e.getAttribute("data-throne-id"),
      ]),
    ).toEqual([
      ["teammate", "12"],
      ["enemy", "13"],
    ]);
  });
  it("a closer teammate replaces your alert, while a temporary ally remains an enemy", async () => {
    thrones = [throne(10, 1, 100), throne(11, 2, 50), throne(12, 4, 0)];
    hud.tick();
    await hud.updateComplete;
    expect(hud.querySelector('[data-throne-alert="own"]')).toBeNull();
    expect(
      hud
        .querySelector('[data-throne-alert="teammate"]')
        ?.getAttribute("data-throne-id"),
    ).toBe("11");
    expect(
      hud
        .querySelector('[data-throne-alert="enemy"]')
        ?.getAttribute("data-throne-id"),
    ).toBe("12");
    mode = GameMode.FFA;
    hud.tick();
    await hud.updateComplete;
    expect(hud.querySelector('[data-throne-alert="teammate"]')).toBeNull();
    expect(
      hud
        .querySelector('[data-throne-alert="own"]')
        ?.getAttribute("data-throne-id"),
    ).toBe("10");
  });
  it("uses current ticks and deterministic id order", async () => {
    thrones = [throne(12, 1, 0), throne(10, 3, 0)];
    hud.tick();
    await hud.updateComplete;
    expect(
      [...hud.querySelectorAll("[data-throne-id]")].map((e) =>
        e.getAttribute("data-throne-id"),
      ),
    ).toEqual(["10", "12"]);
    tick = 110;
    hud.tick();
    await hud.updateComplete;
    expect(hud.querySelector('[data-throne-id="12"]')?.textContent).toContain(
      "19s until you win",
    );
  });
  function visibleRows() {
    const stack = hud.querySelector("[data-heads-up-stack]")!;
    return [...stack.children].map(
      (row) =>
        row.getAttribute("data-throne-id") ??
        (row.hasAttribute("data-game-toast") ? "toast" : "stock"),
    );
  }

  function warn(message = "Placement warning") {
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: { message, color: "red", duration: 3500 },
      }),
    );
  }

  it("stacks by arrival and closes gaps as cards clear", async () => {
    thrones = [];
    hud.tick();
    warn();
    thrones = [throne(12, 1, 50)];
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["toast", "12"]);

    thrones.push(throne(10, 3, 0));
    pauseUpdates = [{ paused: true }];
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["toast", "12", "10", "stock"]);

    warn();
    vi.advanceTimersByTime(3499);
    tick += 10;
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["toast", "12", "10", "stock"]);

    vi.advanceTimersByTime(1);
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["12", "10", "stock"]);

    thrones.shift();
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["10", "stock"]);

    thrones = [];
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["stock"]);

    pauseUpdates = [{ paused: false }];
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual([]);
  });
  it("lets an earlier stock notice stay above new alerts and a replaced warning", async () => {
    thrones = [];
    pauseUpdates = [{ paused: true }];
    hud.tick();
    warn();
    thrones = [throne(12, 1, 50)];
    hud.tick();
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["stock", "toast", "12"]);

    warn("A different warning");
    await hud.updateComplete;
    expect(visibleRows()).toEqual(["stock", "12", "toast"]);
    expect(hud.querySelector("[data-game-toast]")?.textContent).toContain(
      "A different warning",
    );
  });
  it("reserves the player-info area before the first hover and through show and hide", async () => {
    const info = new PlayerInfoOverlay();
    info.game = hud.game;
    (info as any)._isActive = true;
    document.body.append(info);
    try {
      hud.init();
      hud.tick();
      await hud.updateComplete;
      const stack = hud.querySelector<HTMLElement>("[data-heads-up-stack]")!;
      const reservedTop = stack.style.top;
      expect(reservedTop).toContain("--koth-player-info-bottom");

      info.setVisible(true);
      await info.updateComplete;
      await hud.updateComplete;
      expect(stack.style.top).toBe(reservedTop);
      info.setVisible(false);
      await info.updateComplete;
      await hud.updateComplete;
      expect(stack.style.top).toBe(reservedTop);

      info.style.setProperty("--game-health-offset", "60px");
      await Promise.resolve();
      expect(hud.style.getPropertyValue("--game-health-offset")).toBe("60px");
      info.style.removeProperty("--game-health-offset");
      await Promise.resolve();
      expect(hud.style.getPropertyValue("--game-health-offset")).toBe("");
    } finally {
      info.remove();
    }
  });
  it("preserves the existing warning styling outside KOTH", async () => {
    koth = false;
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: { message: "Normal warning", color: "red" },
      }),
    );
    await hud.updateComplete;
    const warning = hud.querySelector<HTMLElement>(
      "[data-game-toast-content]",
    )!;
    expect(warning.style.backgroundColor).toBe("rgba(239, 68, 68, 0.1)");
    expect(warning.getAttribute("style")).toContain(
      "backdrop-filter: blur(12px)",
    );
  });
});
