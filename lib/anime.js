const axios = require("axios");

const YENIME = "https://api.yenime.net/anime";

const TMDB_KEY = "699be86b7a4ca2c8bc77525cb4938dc0";
const TMDB     = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

const MAL_CLIENT_ID = "03e9d1380f35c65bdbe6486ef3da8458";
const MAL           = "https://api.myanimelist.net/v2";
const MAL_HEADERS   = { "X-MAL-CLIENT-ID": MAL_CLIENT_ID };

const KITSU = "https://kitsu.app/api/edge";

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

function getAnimeMap()     { return animeMap; }
function getAnilistToMal() { return anilistToMal; }
function getKitsuToMal()   { return kitsuToMal; }

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

// ─── MAL API helpers ──────────────────────────────────────────────────────────

const MAL_ANIME_FIELDS = [
  "id", "title", "main_picture", "alternative_titles", "start_date", "end_date",
  "synopsis", "mean", "rank", "popularity", "num_list_users", "num_scoring_users",
  "nsfw", "created_at", "updated_at", "media_type", "status", "genres",
  "num_episodes", "start_season", "broadcast", "source", "average_episode_duration",
  "rating", "pictures", "background", "related_anime", "studios",
].join(",");

const MAL_DETAIL_FIELDS = [
  "id", "title", "main_picture", "alternative_titles", "start_date", "end_date",
  "synopsis", "mean", "rank", "popularity", "num_list_users", "num_scoring_users",
  "nsfw", "media_type", "status", "genres", "num_episodes", "start_season",
  "broadcast", "source", "average_episode_duration", "rating", "studios",
  "related_anime",
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
    mal_id:             node.id,
    title:              node.title,
    image:              node.main_picture?.large  || node.main_picture?.medium || null,
    image_medium:       node.main_picture?.medium || null,
    alternative_titles: node.alternative_titles   || null,
    synopsis:           node.synopsis             || null,
    mean_score:         node.mean                 || null,
    rank:               node.rank                 || null,
    popularity:         node.popularity           || null,
    num_episodes:       node.num_episodes         || null,
    status:             node.status               || null,
    media_type:         node.media_type           || null,
    genres:             (node.genres  || []).map((g) => g.name),
    start_date:         node.start_date           || null,
    end_date:           node.end_date             || null,
    start_season:       node.start_season         || null,
    source:             node.source               || null,
    rating:             node.rating               || null,
    studios:            (node.studios || []).map((s) => s.name),
    average_episode_duration: node.average_episode_duration || null,
  };
}

// ─── Kitsu API helpers ────────────────────────────────────────────────────────

function formatKitsuAnime(item) {
  if (!item) return null;
  const a = item.attributes || {};
  return {
    kitsu_id:        item.id,
    title:           a.canonicalTitle || a.titles?.en || null,
    titles:          a.titles         || null,
    synopsis:        a.synopsis       || null,
    average_rating:  a.averageRating  || null,
    popularity_rank: a.popularityRank || null,
    rating_rank:     a.ratingRank     || null,
    age_rating:      a.ageRating      || null,
    status:          a.status         || null,
    episode_count:   a.episodeCount   || null,
    episode_length:  a.episodeLength  || null,
    start_date:      a.startDate      || null,
    end_date:        a.endDate        || null,
    poster_image:    a.posterImage?.large || a.posterImage?.original || null,
    cover_image:     a.coverImage?.large  || a.coverImage?.original  || null,
    subtype:         a.subtype        || null,
    show_type:       a.showType       || null,
  };
}

// ─── Cross-platform image fetchers ────────────────────────────────────────────

async function getMalImages(malId) {
  if (!malId) return null;
  try {
    const { data } = await axios.get(`${MAL}/anime/${malId}`, {
      headers: MAL_HEADERS,
      params:  { fields: "main_picture" },
      timeout: 8000,
    });
    return {
      image:        data.main_picture?.large  || data.main_picture?.medium || null,
      image_medium: data.main_picture?.medium || null,
    };
  } catch { return null; }
}

async function getKitsuImages(kitsuId) {
  if (!kitsuId) return null;
  try {
    const { data } = await axios.get(`${KITSU}/anime/${kitsuId}`, {
      params:  { "fields[anime]": "posterImage,coverImage" },
      timeout: 8000,
    });
    const a = data?.data?.attributes || {};
    return {
      poster_image: a.posterImage?.large || a.posterImage?.original || null,
      cover_image:  a.coverImage?.large  || a.coverImage?.original  || null,
    };
  } catch { return null; }
}

