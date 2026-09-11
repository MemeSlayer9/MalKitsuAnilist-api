const express = require("express");
const axios   = require("axios");

const app    = express();
const PORT   = 3000;
const YENIME = "https://api.yenime.net/anime";

const TMDB_KEY = "699be86b7a4ca2c8bc77525cb4938dc0";
const TMDB     = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const MAL_CLIENT_ID = "03e9d1380f35c65bdbe6486ef3da8458";
const MAL           = "https://api.myanimelist.net/v2";

// ─── Maps ─────────────────────────────────────────────────────────────────────

let animeMap     = null;
let anilistToMal = null;
let kitsuToMal   = null;

async function loadAnimeMap() {
  if (animeMap) return animeMap;
  console.log("Loading anime ID mapping...");
  const { data } = await axios.get(
    "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json",
    { timeout: 15000 }
  );
  animeMap     = {};
  anilistToMal = {};
  kitsuToMal   = {};
  for (const entry of data) {
    if (!entry.mal_id) continue;
    const tmdbId    = entry.themoviedb_id?.tv         || null;
    const tmdbMovie = entry.themoviedb_id?.movie?.[0] || null;
    const anilistId = entry.anilist_id                || null;
    const kitsuId   = entry.kitsu_id                  || null;
    animeMap[entry.mal_id] = { tmdbId, tmdbMovie, anilistId, kitsuId, type: entry.type || "TV" };
    if (anilistId) anilistToMal[anilistId] = entry.mal_id;
    if (kitsuId)   kitsuToMal[kitsuId]     = entry.mal_id;
  }
  console.log(`Loaded ${Object.keys(animeMap).length} anime mappings.`);
  return animeMap;
}

// ─── MAL API helpers ──────────────────────────────────────────────────────────

const MAL_HEADERS = { "X-MAL-CLIENT-ID": MAL_CLIENT_ID };

const MAL_ANIME_FIELDS = [
  "id", "title", "main_picture", "alternative_titles", "start_date", "end_date",
  "synopsis", "mean", "rank", "popularity", "num_list_users", "num_scoring_users",
  "nsfw", "created_at", "updated_at", "media_type", "status", "genres",
  "num_episodes", "start_season", "broadcast", "source", "average_episode_duration",
  "rating", "pictures", "background", "related_anime", "studios",
].join(",");

async function malGet(path, params = {}) {
  const { data } = await axios.get(`${MAL}${path}`, {
    headers: MAL_HEADERS,
    params,
    timeout: 10000,
  });
  return data;
}

function formatMalAnime(node) {
  if (!node) return null;
  return {
    mal_id:         node.id,
    title:          node.title,
    image:          node.main_picture?.large || node.main_picture?.medium || null,
    image_medium:   node.main_picture?.medium || null,
    alternative_titles: node.alternative_titles || null,
    synopsis:       node.synopsis       || null,
    mean_score:     node.mean           || null,
    rank:           node.rank           || null,
    popularity:     node.popularity     || null,
    num_episodes:   node.num_episodes   || null,
    status:         node.status         || null,
    media_type:     node.media_type     || null,
    genres:         (node.genres || []).map((g) => g.name),
    start_date:     node.start_date     || null,
    end_date:       node.end_date       || null,
    start_season:   node.start_season   || null,
    source:         node.source         || null,
    rating:         node.rating         || null,
    studios:        (node.studios || []).map((s) => s.name),
    average_episode_duration: node.average_episode_duration || null,
  };
}

// ─── Kitsu API helpers ────────────────────────────────────────────────────────

const KITSU = "https://kitsu.app/api/edge";

function formatKitsuAnime(item) {
  if (!item) return null;
  const a = item.attributes || {};
  return {
    kitsu_id:       item.id,
    title:          a.canonicalTitle || a.titles?.en || null,
    titles:         a.titles         || null,
    synopsis:       a.synopsis       || null,
    average_rating: a.averageRating  || null,
    popularity_rank: a.popularityRank || null,
    rating_rank:    a.ratingRank     || null,
    age_rating:     a.ageRating      || null,
    status:         a.status         || null,
    episode_count:  a.episodeCount   || null,
    episode_length: a.episodeLength  || null,
    start_date:     a.startDate      || null,
    end_date:       a.endDate        || null,
    poster_image:   a.posterImage?.large || a.posterImage?.original || null,
    cover_image:    a.coverImage?.large  || a.coverImage?.original  || null,
    subtype:        a.subtype        || null,
    show_type:      a.showType       || null,
  };
}

