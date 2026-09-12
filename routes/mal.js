const express  = require("express");
const axios    = require("axios");
const router   = express.Router();

const {
  loadAnimeMap,
  getAnimeMap,
  malGet,
  formatMalAnime,
  getKitsuImages,
  getTmdbImages,
  handleInfo,
  handleWatch,
  MAL_ANIME_FIELDS,
} = require("../lib/anime");

// ─── MAL Search ───────────────────────────────────────────────────────────────
// GET /anime/mal/search?q=...&limit=10&offset=0

router.get("/search", async (req, res) => {
  const { q, limit = 10, offset = 0, fields } = req.query;
  if (!q) return res.status(400).json({ error: "Missing required query parameter: q" });
  try {
    await loadAnimeMap();
    const animeMap = getAnimeMap();
    const data = await malGet("/anime", {
      q,
      limit:  Math.min(Number(limit), 100),
      offset: Number(offset),
      fields: fields || MAL_ANIME_FIELDS,
    });

    const baseResults = (data.data || []).map((item) => {
      const anime    = formatMalAnime(item.node);
      const mapEntry = animeMap[anime.mal_id] || {};
      return { anime, mapEntry };
    });

    const results = await Promise.all(
      baseResults.map(async ({ anime, mapEntry }) => {
        const [tmdbImages, kitsuImages] = await Promise.all([
          getTmdbImages(mapEntry),
          getKitsuImages(mapEntry.kitsuId || null),
        ]);
        return {
          ...anime,
          poster_image: kitsuImages?.poster_image || null,
          cover_image:  kitsuImages?.cover_image  || null,
          anilist_id:   mapEntry.anilistId        || null,
          kitsu_id:     mapEntry.kitsuId          || null,
          images: { tmdb: tmdbImages },
        };
      })
    );

    return res.json({ query: q, limit: Number(limit), offset: Number(offset), total: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to search MAL", message: err.message });
  }
});

// ─── MAL Ranking ──────────────────────────────────────────────────────────────
// GET /anime/mal/ranking?ranking_type=all&limit=20&offset=0

router.get("/ranking", async (req, res) => {
  const { ranking_type = "all", limit = 20, offset = 0, fields } = req.query;
  const validTypes = ["all", "airing", "upcoming", "tv", "ova", "movie", "special", "bypopularity", "favorite"];
  if (!validTypes.includes(ranking_type)) {
    return res.status(400).json({ error: "Invalid ranking_type", valid_types: validTypes, received: ranking_type });
  }
  try {
    await loadAnimeMap();
    const animeMap = getAnimeMap();
    const data = await malGet("/anime/ranking", {
      ranking_type,
      limit:  Math.min(Number(limit), 500),
      offset: Number(offset),
      fields: fields || MAL_ANIME_FIELDS,
    });

    const baseResults = (data.data || []).map((item) => {
      const anime    = formatMalAnime(item.node);
      const mapEntry = animeMap[anime.mal_id] || {};
      return { anime, mapEntry, rank: item.ranking?.rank || null };
    });

    const results = await Promise.all(
      baseResults.map(async ({ anime, mapEntry, rank }) => {
        const [tmdbImages, kitsuImages] = await Promise.all([
          getTmdbImages(mapEntry),
          getKitsuImages(mapEntry.kitsuId || null),
        ]);
        return {
          rank,
          ...anime,
          poster_image: kitsuImages?.poster_image || null,
          cover_image:  kitsuImages?.cover_image  || null,
          anilist_id:   mapEntry.anilistId        || null,
          kitsu_id:     mapEntry.kitsuId          || null,
          images: { tmdb: tmdbImages },
        };
      })
    );

    return res.json({ ranking_type, limit: Number(limit), offset: Number(offset), total: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch MAL ranking", message: err.message });
  }
});

// ─── MAL Season ───────────────────────────────────────────────────────────────
// GET /anime/mal/season/:year/:season

router.get("/season/:year/:season", async (req, res) => {
  const { year, season } = req.params;
  const { limit = 20, offset = 0, sort = "anime_score", fields } = req.query;
  const validSeasons = ["winter", "spring", "summer", "fall"];
  if (!validSeasons.includes(season.toLowerCase())) {
    return res.status(400).json({ error: "Invalid season", valid_seasons: validSeasons, received: season });
  }
  const parsedYear = parseInt(year, 10);
  if (isNaN(parsedYear) || parsedYear < 1917 || parsedYear > 2100) {
    return res.status(400).json({ error: "Invalid year", received: year });
  }
  try {
    await loadAnimeMap();
    const animeMap = getAnimeMap();
    const data = await malGet(`/anime/season/${parsedYear}/${season.toLowerCase()}`, {
      limit:  Math.min(Number(limit), 500),
      offset: Number(offset),
      sort,
      fields: fields || MAL_ANIME_FIELDS,
    });

    const baseResults = (data.data || []).map((item) => {
      const anime    = formatMalAnime(item.node);
      const mapEntry = animeMap[anime.mal_id] || {};
      return { anime, mapEntry };
    });

    const results = await Promise.all(
      baseResults.map(async ({ anime, mapEntry }) => {
        const [tmdbImages, kitsuImages] = await Promise.all([
          getTmdbImages(mapEntry),
          getKitsuImages(mapEntry.kitsuId || null),
        ]);
        return {
          ...anime,
          poster_image: kitsuImages?.poster_image || null,
          cover_image:  kitsuImages?.cover_image  || null,
          anilist_id:   mapEntry.anilistId        || null,
          kitsu_id:     mapEntry.kitsuId          || null,
          images: { tmdb: tmdbImages },
        };
      })
    );

    return res.json({ year: parsedYear, season: season.toLowerCase(), sort, limit: Number(limit), offset: Number(offset), total: results.length, results });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch MAL seasonal anime", message: err.message });
  }
});

// ─── MAL Info + Episodes (merged) ─────────────────────────────────────────────
// GET /anime/mal/:malId
// GET /anime/mal/:malId/episodes  (alias)

router.get("/:malId",          (req, res) => handleInfo(req.params.malId, req.query.color || null, req.query.autoplay || false, res));
router.get("/:malId/episodes", (req, res) => handleInfo(req.params.malId, req.query.color || null, req.query.autoplay || false, res));

// ─── MAL Watch ────────────────────────────────────────────────────────────────
// GET /anime/mal/:malId/watch/:epNum

router.get("/:malId/watch/:epNum", (req, res) =>
  handleWatch(req.params.malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res)
);

module.exports = router;