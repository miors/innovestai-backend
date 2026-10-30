process.env.OPENAI_API_KEY = "test-key";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";

jest.mock("../config/db", () => ({ query: jest.fn() }));
jest.mock("../middleware/auth", () => (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Missing token" });
  }
  req.user = { id: "user-1" };
  next();
});

const request = require("supertest");
const db = require("../config/db");
const app = require("../server");

const AUTH = { Authorization: "Bearer test-token" };

beforeEach(() => {
  db.query.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("POST /api/watchlist (create)", () => {
  it("creates an asset, uppercasing and trimming the symbol", async () => {
    const row = { id: 1, symbol: "AAPL", asset_type: "stock" };
    db.query.mockResolvedValue({ rows: [row], rowCount: 1 });

    const res = await request(app)
      .post("/api/watchlist")
      .set(AUTH)
      .send({ symbol: "  aapl ", asset_type: "stock" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(row);
    expect(db.query.mock.calls[0][1]).toEqual(["user-1", "AAPL", "stock"]);
  });

  it("returns 409 when the asset already exists", async () => {
    db.query.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "23505" }),
    );

    const res = await request(app)
      .post("/api/watchlist")
      .set(AUTH)
      .send({ symbol: "AAPL", asset_type: "stock" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in your watchlist/i);
  });

  it.each([
    ["missing symbol", { asset_type: "stock" }],
    ["blank symbol", { symbol: "   ", asset_type: "stock" }],
    ["non-string symbol", { symbol: 123, asset_type: "stock" }],
    ["invalid asset_type", { symbol: "AAPL", asset_type: "bond" }],
    ["missing asset_type", { symbol: "AAPL" }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await request(app).post("/api/watchlist").set(AUTH).send(body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("returns 500 on unexpected DB errors", async () => {
    db.query.mockRejectedValue(new Error("boom"));
    const res = await request(app)
      .post("/api/watchlist")
      .set(AUTH)
      .send({ symbol: "AAPL", asset_type: "stock" });
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/watchlist/notes (update notes)", () => {
  it("upserts notes for the user's item", async () => {
    const row = { watchlist_id: 1, notes_content: "hold" };
    db.query.mockResolvedValue({ rows: [row], rowCount: 1 });

    const res = await request(app)
      .put("/api/watchlist/notes")
      .set(AUTH)
      .send({ watchlist_id: 1, notes_content: "hold" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(row);
    expect(db.query.mock.calls[0][1]).toEqual([1, "hold", "user-1"]);
  });

  it("allows clearing notes with an empty string", async () => {
    db.query.mockResolvedValue({ rows: [{}], rowCount: 1 });
    const res = await request(app)
      .put("/api/watchlist/notes")
      .set(AUTH)
      .send({ watchlist_id: 1, notes_content: "" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when the item isn't the user's", async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await request(app)
      .put("/api/watchlist/notes")
      .set(AUTH)
      .send({ watchlist_id: 99, notes_content: "x" });
    expect(res.status).toBe(404);
  });

  it.each([
    ["missing watchlist_id", { notes_content: "x" }],
    ["object watchlist_id", { watchlist_id: {}, notes_content: "x" }],
    ["non-string notes", { watchlist_id: 1, notes_content: 5 }],
    ["missing notes", { watchlist_id: 1 }],
    ["notes too long", { watchlist_id: 1, notes_content: "a".repeat(5001) }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await request(app)
      .put("/api/watchlist/notes")
      .set(AUTH)
      .send(body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("PUT /api/watchlist/holding (update holding)", () => {
  it("updates quantity and buy_price", async () => {
    const row = { id: 1, quantity: 10, buy_price: 150.5 };
    db.query.mockResolvedValue({ rows: [row], rowCount: 1 });

    const res = await request(app)
      .put("/api/watchlist/holding")
      .set(AUTH)
      .send({ watchlist_id: 1, quantity: 10, buy_price: 150.5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(row);
    expect(db.query.mock.calls[0][1]).toEqual([10, 150.5, 1, "user-1"]);
  });

  it("accepts null to clear a holding", async () => {
    db.query.mockResolvedValue({ rows: [{}], rowCount: 1 });
    const res = await request(app)
      .put("/api/watchlist/holding")
      .set(AUTH)
      .send({ watchlist_id: 1, quantity: null, buy_price: null });
    expect(res.status).toBe(200);
  });

  it("returns 404 when the item isn't found", async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await request(app)
      .put("/api/watchlist/holding")
      .set(AUTH)
      .send({ watchlist_id: 99, quantity: 1, buy_price: 1 });
    expect(res.status).toBe(404);
  });

  it.each([
    ["negative quantity", { watchlist_id: 1, quantity: -1, buy_price: 1 }],
    ["negative buy_price", { watchlist_id: 1, quantity: 1, buy_price: -0.01 }],
    ["string quantity", { watchlist_id: 1, quantity: "5", buy_price: 1 }],
    ["missing buy_price", { watchlist_id: 1, quantity: 1 }],
    ["missing watchlist_id", { quantity: 1, buy_price: 1 }],
  ])("returns 400 for %s", async (_name, body) => {
    const res = await request(app)
      .put("/api/watchlist/holding")
      .set(AUTH)
      .send(body);
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/watchlist/:id", () => {
  const ID = "123e4567-e89b-42d3-a456-426614174000";

  it("deletes the user's asset", async () => {
    db.query.mockResolvedValue({ rows: [{ id: ID }], rowCount: 1 });
    const res = await request(app).delete(`/api/watchlist/${ID}`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed/i);
    expect(db.query.mock.calls[0][1]).toEqual([ID, "user-1"]);
  });

  it("returns 404 when nothing was deleted", async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await request(app).delete(`/api/watchlist/${ID}`).set(AUTH);
    expect(res.status).toBe(404);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).delete(`/api/watchlist/${ID}`);
    expect(res.status).toBe(401);
  });

  it.each(["abc", "-1", "1", "1.5", "1; DROP TABLE x"])(
    "returns 400 for invalid id %s",
    async (id) => {
      const res = await request(app)
        .delete(`/api/watchlist/${encodeURIComponent(id)}`)
        .set(AUTH);
      expect(res.status).toBe(400);
      expect(db.query).not.toHaveBeenCalled();
    },
  );
});