// ─── AniList images ───────────────────────────────────────────────────────────

async function getAnilistImages(anilistId) {
  if (!anilistId) return null;
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          coverImage { extraLarge large medium color }
          bannerImage
        }
      }
    `;
    const { data } = await axios.post(
      "https://graphql.anilist.co",
      { query, variables: { id: Number(anilistId) } },
      { headers: { "Content-Type": "application/json" }, timeout: 8000 }
    );
    const media = data?.data?.Media;
    if (!media) return null;
    return {
      cover: {
        extra_large: media.coverImage?.extraLarge || null,
        large:       media.coverImage?.large      || null,
        medium:      media.coverImage?.medium     || null,
        color:       media.coverImage?.color      || null,
      },
      banner: media.bannerImage || null,
    };
  } catch { return null; }
}

// ─── TMDB helpers ─────────────────────────────────────────────────────────────

const seasonCache = {};

async function getTmdbSeasonEpisodes(tmdbId, seasonNumber) {
  const key = `${tmdbId}_s${seasonNumber}`;
  if (seasonCache[key]) return seasonCache[key];

  const { data } = await axios.get(
    `${TMDB}/tv/${tmdbId}/season/${seasonNumber}`,
    { params: { api_key: TMDB_KEY }, timeout: 8000 }
  );

  const episodes = (data.episodes || []).map((ep) => ({
    episode_number:     ep.episode_number,
    season_number:      seasonNumber,
    title:              ep.name       || null,
    overview:           ep.overview   || null,
    air_date:           ep.air_date   || null,
    runtime:            ep.runtime    || null,
    thumbnail:          ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}`      : null,
    thumbnail_original: ep.still_path ? `${TMDB_IMG}/original${ep.still_path}` : null,
  }));

  seasonCache[key] = episodes;
  return episodes;
}

async function getTmdbInfo(tmdbId) {
  const { data } = await axios.get(`${TMDB}/tv/${tmdbId}`, {
    params: { api_key: TMDB_KEY },
    timeout: 8000,
  });
  return data;
}

// ─── Check if this TMDB show uses multi-season for a single anime ─────────────

function isSingleAnimeMultiSeason(tmdbId, seasons) {
  const sharedMalIds = Object.entries(animeMap)
    .filter(([, v]) => v.tmdbId === tmdbId)
    .map(([id]) => Number(id));

  return sharedMalIds.length === 1 && seasons.length > 1;
}

// ─── Merge all TMDB seasons into one flat episode list ───────────────────────

async function mergeAllSeasons(tmdbId, seasons, status) {
  const today    = new Date().toISOString().split("T")[0];
  const isAiring = status === "Returning Series" || status === "In Production";

  const batchSize = 5;
  let allEpisodes = [];

  for (let i = 0; i < seasons.length; i += batchSize) {
    const batch   = seasons.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((s) => getTmdbSeasonEpisodes(tmdbId, s.season_number))
    );
    allEpisodes = allEpisodes.concat(results.flat());
  }

  if (isAiring) {
    allEpisodes = allEpisodes.filter((ep) => ep.air_date && ep.air_date <= today);
  }

  return allEpisodes;
}

// ─── Season + offset resolution ───────────────────────────────────────────────

