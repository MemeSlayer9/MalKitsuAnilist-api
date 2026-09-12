const express = require("express");
const axios   = require("axios");
const router  = express.Router();

const {
  loadAnimeMap,
  getAnimeMap,
  getKitsuToMal,
  formatKitsuAnime,
  getMalImages,
  getTmdbImages,
  resolveMalFromKitsu,
  handleInfo,
  handleWatch,
  KITSU,
} = require("../lib/anime");

// ─── Kitsu Search ─────────────────────────────────────────────────────────────
// GET /anime/kitsu/search?q=...&limit=10&offset=0

router.get("/search", async (req, res) => {
  const { q, limit = 10, offset = 0 } = req.query;
  if (!q) return res.status(400).json({ error: "Missing required query parameter: q" });
  try {
    await loadAnimeMap();
    const animeMap  = getAnimeMap();
    const kitsuToMal = getKitsuToMal();

    const { data } = await axios.get(`${KITSU}/anime`, {
      params: {
        "filter[text]":  q,
        "page[limit]":   Math.min(Number(limit), 20),
        "page[offset]":  Number(offset),
        "fields[anime]": "canonicalTitle,titles,synopsis,averageRating,popularityRank,ratingRank,ageRating,status,episodeCount,episodeLength,startDate,endDate,posterImage,coverImage,subtype,showType",
      },
      timeout: 10000,
    });

    const baseResults = (data.data || []).map((item) => {
      const anime    = formatKitsuAnime(item);
      const malId    = kitsuToMal[Number(anime.kitsu_id)] || null;
      const mapEntry = malId ? (animeMap[malId] || {}) : {};
      return { anime, mapEntry, malId };
    });

    const results = await Promise.all(
      baseResults.map(async ({ anime, mapEntry, malId }) => {
        const [tmdbImages, malImages] = await Promise.all([
          getTmdbImages(mapEntry),
          getMalImages(malId),
        ]);
        return {
          ...anime,
          image:        malImages?.image        || null,
          image_medium: malImages?.image_medium || null,
          mal_id:       malId                   || null,
          anilist_id:   mapEntry.anilistId      || null,
          images: { tmdb: tmdbImages },
        };
      })
    );

    return res.json({ query: q, limit: Number(limit), offset: Number(offset), total: data.meta?.count || results.length, paging: data.links || null, results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to search Kitsu", message: err.message });
  }
});

// ─── Kitsu Trending ───────────────────────────────────────────────────────────
// GET /anime/kitsu/trending?limit=10

router.get("/trending", async (req, res) => {
  const { limit = 10 } = req.query;
  try {
    await loadAnimeMap();
    const animeMap   = getAnimeMap();
    const kitsuToMal = getKitsuToMal();

    const { data } = await axios.get(`${KITSU}/trending/anime`, {
      params: {
        "page[limit]":   Math.min(Number(limit), 20),
        "fields[anime]": "canonicalTitle,titles,synopsis,averageRating,popularityRank,ratingRank,ageRating,status,episodeCount,episodeLength,startDate,endDate,posterImage,coverImage,subtype,showType",
      },
      timeout: 10000,
    });

    const baseResults = (data.data || []).map((item) => {
      const anime    = formatKitsuAnime(item);
      const malId    = kitsuToMal[Number(anime.kitsu_id)] || null;
      const mapEntry = malId ? (animeMap[malId] || {}) : {};
      return { anime, mapEntry, malId };
    });

    const results = await Promise.all(
      baseResults.map(async ({ anime, mapEntry, malId }) => {
        const [tmdbImages, malImages] = await Promise.all([
          getTmdbImages(mapEntry),
          getMalImages(malId),
        ]);
        return {
          ...anime,
          image:        malImages?.image        || null,
          image_medium: malImages?.image_medium || null,
          mal_id:       malId                   || null,
          anilist_id:   mapEntry.anilistId      || null,
          images: { tmdb: tmdbImages },
        };
      })
    );

    return res.json({ limit: Number(limit), total: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch Kitsu trending", message: err.message });
  }
});

// ─── Kitsu Info + Episodes (merged) ───────────────────────────────────────────
// GET /anime/kitsu/:kitsuId
// GET /anime/kitsu/:kitsuId/episodes  (alias)

router.get(["/:kitsuId", "/:kitsuId/episodes"], async (req, res) => {
  try {
    const malId = await resolveMalFromKitsu(req.params.kitsuId);
    return handleInfo(malId, req.query.color || null, req.query.autoplay || false, res);
  } catch (err) {
    return res.status(404).json({
      error:    "Failed to resolve Kitsu ID",
      message:  err.message,
      kitsu_id: Number(req.params.kitsuId),
    });
  }
});

// ─── Kitsu Watch ──────────────────────────────────────────────────────────────
// GET /anime/kitsu/:kitsuId/watch/:epNum

router.get("/:kitsuId/watch/:epNum", async (req, res) => {
  try {
    const malId = await resolveMalFromKitsu(req.params.kitsuId);
    return handleWatch(malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res);
  } catch (err) {
    return res.status(404).json({
      error:    "Failed to resolve Kitsu ID",
      message:  err.message,
      kitsu_id: Number(req.params.kitsuId),
    });
  }
});

module.exports = router;