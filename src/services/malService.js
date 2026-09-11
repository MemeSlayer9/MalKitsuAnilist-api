const axios = require('axios');
const config = require('../../config');

const MAL_ANIME_FIELDS = [
  'id', 'title', 'main_picture', 'alternative_titles', 'start_date',
  'end_date', 'synopsis', 'mean', 'rank', 'popularity', 'num_list_users',
  'num_scoring_users', 'nsfw', 'genres', 'media_type', 'status',
  'num_episodes', 'start_season', 'broadcast', 'source', 'average_episode_duration',
  'rating', 'studios', 'statistics',
].join(',');

const MAL_MANGA_FIELDS = [
  'id', 'title', 'main_picture', 'alternative_titles', 'start_date',
  'end_date', 'synopsis', 'mean', 'rank', 'popularity', 'num_list_users',
  'num_scoring_users', 'nsfw', 'genres', 'media_type', 'status',
  'num_volumes', 'num_chapters', 'authors{first_name,last_name}',
].join(',');

const JIKAN_STAGGER_MS = 400;
const TMDB_API         = 'https://api.themoviedb.org/3';
const TMDB_KEY         = process.env.TMDB_API_KEY || '699be86b7a4ca2c8bc77525cb4938dc0';

class MALService {
  constructor() {
    this.client = axios.create({
      baseURL: config.mal.baseUrl,
      timeout: 10000,
    });

    this.jikan = axios.create({
      baseURL: 'https://api.jikan.moe/v4',
      timeout: 15000,
    });

    this.tmdb = axios.create({
      baseURL: TMDB_API,
      timeout: 10000,
      params: { api_key: TMDB_KEY },
    });

    this.client.interceptors.request.use((reqConfig) => {
      const id = process.env.MAL_CLIENT_ID || '';
      if (!id) throw new Error('MAL_CLIENT_ID is not set in your .env file');
      reqConfig.headers['X-MAL-CLIENT-ID'] = id;
      return reqConfig;
    });
  }

  // ─── Jikan ────────────────────────────────────────────────