async function getTmdbImages(mapEntry) {
  if (!mapEntry) return null;
  const tmdbId    = mapEntry.tmdbId    || null;
  const tmdbMovie = mapEntry.tmdbMovie || null;
  try {
    if (tmdbId) {
      const { data } = await axios.get(`${TMDB}/tv/${tmdbId}`, {
        params: { api_key: TMDB_KEY },
        timeout: 8000,
      });
      return {
        poster:            data.poster_path   ? `${TMDB_IMG}/w500${data.poster_path}`       : null,
        backdrop:          data.backdrop_path ? `${TMDB_IMG}/w1280${data.backdrop_path}`     : null,
        poster_original:   data.poster_path   ? `${TMDB_IMG}/original${data.poster_path}`   : null,
        backdrop_original: data.backdrop_path ? `${TMDB_IMG}/original${data.backdrop_path}` : null,
      };
    }
    if (tmdbMovie) {
      const { data } = await axios.get(`${TMDB}/movie/${tmdbMovie}`, {
        params: { api_key: TMDB_KEY },
        timeout: 8000,
      });
      return {
        poster:            data.poster_path   ? `${TMDB_IMG}/w500${data.poster_path}`       : null,
        backdrop:          data.backdrop_path ? `${TMDB_IMG}/w1280${data.backdrop_path}`     : null,
        poster_original:   data.poster_path   ? `${TMDB_IMG}/original${data.poster_path}`   : null,
        backdrop_original: data.backdrop_path ? `${TMDB_IMG}/original${data.backdrop_path}` : null,
      };
    }
  } catch { return null; }
  return null;
}

// ─── MAL detail fetcher ───────────────────────────────────────────────────────

async function getMalDetail(malId) {
  if (!malId) return null;
  try {
    const data = await malGet(`/anime/${malId}`, { fields: MAL_DETAIL_FIELDS });
    const synopsis = data.synopsis || null;
    const related_entries = (data.related_anime || []).map((r) => ({
      mal_id:                  r.node?.id          || null,
      title:                   r.node?.title       || null,
      image:                   r.node?.main_picture?.large || r.node?.main_picture?.medium || null,
      media_type:              r.node?.media_type  || null,
      relation_type:           r.relation_type     || null,
      relation_type_formatted: r.relation_type_formatted || null,
    }));
    return { synopsis, related_entries };
  } catch { return null; }
}

// ─── AniList detail fetcher ───────────────────────────────────────────────────

