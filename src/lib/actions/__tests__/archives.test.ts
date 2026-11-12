import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { loadDashboard } from "@/lib/queries/dashboard";
import { loadSuggestions } from "@/lib/queries/reservations";

import {
  createShootHistory,
  localToday,
  updateShootHistory,
  type ShootHistoryInput,
} from "../archives";

const USER = "11111111-1111-4111-8111-111111111111";

function input(overrides: Partial<ShootHistoryInput> = {}): ShootHistoryInput {
  return {
    eventName: "",
    shootCategory: "solo",
    modelName: "栞奈",
    concept: "",
    placeCategory: "studio",
    venueName: "",
    shootDate: "2026-01-10",
    storageUrls: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("過去撮影登録", () => {
  it("入力内容を shoot_history と shoot_history_models に保存する", async () => {
    const { historyId } = await createShootHistory(
      USER,
      input({
        eventName: " 春の撮影会 ",
        concept: " 夕景 ",
        placeCategory: "outdoor",
        venueName: "代々木公園",
        storageUrls: [" https://example.com/a ", "", "https://example.com/b"],
      }),
    );

    const history = await db.shoot_history.get(historyId);
    expect(history).toMatchObject({
      shoot_date: "2026-01-10",
      title: "春の撮影会",
      shoot_category: "solo",
      concept: "夕景",
      place_category: "outdoor",
      venue_name: "代々木公園",
      storage_urls: ["https://example.com/a", "https://example.com/b"],
      deleted_at: null,
      venue_cost: 0,
      delivery_status: "not_started",
    });

    const [model] = await db.models.toArray();
    expect(model.sns_links).toEqual({});
    const [link] = await db.shoot_history_models.toArray();
    expect(link).toMatchObject({
      shoot_history_id: historyId,
      model_id: model.id,
      fee: 0,
      payment_status: "paid",
    });
  });

  it("親 → 子の順に送信キューへ積む", async () => {
    await createShootHistory(USER, input());

    const tables = (await db._outbox.orderBy("seq").toArray()).map(
      (e) => e.table,
    );
    expect(tables.indexOf("shoot_history")).toBeLessThan(
      tables.indexOf("shoot_history_models"),
    );
  });

  it.each([
    ["session", "セッション"],
    ["large", "大撮"],
  ] as const)(
    "%s はモデルなしで登録でき、タイトルは区分名になる",
    async (shootCategory, title) => {
      const { historyId } = await createShootHistory(
        USER,
        input({ shootCategory, modelName: "隠す前の入力" }),
      );

      expect((await db.shoot_history.get(historyId))?.title).toBe(title);
      expect(await db.models.count()).toBe(0);
      expect(await db.shoot_history_models.count()).toBe(0);
    },
  );

  it("ストレージURLが無くても登録でき、空の配列で保存する", async () => {
    const { historyId } = await createShootHistory(
      USER,
      input({ storageUrls: ["", "  "] }),
    );

    expect((await db.shoot_history.get(historyId))?.storage_urls).toEqual([]);
  });

  it("ストレージURLは10個まで登録でき、11個目はエラーにする", async () => {
    const urls = (n: number) =>
      Array.from({ length: n }, (_, i) => `https://example.com/${i}`);

    const { historyId } = await createShootHistory(
      USER,
      input({ storageUrls: urls(10) }),
    );
    expect((await db.shoot_history.get(historyId))?.storage_urls).toHaveLength(
      10,
    );

    await expect(
      createShootHistory(USER, input({ storageUrls: urls(11) })),
    ).rejects.toThrow("10個まで");
    expect(await db.shoot_history.count()).toBe(1);
  });

  it("モデルが必要な区分で名前が空ならエラーにする", async () => {
    await expect(
      createShootHistory(USER, input({ modelName: "  " })),
    ).rejects.toThrow("モデル名を入力してください");
    expect(await db.shoot_history.count()).toBe(0);
  });

  it("今日は登録でき、未来の日付はエラーにする", async () => {
    await expect(
      createShootHistory(USER, input({ shootDate: localToday() })),
    ).resolves.toBeTruthy();
    await expect(
      createShootHistory(USER, input({ shootDate: "2999-01-01" })),
    ).rejects.toThrow("今日以前");
    expect(await db.shoot_history.count()).toBe(1);
  });

  it("登録するとダッシュボードの直近の撮影に出る", async () => {
    const { historyId } = await createShootHistory(
      USER,
      input({
        eventName: "春の撮影会",
        storageUrls: ["https://example.com/a"],
      }),
    );

    const { recent } = await loadDashboard();
    expect(recent.find((s) => s.sourceId === historyId)?.storageUrls).toEqual([
      "https://example.com/a",
    ]);
  });

  it("登録した撮影会名を次回の候補に出す", async () => {
    await createShootHistory(USER, input({ eventName: "春の撮影会" }));

    expect((await loadSuggestions()).events).toContain("春の撮影会");
  });
});

describe("複数モデルの過去撮影登録", () => {
  it("追加したモデルも紐づけ、5人を超える分と重複・空欄は無視する", async () => {
    const { historyId } = await createShootHistory(
      USER,
      input({
        modelName: "栞奈",
        extraModelNames: ["葵", " ", "栞奈", "凛", "美咲", "結衣", "余り"],
      }),
    );
    const links = await db.shoot_history_models
      .where("shoot_history_id")
      .equals(historyId)
      .toArray();
    const names = (await db.models.bulkGet(links.map((l) => l.model_id))).map(
      (m) => m!.name,
    );
    expect(names.sort()).toEqual(["凛", "栞奈", "美咲", "結衣", "葵"].sort());
  });

  it("編集でモデルを減らすと紐づけも外れる", async () => {
    const { historyId } = await createShootHistory(
      USER,
      input({ extraModelNames: ["葵", "凛"] }),
    );
    await updateShootHistory(
      USER,
      historyId,
      input({ extraModelNames: ["凛"] }),
    );
    const links = await db.shoot_history_models
      .where("shoot_history_id")
      .equals(historyId)
      .toArray();
    const names = (await db.models.bulkGet(links.map((l) => l.model_id))).map(
      (m) => m!.name,
    );
    expect(names.sort()).toEqual(["凛", "栞奈"].sort());
  });
});