async function resolveEpisodeSlice(tmdbId, malId, tvData) {
  const today   = new Date().toISOString().split("T")[0];
  const status  = tvData.status;
  const seasons = (tvData.seasons || []).filter((s) => s.season_number > 0);

  if (isSingleAnimeMultiSeason(tmdbId, seasons)) {
    const eps = await mergeAllSeasons(tmdbId, seasons, status);
    return { eps, seasonNumber: null, episodeOffset: 0, status, merged: true };
  }

  const sharedMalIds = Object.entries(animeMap)
    .filter(([, v]) => v.tmdbId === tmdbId)
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);

  const myIndex = sharedMalIds.indexOf(Number(malId));

  let seasonNumber;
  let episodeOffset = 0;
  let episodeLimit  = null;

  if (seasons.length === 0) {
    seasonNumber = 1;
  } else if (myIndex < seasons.length) {
    seasonNumber = seasons[myIndex].season_number;
  } else {
    const lastSeasonIndex = seasons.length - 1;
    seasonNumber          = seasons[lastSeasonIndex].season_number;

    const overflowIndex  = myIndex - lastSeasonIndex;
    const overflowMalIds = sharedMalIds.slice(lastSeasonIndex);
    const lastSeasonEps  = await getTmdbSeasonEpisodes(tmdbId, seasonNumber);

    let offset = 0;
    for (let i = 0; i < overflowIndex; i++) {
      const remaining = lastSeasonEps.length - offset;
      const parts     = overflowMalIds.length - i;
      offset += Math.ceil(remaining / parts);
    }

    episodeOffset = offset;

    const remainingParts = overflowMalIds.length - overflowIndex - 1;
    if (remainingParts > 0) {
      const remaining = lastSeasonEps.length - offset;
      episodeLimit    = Math.ceil(remaining / (remainingParts + 1));
    }
  }

  const allEps   = await getTmdbSeasonEpisodes(tmdbId, seasonNumber);
  const isAiring = status === "Returning Series" || status === "In Production";

  let eps = isAiring
    ? allEps.filter((ep) => ep.air_date && ep.air_date <= today)
    : allEps;

  eps = eps.slice(episodeOffset);
  if (episodeLimit !== null) eps = eps.slice(0, episodeLimit);

  return { eps, seasonNumber, episodeOffset, status, merged: false };
}

// ─── Core ─────────────────────────────────────────────────────────────────────

async function getAnimeInfo(malId) {
  const map   = await loadAnimeMap();
  const entry = map[Number(malId)];
  if (!entry) throw new Error(`No mapping found for MAL ID ${malId}`);

  const { tmdbId, tmdbMovie, anilistId, kitsuId, type } = entry;

  if (type === "MOVIE" && tmdbMovie) {
    const [tmdbRes, anilistImages] = await Promise.all([
      axios.get(`${TMDB}/movie/${tmdbMovie}`, { params: { api_key: TMDB_KEY }, timeout: 8000 }),
      getAnilistImages(anilistId),
    ]);
    const d = tmdbRes.data;
    return {
      title: d.title, status: "Movie", total: 1,
      tmdbId: tmdbMovie, anilistId, kitsuId, mediaType: "movie",
      seasonNumber: null, episodeOffset: 0, resolvedEps: [],
      allSeasons: null, merged: false,
      images: {
        tmdb: {
          poster:            d.poster_path   ? `${TMDB_IMG}/w500${d.poster_path}`       : null,
          backdrop:          d.backdrop_path ? `${TMDB_IMG}/w1280${d.backdrop_path}`     : null,
          poster_original:   d.poster_path   ? `${TMDB_IMG}/original${d.poster_path}`   : null,
          backdrop_original: d.backdrop_path ? `${TMDB_IMG}/original${d.backdrop_path}` : null,
        },
        anilist: anilistImages,
      },
    };
  }

  if (!tmdbId) throw new Error(`No TMDB TV ID found for MAL ID ${malId}`);

  const [tvData, anilistImages] = await Promise.all([
    getTmdbInfo(tmdbId),
    getAnilistImages(anilistId),
  ]);

  const { eps, seasonNumber, episodeOffset, status, merged } =
    await resolveEpisodeSlice(tmdbId, malId, tvData);

  const seasons = (tvData.seasons || []).filter((s) => s.season_number > 0);

  return {
    title:        tvData.name,
    status,
    total:        eps.length,
    tmdbId,
    anilistId,
    kitsuId,
    mediaType:    "tv",
    seasonNumber,
    episodeOffset,
    merged,
    resolvedEps:  eps,
    allSeasons:   seasons.map((s) => ({
      season_number: s.season_number,
      name:          s.name,
      episode_count: s.episode_count,
      air_date:      s.air_date,
    })),
    images: {
      tmdb: {
        poster:            tvData.poster_path   ? `${TMDB_IMG}/w500${tvData.poster_path}`       : null,
        backdrop:          tvData.backdrop_path ? `${TMDB_IMG}/w1280${tvData.backdrop_path}`     : null,
        poster_original:   tvData.poster_path   ? `${TMDB_IMG}/original${tvData.poster_path}`   : null,
        backdrop_original: tvData.backdrop_path ? `${TMDB_IMG}/original${tvData.backdrop_path}` : null,
      },
      anilist: anilistImages,
    },
  };
}

