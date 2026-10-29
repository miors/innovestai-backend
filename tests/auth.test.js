process.env.OPENAI_API_KEY = "test-key";
process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";

const request = require("supertest");
const app = require("../server");

describe("protected routes", () => {
  it("rejects /api/market/price/AAPL without a token", async () => {
    const res = await request(app).get("/api/market/price/AAPL");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing token");
  });

  it("rejects /api/watchlist without a token", async () => {
    const res = await request(app).get("/api/watchlist");
    expect(res.status).toBe(401);
  });

  it("rejects /api/ai/analyze without a token", async () => {
    const res = await request(app).post("/api/ai/analyze").send({});
    expect(res.status).toBe(401);
  });
});