  async _jikanGet(path, params = {}, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const { data } = await this.jikan.get(path, { params });
        return data;
      } catch (err) {
        const status = err.response?.status;
        if (status && status >= 400 && status < 500) throw err;

        if (attempt === retries - 1) {
          const e = new Error('Jikan failed to connect to MyAnimeList. Try again shortly.');
          e.status = 504;
          e.isUpstream = true;
          throw e;
        }

        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`[Jikan] Attempt ${attempt + 1} failed (${status ?? 'no response'}). Retrying in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  async _fetchAllJikanEpisodePages(malId) {
    let firstPage;
    try {
      firstPage = await this._jikanGet(`/anime/${malId}/episodes`, { page: 1 });
    } catch (err) {
      console.warn(`[Jikan] Page 1 failed for anime ${malId}: ${err.message}`);
      return { episodes: [], totalPages: 0, failed: true, unavailablePages: [] };
    }

    const episodes   = firstPage.data || [];
    const pagination = firstPage.pagination || {};
    const lastPage   = pagination.last_visible_page || 1;

    if (lastPage <= 1) {
      return { episodes, totalPages: 1, failed: false, unavailablePages: [] };
    }

    const remainingPageNums = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
    const unavailablePages  = [];

    const pagePromises = remainingPageNums.map((pageNum, idx) =>
      new Promise((resolve) => setTimeout(resolve, idx * JIKAN_STAGGER_MS))
        .then(() => this._jikanGet(`/anime/${malId}/episodes`, { page: pageNum }))
        .then((res) => res.data || [])
        .catch((err) => {
          console.error(`[Jikan] Page ${pageNum} failed for anime ${malId}: ${err.message}`);
          unavailablePages.push(pageNum);
          return [];
        })
    );

    const remainingPages = await Promise.all(pagePromises);
    const allEpisodes    = [episodes, ...remainingPages].flat();
    allEpisodes.sort((a, b) => (a.mal_id ?? 0) - (b.mal_id ?? 0));

    return { episodes: allEpisodes, totalPages: lastPage, failed: false, unavailablePages };
  }

  // ─── TMDB fallback ────────────────────────────────────────

  /**
   * Resolve a MAL anime ID → TMDB TV show ID using TMDB's external-id lookup.
   * TMDB doesn't index MAL IDs directly, so we:
   *   1. Pull the anime title from the MAL API (already authenticated).
   *   2. Search TMDB for that title, filtered to animation.
   *   3. Return the first match's TMDB ID, or null if nothing fits.
   *
   * @param {number|string} malId
   * @returns {number|null} tmdbId
   */
  async _resolveTMDBId(malId) {
    try {
      // Grab the title from MAL
      const { data: malData } = await this.client.get(`/anime/${malId}`, {
        params: { fields: 'title,alternative_titles,start_date' },
      });

      const title     = malData.title;
      const engTitle  = malData.alternative_titles?.en || null;
      const startYear = malData.start_date ? malData.start_date.slice(0, 4) : null;

      // Try English title first (cleaner TMDB match), fall back to original
      const searchTitle = engTitle || title;

      const params = { query: searchTitle, page: 1 };
      if (startYear) params.first_air_date_year = startYear;

      const { data: searchData } = await this.tmdb.get('/search/tv', { params });
      const results = searchData.results || [];

      if (results.length === 0 && engTitle) {
        // Retry with the original Japanese title if the English one returned nothing
        const { data: retryData } = await this.tmdb.get('/search/tv', {
          params: { query: title, page: 1, ...(startYear ? { first_air_date_year: startYear } : {}) },
        });
        results.push(...(retryData.results || []));
      }

      if (results.length === 0) {
        console.warn(`[TMDB] No results for anime "${title}" (MAL ${malId})`);
        return null;
      }

      // Prefer animation genre (id 16) when multiple results exist
      const animationHit = results.find((r) => (r.genre_ids || []).includes(16));
      const best         = animationHit || results[0];

      console.info(`[TMDB] Resolved MAL ${malId} → TMDB ${best.id} ("${best.name}")`);
      return best.id;
    } catch (err) {
      console.error(`[TMDB] _resolveTMDBId failed for MAL ${malId}: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetch all episodes for an anime via TMDB.
   *
   * Strategy:
   *   1. Resolve TMDB show ID from the MAL title.
   *   2. Pull TV show details to get the season list.
   *   3. Fetch every season and flatten episodes into a single list.
   *      Specials (season 0) are appended at the end.
   *
   * @param {number|string} malId
   * @returns {Episode[]}
   */
  async _fetchEpisodesFromTMDB(malId) {
    const tmdbId = await this._resolveTMDBId(malId);
    if (!tmdbId) return [];

    try {
      // Get the show's season list
      const { data: showData } = await this.tmdb.get(`/tv/${tmdbId}`, {
        params: { append_to_response: 'external_ids' },
      });

      const seasons = (showData.seasons || []).filter((s) => s.season_number > 0);
      // Optionally include specials (season 0) at the end
      const specials = (showData.seasons || []).filter((s) => s.season_number === 0);
      const allSeasons = [...seasons, ...specials];

      if (allSeasons.length === 0) {
        console.warn(`[TMDB] No seasons found for TMDB ${tmdbId}`);
        return [];
      }

      // Fetch each season's episodes (staggered to be polite)
      const seasonResults = await Promise.all(
        allSeasons.map((s, idx) =>
          new Promise((resolve) => setTimeout(resolve, idx * 250))
            .then(() => this.tmdb.get(`/tv/${tmdbId}/season/${s.season_number}`))
            .then(({ data }) => data.episodes || [])
            .catch((err) => {
              console.error(`[TMDB] Season ${s.season_number} failed for TMDB ${tmdbId}: ${err.message}`);
              return [];
            })
        )
      );

      const allEpisodes = seasonResults.flat();

      if (allEpisodes.length === 0) {
        console.warn(`[TMDB] All seasons returned empty for TMDB ${tmdbId}`);
        return [];
      }

      console.info(`[TMDB] Got ${allEpisodes.length} episodes for MAL ${malId} (TMDB ${tmdbId})`);

      return allEpisodes.map((ep) => ({
        id:            ep.episode_number,
        title:         ep.name || `Episode ${ep.episode_number}`,
        titleJapanese: null,
        titleRomanji:  null,
        aired:         ep.air_date ? new Date(ep.air_date).toISOString() : null,
        score:         ep.vote_average || null,
        filler:        null,
        recap:         null,
        thumbnail:     ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
        streamingUrl:  null,
        source:        'tmdb',
      }));
    } catch (err) {
      console.error(`[TMDB] Episode fetch failed for TMDB ${tmdbId} (MAL ${malId}): ${err.message}`);
      return [];
    }
  }

  // ─── MAL direct fallback ──────────────────────────────────

  async _fetchEpisodeStubsFromMAL(malId) {
    try {
      const { data } = await this.client.get(`/anime/${malId}`, {
        params: { fields: 'num_episodes,start_date,average_episode_duration' },
      });

      const total = data.num_episodes || 0;
      if (!total) {
        console.warn(`[MAL] num_episodes=0 for anime ${malId}`);
        return [];
      }

      console.info(`[MAL] Generating ${total} stubs for anime ${malId}`);
      return Array.from({ length: total }, (_, i) => ({
        id:            i + 1,
        title:         `Episode ${i + 1}`,
        titleJapanese: null,
        titleRomanji:  null,
        aired:         null,
        score:         null,
        filler:        null,
        recap:         null,
        thumbnail:     null,
        streamingUrl:  null,
        source:        'mal-stub',
      }));
    } catch (err) {
      console.error(`[MAL] Stub fallback failed for anime ${malId}: ${err.message}`);
      return [];
    }
  }

  // ─── Anime ────────────────────────────────────────────────

  async searchAnime(query, { limit = 10, offset = 0 } = {}) {
    const { data } = await this.client.get('/anime', {
      params: { q: query, limit, offset, fields: MAL_ANIME_FIELDS },
    });
    return {
      data:   data.data.map(({ node }) => this._formatAnime(node)),
      paging: data.paging,
    };
  }

  async getAnimeById(id) {
    const { data } = await this.client.get(`/anime/${id}`, {
      params: { fields: MAL_ANIME_FIELDS },
    });
    return this._formatAnime(data);
  }

  async getAnimeRanking(rankingType = 'all', { limit = 10, offset = 0 } = {}) {
    const valid = ['all', 'airing', 'upcoming', 'tv', 'ova', 'movie', 'special', 'bypopularity', 'favorite'];
    if (!valid.includes(rankingType)) throw new Error(`Invalid ranking type. Use: ${valid.join(', ')}`);
    const { data } = await this.client.get('/anime/ranking', {
      params: { ranking_type: rankingType, limit, offset, fields: MAL_ANIME_FIELDS },
    });
    return {
      data:   data.data.map(({ node, ranking }) => ({ rank: ranking.rank, ...this._formatAnime(node) })),
      paging: data.paging,
    };
  }

  async getSeasonalAnime(year, season, { sort = 'anime_score', limit = 10, offset = 0 } = {}) {
    const validSeasons = ['winter', 'spring', 'summer', 'fall'];
    if (!validSeasons.includes(season)) throw new Error(`Invalid season. Use: ${validSeasons.join(', ')}`);
    const { data } = await this.client.get(`/anime/season/${year}/${season}`, {
      params: { sort, limit, offset, fields: MAL_ANIME_FIELDS },
    });
    return {
      data:   data.data.map(({ node }) => this._formatAnime(node)),
      paging: data.paging,
    };
  }

  /**
   * Fetch ALL episodes for an anime.
   *
   * Fallback chain (tried in order):
   *   1. Jikan    — full metadata: title, aired, score, filler, recap
   *   2. TMDB     — episode titles, air dates, thumbnails, vote averages
   *   3. MAL stub — numbered stubs from total episode count (always works)
   *   4. unavailable
   *
   * source values:
   *   "jikan"      — full Jikan data
   *   "tmdb"       — TMDB episode data
   *   "mal-stub"   — MAL API total count, no titles
   *   "unavailable"— everything failed
   */
  async getAnimeEpisodes(id) {
    // ── 1. Jikan ──────────────────────────────────────────
    const { episodes, totalPages, failed, unavailablePages } =
      await this._fetchAllJikanEpisodePages(id);

    if (!failed && episodes.length > 0) {
      const response = {
        totalEpisodes: episodes.length,
        totalPages,
        source:        'jikan',
        unavailablePages,
        data: episodes.map((ep) => ({
          id:            ep.mal_id,
          title:         ep.title || null,
          titleJapanese: ep.title_japanese || null,
          titleRomanji:  ep.title_romanji || null,
          aired:         ep.aired || null,
          score:         ep.score || null,
          filler:        ep.filler ?? null,
          recap:         ep.recap ?? null,
          thumbnail:     null,
          streamingUrl:  null,
        })),
      };
      if (unavailablePages.length > 0) {
        response.warning = `Episodes from page(s) ${unavailablePages.join(', ')} could not be fetched. Data may be incomplete.`;
      }
      return response;
    }

    // ── 2. TMDB ───────────────────────────────────────────
    console.info(`[Episodes] Jikan unavailable for anime ${id}. Trying TMDB…`);
    const tmdbEpisodes = await this._fetchEpisodesFromTMDB(id);

    if (tmdbEpisodes.length > 0) {
      return {
        totalEpisodes:    tmdbEpisodes.length,
        totalPages:       0,
        source:           'tmdb',
        warning:          'Jikan is currently unavailable. Showing episode data from TMDB (filler/recap flags unavailable).',
        unavailablePages: [],
        data:             tmdbEpisodes,
      };
    }

    // ── 3. MAL direct stub ────────────────────────────────
    console.info(`[Episodes] TMDB also failed for anime ${id}. Falling back to MAL stub…`);
    const malStubs = await this._fetchEpisodeStubsFromMAL(id);

    if (malStubs.length > 0) {
      return {
        totalEpisodes:    malStubs.length,
        totalPages:       0,
        source:           'mal-stub',
        warning:          'Jikan and TMDB are both unavailable. Showing numbered episode list from MAL (titles unavailable).',
        unavailablePages: [],
        data:             malStubs,
      };
    }

    // ── 4. Everything failed ──────────────────────────────
    console.error(`[Episodes] All sources failed for anime ${id}.`);
    return {
      totalEpisodes:    0,
      totalPages:       0,
      source:           'unavailable',
      warning:          'Episode data is temporarily unavailable from all sources (Jikan + TMDB + MAL). Try again in a few minutes.',
      unavailablePages: [],
      data:             [],
    };
  }

  // ─── Manga ────────────────────────────────────────────────

  async searchManga(query, { limit = 10, offset = 0 } = {}) {
    const { data } = await this.client.get('/manga', {
      params: { q: query, limit, offset, fields: MAL_MANGA_FIELDS },
    });
    return {
      data:   data.data.map(({ node }) => this._formatManga(node)),
      paging: data.paging,
    };
  }

  async getMangaById(id) {
    const { data } = await this.client.get(`/manga/${id}`, {
      params: { fields: MAL_MANGA_FIELDS },
    });
    return this._formatManga(data);
  }

  async getMangaRanking(rankingType = 'all', { limit = 10, offset = 0 } = {}) {
    const valid = ['all', 'manga', 'novels', 'oneshots', 'doujin', 'manhwa', 'manhua', 'bypopularity', 'favorite'];
    if (!valid.includes(rankingType)) throw new Error(`Invalid ranking type. Use: ${valid.join(', ')}`);
    const { data } = await this.client.get('/manga/ranking', {
      params: { ranking_type: rankingType, limit, offset, fields: MAL_MANGA_FIELDS },
    });
    return {
      data:   data.data.map(({ node, ranking }) => ({ rank: ranking.rank, ...this._formatManga(node) })),
      paging: data.paging,
    };
  }

  // ─── Formatters ───────────────────────────────────────────

  _formatAnime(node) {
    return {
      id:               node.id,
      title:            node.title,
      alternativeTitles: node.alternative_titles || {},
      picture:          node.main_picture || null,
      synopsis:         node.synopsis || null,
      score:            node.mean || null,
      rank:             node.rank || null,
      popularity:       node.popularity || null,
      mediaType:        node.media_type || null,
      status:           node.status || null,
      genres:           (node.genres || []).map((g) => g.name),
      episodes:         node.num_episodes || null,
      startDate:        node.start_date || null,
      endDate:          node.end_date || null,
      season:           node.start_season || null,
      rating:           node.rating || null,
      studios:          (node.studios || []).map((s) => s.name),
      statistics:       node.statistics || null,
      source:           'mal',
    };
  }

  _formatManga(node) {
    return {
      id:               node.id,
      title:            node.title,
      alternativeTitles: node.alternative_titles || {},
      picture:          node.main_picture || null,
      synopsis:         node.synopsis || null,
      score:            node.mean || null,
      rank:             node.rank || null,
      popularity:       node.popularity || null,
      mediaType:        node.media_type || null,
      status:           node.status || null,
      genres:           (node.genres || []).map((g) => g.name),
      volumes:          node.num_volumes || null,
      chapters:         node.num_chapters || null,
      startDate:        node.start_date || null,
      endDate:          node.end_date || null,
      authors:          (node.authors || []).map((a) => `${a.node.first_name} ${a.node.last_name}`.trim()),
      source:           'mal',
    };
  }
}

module.exports = new MALService();

 