function buildEpisodes(malId, resolvedEps, color, autoplay) {
  return resolvedEps.map((tmdb, idx) => {
    const epNum = idx + 1;
    const params = new URLSearchParams();
    if (autoplay) params.set("autoplay", "true");
    if (color)    params.set("color", color);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return {
      episode:            epNum,
      tmdb_episode:       tmdb.episode_number,
      tmdb_season:        tmdb.season_number || null,
      title:              tmdb.title              || `Episode ${epNum}`,
      overview:           tmdb.overview           || null,
      air_date:           tmdb.air_date           || null,
      runtime:            tmdb.runtime            || null,
      thumbnail:          tmdb.thumbnail          || null,
      thumbnail_original: tmdb.thumbnail_original || null,
      embed_sub:          `${YENIME}/${malId}/${epNum}${qs}`,
      embed_dub:          `${YENIME}/${malId}/${epNum}?audio=dub${color ? `&color=${color}` : ""}`,
      iframe:             `<iframe src="${YENIME}/${malId}/${epNum}${qs}" width="100%" height="500" frameborder="0" allowfullscreen></iframe>`,
    };
  });
}

// ─── ID Resolvers ─────────────────────────────────────────────────────────────

async function resolveMalFromAnilist(anilistId) {
  await loadAnimeMap();
  const malId = anilistToMal[Number(anilistId)];
  if (!malId) throw new Error(`No MAL ID found for AniList ID ${anilistId}`);
  return malId;
}

