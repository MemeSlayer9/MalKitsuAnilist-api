const express = require("express");
const router  = express.Router();

const {
  resolveMalFromAnilist,
  handleInfo,
  handleWatch,
} = require("../lib/anime");

// ─── AniList Info + Episodes (merged) ─────────────────────────────────────────
// GET /anime/anilist/:anilistId
// GET /anime/anilist/:anilistId/episodes  (alias)

router.get(["/:anilistId", "/:anilistId/episodes"], async (req, res) => {
  try {
    const malId = await resolveMalFromAnilist(req.params.anilistId);
    return handleInfo(malId, req.query.color || null, req.query.autoplay || false, res);
  } catch (err) {
    return res.status(404).json({
      error:      "Failed to resolve AniList ID",
      message:    err.message,
      anilist_id: Number(req.params.anilistId),
    });
  }
});

// ─── AniList Watch ────────────────────────────────────────────────────────────
// GET /anime/anilist/:anilistId/watch/:epNum

router.get("/:anilistId/watch/:epNum", async (req, res) => {
  try {
    const malId = await resolveMalFromAnilist(req.params.anilistId);
    return handleWatch(malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res);
  } catch (err) {
    return res.status(404).json({
      error:      "Failed to resolve AniList ID",
      message:    err.message,
      anilist_id: Number(req.params.anilistId),
    });
  }
});

module.exports = router;