async function getAnilistDetail(anilistId) {
  if (!anilistId) return null;
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          coverImage { extraLarge large medium color }
          bannerImage
          relations {
            edges {
              relationType(version: 2)
              node {
                id
                title { romaji english native }
                type
                format
                status
                coverImage { large medium }
              }
            }
          }
          characters(sort: [ROLE, RELEVANCE], perPage: 25) {
            edges {
              role
              node {
                id
                name { full native }
                image { large medium }
              }
              voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
                id
                name { full native }
                image { large medium }
                languageV2
              }
            }
          }
        }
      }
    `;
    const { data } = await axios.post(
      "https://graphql.anilist.co",
      { query, variables: { id: Number(anilistId) } },
      { headers: { "Content-Type": "application/json" }, timeout: 10000 }
    );
    const media = data?.data?.Media;
    if (!media) return null;

    const images = {
      cover: {
        extra_large: media.coverImage?.extraLarge || null,
        large:       media.coverImage?.large      || null,
        medium:      media.coverImage?.medium     || null,
        color:       media.coverImage?.color      || null,
      },
      banner: media.bannerImage || null,
    };

    const related_entries = (media.relations?.edges || []).map((edge) => ({
      anilist_id:    edge.node?.id                              || null,
      title_romaji:  edge.node?.title?.romaji                   || null,
      title_english: edge.node?.title?.english                  || null,
      title_native:  edge.node?.title?.native                   || null,
      type:          edge.node?.type                            || null,
      format:        edge.node?.format                          || null,
      status:        edge.node?.status                          || null,
      relation_type: edge.relationType                          || null,
      image:         edge.node?.coverImage?.large || edge.node?.coverImage?.medium || null,
    }));

    const characters = (media.characters?.edges || []).map((edge) => ({
      id:           edge.node?.id           || null,
      name:         edge.node?.name?.full   || null,
      name_native:  edge.node?.name?.native || null,
      role:         edge.role               || null,
      image:        edge.node?.image?.large || edge.node?.image?.medium || null,
      voice_actors: (edge.voiceActors || []).map((va) => ({
        id:          va.id               || null,
        name:        va.name?.full       || null,
        name_native: va.name?.native     || null,
        language:    va.languageV2       || null,
        image:       va.image?.large || va.image?.medium || null,
      })),
    }));

    return { images, related_entries, characters };
  } catch { return null; }
}

// ─── TMDB season helpers ──────────────────────────────────────────────────────

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
    title:              ep.name     || null,
    overview:           ep.overview || null,
    air_date:           ep.air_date || null,
    runtime:            ep.runtime  || null,
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

function isSingleAnimeMultiSeason(tmdbId, seasons) {
  const sharedMalIds = Object.entries(animeMap)
    .filter(([, v]) => v.tmdbId === tmdbId)
    .map(([id]) => Number(id));
  return sharedMalIds.length === 1 && seasons.length > 1;
}

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
  if (isAiring) allEpisodes = allEpisodes.filter((ep) => ep.air_date && ep.air_date <= today);
  return allEpisodes;
}

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
    const overflowIndex   = myIndex - lastSeasonIndex;
    const overflowMalIds  = sharedMalIds.slice(lastSeasonIndex);
    const lastSeasonEps   = await getTmdbSeasonEpisodes(tmdbId, seasonNumber);
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

// ─── Core getAnimeInfo ────────────────────────────────────────────────────────

async function getAnimeInfo(malId) {
  const map   = await loadAnimeMap();
  const entry = map[Number(malId)];
  if (!entry) throw new Error(`No mapping found for MAL ID ${malId}`);

  const { tmdbId, tmdbMovie, anilistId, kitsuId, type } = entry;

  const [kitsuImages, malImages, malDetail, anilistDetail] = await Promise.all([
    getKitsuImages(kitsuId),
    getMalImages(Number(malId)),
    getMalDetail(Number(malId)),
    getAnilistDetail(anilistId),
  ]);

  const synopsis        = malDetail?.synopsis            || null;
  const related_entries = malDetail?.related_entries     || null;
  const anilist_related = anilistDetail?.related_entries || null;
  const characters      = anilistDetail?.characters      || null;
  const anilistImages   = anilistDetail?.images          || null;

  if (type === "MOVIE" && tmdbMovie) {
    const tmdbRes = await axios.get(
      `${TMDB}/movie/${tmdbMovie}`,
      { params: { api_key: TMDB_KEY }, timeout: 8000 }
    );
    const d = tmdbRes.data;
    return {
      title: d.title, status: "Movie", total: 1,
      tmdbId: tmdbMovie, anilistId, kitsuId, mediaType: "movie",
      seasonNumber: null, episodeOffset: 0, resolvedEps: [], allSeasons: null, merged: false,
      image: malImages?.image || null, image_medium: malImages?.image_medium || null,
      poster_image: kitsuImages?.poster_image || null, cover_image: kitsuImages?.cover_image || null,
      synopsis, related_entries, anilist_related, characters,
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

  const tvData = await getTmdbInfo(tmdbId);
  const { eps, seasonNumber, episodeOffset, status, merged } =
    await resolveEpisodeSlice(tmdbId, malId, tvData);
  const seasons = (tvData.seasons || []).filter((s) => s.season_number > 0);

  return {
    title: tvData.name, status, total: eps.length,
    tmdbId, anilistId, kitsuId, mediaType: "tv",
    seasonNumber, episodeOffset, merged,
    resolvedEps: eps,
    allSeasons: seasons.map((s) => ({
      season_number: s.season_number,
      name:          s.name,
      episode_count: s.episode_count,
      air_date:      s.air_date,
    })),
    image: malImages?.image || null, image_medium: malImages?.image_medium || null,
    poster_image: kitsuImages?.poster_image || null, cover_image: kitsuImages?.cover_image || null,
    synopsis, related_entries, anilist_related, characters,
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

// ─── Episode builder ──────────────────────────────────────────────────────────

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

// ─── Shared route handlers ────────────────────────────────────────────────────

async function handleInfo(malId, color, autoplay, res) {
  try {
    const {
      title, status, total, tmdbId, anilistId, kitsuId, mediaType,
      seasonNumber, merged, allSeasons, resolvedEps,
      image, image_medium, poster_image, cover_image,
      synopsis, related_entries, anilist_related, characters,
      images,
    } = await getAnimeInfo(malId);

    return res.json({
      mal_id:         Number(malId),
      anilist_id:     anilistId,
      kitsu_id:       kitsuId,
      tmdb_id:        tmdbId,
      title,
      status,
      media_type:     mediaType,
      tmdb_season:    merged ? "all" : seasonNumber,
      all_seasons:    allSeasons,
      total,
      image,
      image_medium,
      poster_image,
      cover_image,
      synopsis,
      images,
      related_entries,
      anilist_related,
      characters,
      episodes: buildEpisodes(malId, resolvedEps, color, autoplay),
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch anime info", message: err.message, mal_id: Number(malId) });
  }
}

async function handleWatch(malId, epNum, color, autoplay, startAt, res) {
  try {
    const {
      title, tmdbId, anilistId, kitsuId, resolvedEps,
      image, image_medium, poster_image, cover_image,
      images,
    } = await getAnimeInfo(malId);

    const idx      = Number(epNum) - 1;
    const tmdb     = resolvedEps[idx] || {};
    const params   = new URLSearchParams();
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
      image,
      image_medium,
      poster_image,
      cover_image,
      images,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch episode", message: err.message, mal_id: Number(malId), episode: Number(epNum) });
  }
}

module.exports = {
  loadAnimeMap,
  getAnimeMap,
  getAnilistToMal,
  getKitsuToMal,
  resolveMalFromAnilist,
  resolveMalFromKitsu,
  malGet,
  formatMalAnime,
  formatKitsuAnime,
  getMalImages,
  getKitsuImages,
  getTmdbImages,
  getAnimeInfo,
  buildEpisodes,
  handleInfo,
  handleWatch,
  MAL_ANIME_FIELDS,
  KITSU: "https://kitsu.app/api/edge",
};