async function resolveMalFromKitsu(kitsuId) {
  await loadAnimeMap();
  const malId = kitsuToMal[Number(kitsuId)];
  if (!malId) throw new Error(`No MAL ID found for Kitsu ID ${kitsuId}`);
  return malId;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  return res.json({
    name:     "Yenime Anime API",
    version:  "1.1.0",
    base_url: base,
    endpoints: {
      by_mal_id: {
        info:     { method: "GET", url: `${base}/anime/:malId`,                    description: "Get anime info by MAL ID",           example: `${base}/anime/21` },
        episodes: { method: "GET", url: `${base}/anime/:malId/episodes`,           description: "Get all episodes by MAL ID",          example: `${base}/anime/21/episodes` },
        watch:    { method: "GET", url: `${base}/anime/:malId/watch/:epNum`,       description: "Get a single episode by MAL ID",      example: `${base}/anime/21/watch/1` },
        info_p:     { method: "GET", url: `${base}/anime/mal/:malId`,              description: "Alias: info by MAL ID",               example: `${base}/anime/mal/21` },
        episodes_p: { method: "GET", url: `${base}/anime/mal/:malId/episodes`,     description: "Alias: episodes by MAL ID",           example: `${base}/anime/mal/21/episodes` },
        watch_p:    { method: "GET", url: `${base}/anime/mal/:malId/watch/:epNum`, description: "Alias: watch by MAL ID",              example: `${base}/anime/mal/21/watch/1` },
        search:   { method: "GET", url: `${base}/anime/mal/search`,                description: "Search anime on MAL",                 example: `${base}/anime/mal/search?q=one+piece&limit=10` },
        ranking:  { method: "GET", url: `${base}/anime/mal/ranking`,               description: "Get MAL anime rankings",              example: `${base}/anime/mal/ranking?ranking_type=all&limit=20` },
        season:   { method: "GET", url: `${base}/anime/mal/season/:year/:season`,  description: "Get seasonal anime from MAL",         example: `${base}/anime/mal/season/2024/winter` },
        query_params: { autoplay: "true | false", color: "hex without # (e.g. e74c3c)" },
      },
      by_anilist_id: {
        info:     { method: "GET", url: `${base}/anime/anilist/:anilistId`,              description: "Get anime info by AniList ID",        example: `${base}/anime/anilist/21` },
        episodes: { method: "GET", url: `${base}/anime/anilist/:anilistId/episodes`,     description: "Get all episodes by AniList ID",      example: `${base}/anime/anilist/21/episodes` },
        watch:    { method: "GET", url: `${base}/anime/anilist/:anilistId/watch/:epNum`, description: "Get a single episode by AniList ID",  example: `${base}/anime/anilist/21/watch/1` },
      },
      by_kitsu_id: {
        info:     { method: "GET", url: `${base}/anime/kitsu/:kitsuId`,              description: "Get anime info by Kitsu ID",          example: `${base}/anime/kitsu/12` },
        episodes: { method: "GET", url: `${base}/anime/kitsu/:kitsuId/episodes`,     description: "Get all episodes by Kitsu ID",        example: `${base}/anime/kitsu/12/episodes` },
        watch:    { method: "GET", url: `${base}/anime/kitsu/:kitsuId/watch/:epNum`, description: "Get a single episode by Kitsu ID",    example: `${base}/anime/kitsu/12/watch/1` },
        search:   { method: "GET", url: `${base}/anime/kitsu/search`,                description: "Search anime on Kitsu",               example: `${base}/anime/kitsu/search?q=one+piece&limit=10` },
        trending: { method: "GET", url: `${base}/anime/kitsu/trending`,              description: "Get trending anime from Kitsu",       example: `${base}/anime/kitsu/trending?limit=10` },
      },
    },
    mal_search_params: {
      q:      "Search query (required)",
      limit:  "Number of results, default 10, max 100",
      offset: "Pagination offset, default 0",
      fields: "Comma-separated MAL fields (optional, defaults to standard set)",
    },
    mal_ranking_types: ["all", "airing", "upcoming", "tv", "ova", "movie", "special", "bypopularity", "favorite"],
    mal_seasons:       ["winter", "spring", "summer", "fall"],
    kitsu_search_params: {
      q:      "Search query (required)",
      limit:  "Number of results, default 10, max 20",
      offset: "Pagination offset, default 0",
    },
    example_anime: {
      one_piece:         { mal_id: 21,    anilist_id: 21,     kitsu_id: 12,    info: `${base}/anime/21`,    episodes: `${base}/anime/21/episodes`,    watch_ep1: `${base}/anime/21/watch/1` },
      frieren:           { mal_id: 52991, anilist_id: 154587, kitsu_id: 47194, info: `${base}/anime/52991`, episodes: `${base}/anime/52991/episodes`, watch_ep1: `${base}/anime/52991/watch/1` },
      bleach_original:   { mal_id: 269,   anilist_id: 269,    kitsu_id: 41,    info: `${base}/anime/269`,   episodes: `${base}/anime/269/episodes`,   watch_ep1: `${base}/anime/269/watch/1` },
      bleach_tybw_part1: { mal_id: 56784, anilist_id: 169755, kitsu_id: null,  info: `${base}/anime/56784`, episodes: `${base}/anime/56784/episodes`, watch_ep1: `${base}/anime/56784/watch/1` },
      bleach_tybw_part2: { mal_id: 60636, anilist_id: 185874, kitsu_id: null,  info: `${base}/anime/60636`, episodes: `${base}/anime/60636/episodes`, watch_ep1: `${base}/anime/60636/watch/1` },
    },
  });
});

// ─── Shared route handlers ─────────────────────────────────────────────────────

