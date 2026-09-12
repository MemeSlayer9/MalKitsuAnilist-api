const express = require("express");

const { loadAnimeMap, resolveMalFromAnilist, handleInfo, handleWatch } = require("./lib/anime");
const malRouter     = require("./routes/mal");
const anilistRouter = require("./routes/anilist");
const kitsuRouter   = require("./routes/kitsu");

const app  = express();
const PORT = 3000;

// ─── Mount routers ────────────────────────────────────────────────────────────

app.use("/anime/mal",     malRouter);
app.use("/anime/anilist", anilistRouter);
app.use("/anime/kitsu",   kitsuRouter);

// ─── Backward-compat: /anime/:malId (no prefix) ───────────────────────────────

app.get("/anime/:malId",              (req, res) => handleInfo(req.params.malId, req.query.color || null, req.query.autoplay || false, res));
app.get("/anime/:malId/episodes",     (req, res) => handleInfo(req.params.malId, req.query.color || null, req.query.autoplay || false, res));
app.get("/anime/:malId/watch/:epNum", (req, res) => handleWatch(req.params.malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res));

// ─── Backward-compat: /anilist/:anilistId (top-level) ────────────────────────

app.get(["/anilist/:anilistId", "/anilist/:anilistId/episodes"], async (req, res) => {
  try {
    const { resolveMalFromAnilist: resolve } = require("./lib/anime");
    const malId = await resolve(req.params.anilistId);
    return res.redirect(307, `/anime/${malId}?${new URLSearchParams(req.query)}`);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(req.params.anilistId) });
  }
});

app.get("/anilist/:anilistId/watch/:epNum", async (req, res) => {
  try {
    const { resolveMalFromAnilist: resolve } = require("./lib/anime");
    const malId = await resolve(req.params.anilistId);
    return res.redirect(307, `/anime/${malId}/watch/${req.params.epNum}?${new URLSearchParams(req.query)}`);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(req.params.anilistId) });
  }
});

// ─── Root ─────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  return res.json({
    name:     "Yenime Anime API",
    version:  "1.2.0",
    base_url: base,
    endpoints: {
      by_mal_id: {
        info:     { method: "GET", url: `${base}/anime/mal/:malId`,                description: "Full info: synopsis, episodes, related, characters",  example: `${base}/anime/mal/21` },
        episodes: { method: "GET", url: `${base}/anime/mal/:malId/episodes`,       description: "Alias for info route",                                example: `${base}/anime/mal/21/episodes` },
        watch:    { method: "GET", url: `${base}/anime/mal/:malId/watch/:epNum`,   description: "Single episode by MAL ID",                            example: `${base}/anime/mal/21/watch/1` },
        search:   { method: "GET", url: `${base}/anime/mal/search`,                description: "Search anime on MAL",                                 example: `${base}/anime/mal/search?q=one+piece&limit=10` },
        ranking:  { method: "GET", url: `${base}/anime/mal/ranking`,               description: "MAL anime rankings",                                  example: `${base}/anime/mal/ranking?ranking_type=all&limit=20` },
        season:   { method: "GET", url: `${base}/anime/mal/season/:year/:season`,  description: "Seasonal anime from MAL",                             example: `${base}/anime/mal/season/2024/winter` },
      },
      by_anilist_id: {
        info:     { method: "GET", url: `${base}/anime/anilist/:anilistId`,               description: "Full info: synopsis, episodes, related, characters",  example: `${base}/anime/anilist/21` },
        episodes: { method: "GET", url: `${base}/anime/anilist/:anilistId/episodes`,      description: "Alias for info route",                                example: `${base}/anime/anilist/21/episodes` },
        watch:    { method: "GET", url: `${base}/anime/anilist/:anilistId/watch/:epNum`,  description: "Single episode by AniList ID",                        example: `${base}/anime/anilist/21/watch/1` },
      },
      by_kitsu_id: {
        info:     { method: "GET", url: `${base}/anime/kitsu/:kitsuId`,               description: "Full info: synopsis, episodes, related, characters",  example: `${base}/anime/kitsu/12` },
        episodes: { method: "GET", url: `${base}/anime/kitsu/:kitsuId/episodes`,      description: "Alias for info route",                                example: `${base}/anime/kitsu/12/episodes` },
        watch:    { method: "GET", url: `${base}/anime/kitsu/:kitsuId/watch/:epNum`,  description: "Single episode by Kitsu ID",                          example: `${base}/anime/kitsu/12/watch/1` },
        search:   { method: "GET", url: `${base}/anime/kitsu/search`,                 description: "Search anime on Kitsu",                               example: `${base}/anime/kitsu/search?q=one+piece&limit=10` },
        trending: { method: "GET", url: `${base}/anime/kitsu/trending`,               description: "Trending anime from Kitsu",                           example: `${base}/anime/kitsu/trending?limit=10` },
      },
    },
    query_params:    { autoplay: "true | false", color: "hex without # (e.g. e74c3c)", startAt: "seconds (watch route only)" },
    info_includes:   ["synopsis", "episodes", "related_entries (MAL)", "anilist_related", "characters + voice_actors", "images (tmdb + anilist)", "cross-platform IDs"],
    mal_ranking_types: ["all", "airing", "upcoming", "tv", "ova", "movie", "special", "bypopularity", "favorite"],
    mal_seasons:       ["winter", "spring", "summer", "fall"],
    example_anime: {
      one_piece:         { mal_id: 21,    anilist_id: 21,     kitsu_id: 12,    info: `${base}/anime/mal/21`,    watch_ep1: `${base}/anime/mal/21/watch/1` },
      frieren:           { mal_id: 52991, anilist_id: 154587, kitsu_id: 47194, info: `${base}/anime/mal/52991`, watch_ep1: `${base}/anime/mal/52991/watch/1` },
      bleach_original:   { mal_id: 269,   anilist_id: 269,    kitsu_id: 41,    info: `${base}/anime/mal/269`,   watch_ep1: `${base}/anime/mal/269/watch/1` },
      bleach_tybw_part1: { mal_id: 56784, anilist_id: 169755, kitsu_id: null,  info: `${base}/anime/mal/56784`, watch_ep1: `${base}/anime/mal/56784/watch/1` },
      bleach_tybw_part2: { mal_id: 60636, anilist_id: 185874, kitsu_id: null,  info: `${base}/anime/mal/60636`, watch_ep1: `${base}/anime/mal/60636/watch/1` },
    },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  try { await loadAnimeMap(); } catch (err) { console.error("Failed to preload anime map:", err.message); }
});