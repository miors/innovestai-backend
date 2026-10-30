const express = require("express");
const router = express.Router();
const db = require("../config/db");
const requireAuth = require("../middleware/auth");

//1.READ: fetch a user's watchlist along with Strategy Notes
router.get("/", requireAuth, async (req, res, next) => {
  const user_id = req.user.id;

  try {
    const queryText = `
        SELECT w.id, w.symbol, w.asset_type, w.created_at, w.quantity, w.buy_price, n.notes_content
        from public.capstone_watchlists w LEFT JOIN public.capstone_asset_notes n
        ON w.id = n.watchlist_id
        WHERE w.user_id = $1
        ORDER BY w.created_at DESC;`;

    const result = await db.query(queryText, [user_id]);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

//2.CREATE: add an asset vector to the watchlist
router.post("/", requireAuth, async (req, res, next) => {
  const { symbol, asset_type } = req.body;
  const user_id = req.user.id;

  if (!symbol || typeof symbol !== "string" || !symbol.trim()) {
    return res.status(400).json({ error: "Symbol is required." });
  }
  if (!["stock", "crypto"].includes(asset_type)) {
    return res
      .status(400)
      .json({ error: "Asset type must be stock or crypto." });
  }

  try {
    const queryText = `
            INSERT INTO public.capstone_watchlists (user_id, symbol, asset_type) 
            VALUES ($1, $2, $3) 
            RETURNING *;
        `;
    const result = await db.query(queryText, [
      user_id,
      symbol.trim().toUpperCase(),
      asset_type,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "That asset is already in your watchlist." });
    }
    next(err);
  }
});

//3.UPDATE: modify or instantiate Strategy Notes for an Asset
router.put("/notes", requireAuth, async (req, res, next) => {
  const { watchlist_id, notes_content } = req.body;
  const user_id = req.user.id;

  if (
    watchlist_id === undefined ||
    watchlist_id === null ||
    !["string", "number"].includes(typeof watchlist_id) ||
    String(watchlist_id).trim() === ""
  ) {
    return res.status(400).json({ error: "watchlist_id is required." });
  }
  if (typeof notes_content !== "string") {
    return res.status(400).json({ error: "notes_content must be a string." });
  }
  if (notes_content.length > 5000) {
    return res
      .status(400)
      .json({ error: "notes_content must be 5000 characters or fewer." });
  }
  try {
    const queryText = `
      INSERT INTO public.capstone_asset_notes (watchlist_id, notes_content, updated_at)
      SELECT w.id, $2, NOW()
      FROM public.capstone_watchlists w
      WHERE w.id = $1 AND w.user_id = $3
      ON CONFLICT (watchlist_id)
      DO UPDATE SET notes_content = EXCLUDED.notes_content, updated_at = NOW()
      RETURNING *;
    `;
    const result = await db.query(queryText, [
      watchlist_id,
      notes_content,
      user_id,
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Watchlist item not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

//4.DELETE: Destroys an Asset Track Row (Cascades automatically clear notes)
router.delete("/:id", requireAuth, async (req, res, next) => {
  const { id } = req.params;
  const user_id = req.user.id;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return res.status(400).json({ error: "id must be a valid UUID." });
  }
  try {
    const queryText = `DELETE FROM public.capstone_watchlists WHERE id = $1 AND user_id = $2 RETURNING *;`;
    const result = await db.query(queryText, [id, user_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Asset element not found" });
    }
    res.json({
      message: "Asset removed successfully from portfolio container maps.",
    });
  } catch (err) {
    next(err);
  }
});

//5.UPDATE: set quantity and buy price for a holding
// quantity and buy_price: each must be a finite number that is zero or greater, or null
router.put("/holding", requireAuth, async (req, res, next) => {
  const { watchlist_id, quantity, buy_price } = req.body;
  const user_id = req.user.id;

  if (
    watchlist_id === undefined ||
    watchlist_id === null ||
    !["string", "number"].includes(typeof watchlist_id) ||
    String(watchlist_id).trim() === ""
  ) {
    return res.status(400).json({ error: "watchlist_id is required." });
  }
  // null is allowed so a holding can be cleared
  for (const [name, value] of [
    ["quantity", quantity],
    ["buy_price", buy_price],
  ]) {
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    ) {
      return res
        .status(400)
        .json({ error: `${name} must be a non-negative number or null.` });
    }
  }
  try {
    const result = await db.query(
      `UPDATE public.capstone_watchlists
       SET quantity = $1, buy_price = $2
       WHERE id = $3 AND user_id = $4
       RETURNING *;`,
      [quantity, buy_price, watchlist_id, user_id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Watchlist item not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