async function handleInfo(malId, res) {
  try {
    const { title, status, total, tmdbId, anilistId, kitsuId, mediaType, seasonNumber, merged, allSeasons, images } =
      await getAnimeInfo(malId);
    return res.json({
      mal_id:      Number(malId),
      anilist_id:  anilistId,
      kitsu_id:    kitsuId,
      tmdb_id:     tmdbId,
      title,
      status,
      media_type:  mediaType,
      tmdb_season: merged ? "all" : seasonNumber,
      all_seasons: allSeasons,
      total,
      images,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch anime info", message: err.message, mal_id: Number(malId) });
  }
}

async function handleEpisodes(malId, color, autoplay, res) {
  try {
    const { title, status, total, tmdbId, anilistId, kitsuId, mediaType, seasonNumber, merged, allSeasons, resolvedEps, images } =
      await getAnimeInfo(malId);

    if (!total || total < 1) {
      return res.status(404).json({ error: "No episodes available yet.", mal_id: Number(malId), title, status });
    }

    return res.json({
      mal_id:      Number(malId),
      anilist_id:  anilistId,
      kitsu_id:    kitsuId,
      tmdb_id:     tmdbId,
      title,
      status,
      media_type:  mediaType,
      tmdb_season: merged ? "all" : seasonNumber,
      all_seasons: allSeasons,
      total,
      images,
      episodes: buildEpisodes(malId, resolvedEps, color, autoplay),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch episodes", message: err.message, mal_id: Number(malId) });
  }
}

async function handleWatch(malId, epNum, color, autoplay, startAt, res) {
  try {
    const { title, tmdbId, anilistId, kitsuId, resolvedEps, images } = await getAnimeInfo(malId);

    const idx  = Number(epNum) - 1;
    const tmdb = resolvedEps[idx] || {};

    const params = new URLSearchParams();
    if (autoplay) params.set("autoplay", "true");
    if (color)    params.set("color", color);
    if (startAt)  params.set("startAt", startAt);
    const qs       = params.toString() ? `?${params.toString()}` : "";
    const embedUrl = `${YENIME}/${malId}/${epNum}${qs}`;

    return res.json({
      mal_id:             Number(malId),
      anilist_id:         anilistId,
      kitsu_id:           kitsuId,
      tmdb_id:            tmdbId,
      title,
      episode:            Number(epNum),
      tmdb_episode:       tmdb.episode_number     || null,
      tmdb_season:        tmdb.season_number      || null,
      episode_title:      tmdb.title              || `Episode ${epNum}`,
      overview:           tmdb.overview           || null,
      air_date:           tmdb.air_date           || null,
      runtime:            tmdb.runtime            || null,
      thumbnail:          tmdb.thumbnail          || null,
      thumbnail_original: tmdb.thumbnail_original || null,
      embed_sub:          embedUrl,
      embed_dub:          `${YENIME}/${malId}/${epNum}?audio=dub${color ? `&color=${color}` : ""}`,
      iframe:             `<iframe src="${embedUrl}" width="100%" height="500" frameborder="0" allowfullscreen></iframe>`,
      images,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch episode", message: err.message, mal_id: Number(malId), episode: Number(epNum) });
  }
}

// ─── MAL Search ───────────────────────────────────────────────────────────────
// GET /anime/mal/search?q=...&limit=10&offset=0

app.get("/anime/mal/search", async (req, res) => {
  const { q, limit = 10, offset = 0, fields } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Missing required query parameter: q" });
  }
  try {
    await loadAnimeMap();
    const data = await malGet("/anime", {
      q,
      limit:  Math.min(Number(limit), 100),
      offset: Number(offset),
      fields: fields || MAL_ANIME_FIELDS,
    });

    const results = (data.data || []).map((item) => {
      const anime    = formatMalAnime(item.node);
      const mapEntry = animeMap[anime.mal_id] || {};
      return {
        ...anime,
        anilist_id: mapEntry.anilistId || null,
        kitsu_id:   mapEntry.kitsuId   || null,
      };
    });

    return res.json({
      query:   q,
      limit:   Number(limit),
      offset:  Number(offset),
      total:   results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to search MAL", message: err.message });
  }
});

// ─── MAL Ranking ──────────────────────────────────────────────────────────────
// GET /anime/mal/ranking?ranking_type=all&limit=20&offset=0

app.get("/anime/mal/ranking", async (req, res) => {
  const { ranking_type = "all", limit = 20, offset = 0, fields } = req.query;

  const validTypes = ["all", "airing", "upcoming", "tv", "ova", "movie", "special", "bypopularity", "favorite"];
  if (!validTypes.includes(ranking_type)) {
    return res.status(400).json({
      error:        "Invalid ranking_type",
      valid_types:  validTypes,
      received:     ranking_type,
    });
  }

  try {
    await loadAnimeMap();
    const data = await malGet("/anime/ranking", {
      ranking_type,
      limit:  Math.min(Number(limit), 500),
      offset: Number(offset),
      fields: fields || MAL_ANIME_FIELDS,
    });

    const results = (data.data || []).map((item) => {
      const anime    = formatMalAnime(item.node);
      const mapEntry = animeMap[anime.mal_id] || {};
      return {
        rank:       item.ranking?.rank || null,
        ...anime,
        anilist_id: mapEntry.anilistId || null,
        kitsu_id:   mapEntry.kitsuId   || null,
      };
    });

    return res.json({
      ranking_type,
      limit:   Number(limit),
      offset:  Number(offset),
      total:   results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch MAL ranking", message: err.message });
  }
});

// ─── MAL Season ───────────────────────────────────────────────────────────────
// GET /anime/mal/season/:year/:season?limit=20&offset=0&sort=anime_score

app.get("/anime/mal/season/:year/:season", async (req, res) => {
  const { year, season } = req.params;
  const { limit = 20, offset = 0, sort = "anime_score", fields } = req.query;

  const validSeasons = ["winter", "spring", "summer", "fall"];
  if (!validSeasons.includes(season.toLowerCase())) {
    return res.status(400).json({
      error:          "Invalid season",
      valid_seasons:  validSeasons,
      received:       season,
    });
  }

  const parsedYear = parseInt(year, 10);
  if (isNaN(parsedYear) || parsedYear < 1917 || parsedYear > 2100) {
    return res.status(400).json({ error: "Invalid year", received: year });
  }

  try {
    await loadAnimeMap();
    const data = await malGet(`/anime/season/${parsedYear}/${season.toLowerCase()}`, {
      limit:  Math.min(Number(limit), 500),
      offset: Number(offset),
      sort,
      fields: fields || MAL_ANIME_FIELDS,
    });

    const results = (data.data || []).map((item) => {
      const anime    = formatMalAnime(item.node);
      const mapEntry = animeMap[anime.mal_id] || {};
      return {
        ...anime,
        anilist_id: mapEntry.anilistId || null,
        kitsu_id:   mapEntry.kitsuId   || null,
      };
    });

    return res.json({
      year:    parsedYear,
      season:  season.toLowerCase(),
      sort,
      limit:   Number(limit),
      offset:  Number(offset),
      total:   results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch MAL seasonal anime", message: err.message });
  }
});

// ─── Kitsu Search ─────────────────────────────────────────────────────────────
// GET /anime/kitsu/search?q=...&limit=10&offset=0

app.get("/anime/kitsu/search", async (req, res) => {
  const { q, limit = 10, offset = 0 } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Missing required query parameter: q" });
  }
  try {
    await loadAnimeMap();
    const { data } = await axios.get(`${KITSU}/anime`, {
      params: {
        "filter[text]":  q,
        "page[limit]":   Math.min(Number(limit), 20),
        "page[offset]":  Number(offset),
        "fields[anime]": "canonicalTitle,titles,synopsis,averageRating,popularityRank,ratingRank,ageRating,status,episodeCount,episodeLength,startDate,endDate,posterImage,coverImage,subtype,showType",
      },
      timeout: 10000,
    });

    const results = (data.data || []).map((item) => {
      const anime    = formatKitsuAnime(item);
      const malId    = kitsuToMal[Number(anime.kitsu_id)] || null;
      const mapEntry = malId ? (animeMap[malId] || {}) : {};
      return {
        ...anime,
        mal_id:     malId                  || null,
        anilist_id: mapEntry.anilistId     || null,
      };
    });

    return res.json({
      query:  q,
      limit:  Number(limit),
      offset: Number(offset),
      total:  data.meta?.count || results.length,
      paging: data.links || null,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to search Kitsu", message: err.message });
  }
});

// ─── Kitsu Trending ───────────────────────────────────────────────────────────
// GET /anime/kitsu/trending?limit=10

app.get("/anime/kitsu/trending", async (req, res) => {
  const { limit = 10 } = req.query;
  try {
    await loadAnimeMap();
    const { data } = await axios.get(`${KITSU}/trending/anime`, {
      params: {
        "page[limit]":   Math.min(Number(limit), 20),
        "fields[anime]": "canonicalTitle,titles,synopsis,averageRating,popularityRank,ratingRank,ageRating,status,episodeCount,episodeLength,startDate,endDate,posterImage,coverImage,subtype,showType",
      },
      timeout: 10000,
    });

    const results = (data.data || []).map((item) => {
      const anime    = formatKitsuAnime(item);
      const malId    = kitsuToMal[Number(anime.kitsu_id)] || null;
      const mapEntry = malId ? (animeMap[malId] || {}) : {};
      return {
        ...anime,
        mal_id:     malId              || null,
        anilist_id: mapEntry.anilistId || null,
      };
    });

    return res.json({
      limit:   Number(limit),
      total:   results.length,
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch Kitsu trending", message: err.message });
  }
});

// ─── MAL Routes (original + /anime/mal/ prefix) ───────────────────────────────

app.get("/anime/mal/:malId",                 (req, res) => handleInfo(req.params.malId, res));
app.get("/anime/mal/:malId/episodes",        (req, res) => handleEpisodes(req.params.malId, req.query.color || null, req.query.autoplay || false, res));
app.get("/anime/mal/:malId/watch/:epNum",    (req, res) => handleWatch(req.params.malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res));

// Keep original /:malId routes for backward compatibility
app.get("/anime/:malId",                     (req, res) => handleInfo(req.params.malId, res));
app.get("/anime/:malId/episodes",            (req, res) => handleEpisodes(req.params.malId, req.query.color || null, req.query.autoplay || false, res));
app.get("/anime/:malId/watch/:epNum",        (req, res) => handleWatch(req.params.malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res));

// ─── AniList Routes (/anime/anilist/ prefix) ──────────────────────────────────

app.get("/anime/anilist/:anilistId", async (req, res) => {
  try {
    const malId = await resolveMalFromAnilist(req.params.anilistId);
    return handleInfo(malId, res);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(req.params.anilistId) });
  }
});

app.get("/anime/anilist/:anilistId/episodes", async (req, res) => {
  try {
    const malId = await resolveMalFromAnilist(req.params.anilistId);
    return handleEpisodes(malId, req.query.color || null, req.query.autoplay || false, res);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(req.params.anilistId) });
  }
});

app.get("/anime/anilist/:anilistId/watch/:epNum", async (req, res) => {
  try {
    const malId = await resolveMalFromAnilist(req.params.anilistId);
    return handleWatch(malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(req.params.anilistId) });
  }
});

// ─── Kitsu Routes (/anime/kitsu/ prefix) ─────────────────────────────────────

app.get("/anime/kitsu/:kitsuId", async (req, res) => {
  try {
    const malId = await resolveMalFromKitsu(req.params.kitsuId);
    return handleInfo(malId, res);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve Kitsu ID", message: err.message, kitsu_id: Number(req.params.kitsuId) });
  }
});

app.get("/anime/kitsu/:kitsuId/episodes", async (req, res) => {
  try {
    const malId = await resolveMalFromKitsu(req.params.kitsuId);
    return handleEpisodes(malId, req.query.color || null, req.query.autoplay || false, res);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve Kitsu ID", message: err.message, kitsu_id: Number(req.params.kitsuId) });
  }
});

app.get("/anime/kitsu/:kitsuId/watch/:epNum", async (req, res) => {
  try {
    const malId = await resolveMalFromKitsu(req.params.kitsuId);
    return handleWatch(malId, req.params.epNum, req.query.color || null, req.query.autoplay || false, req.query.startAt || null, res);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve Kitsu ID", message: err.message, kitsu_id: Number(req.params.kitsuId) });
  }
});

// ─── Legacy /anilist/ top-level routes (backward compat) ─────────────────────

app.get("/anilist/:anilistId", async (req, res) => {
  const { anilistId } = req.params;
  try {
    const malId = await resolveMalFromAnilist(anilistId);
    return res.redirect(307, `/anime/${malId}?${new URLSearchParams(req.query)}`);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(anilistId) });
  }
});

app.get("/anilist/:anilistId/episodes", async (req, res) => {
  const { anilistId } = req.params;
  try {
    const malId = await resolveMalFromAnilist(anilistId);
    return res.redirect(307, `/anime/${malId}/episodes?${new URLSearchParams(req.query)}`);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(anilistId) });
  }
});

app.get("/anilist/:anilistId/watch/:epNum", async (req, res) => {
  const { anilistId, epNum } = req.params;
  try {
    const malId = await resolveMalFromAnilist(anilistId);
    return res.redirect(307, `/anime/${malId}/watch/${epNum}?${new URLSearchParams(req.query)}`);
  } catch (err) {
    return res.status(404).json({ error: "Failed to resolve AniList ID", message: err.message, anilist_id: Number(anilistId), episode: Number(epNum) });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);
  try { await loadAnimeMap(); } catch (err) { console.error("Failed to preload anime map:", err.message); }
});