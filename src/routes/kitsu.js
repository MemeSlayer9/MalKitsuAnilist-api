const router = require('express').Router();
const kitsu = require('../services/kitsuService');

// ─── Anime ────────────────────────────────────────────────

/**
 * GET /kitsu/anime/search?q=attack+on+titan&limit=10
 * Search anime by title
 */
router.get('/anime/search', async (req, res, next) => {
  try {
    const { q, limit, offset } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const result = await kitsu.searchAnime(q, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /kitsu/anime/trending?limit=10
 * Get trending anime
 */
router.get('/anime/trending', async (req, res, next) => {
  try {
    const result = await kitsu.getTrendingAnime({ limit: parseInt(req.query.limit) || 10 });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /kitsu/anime/slug/:slug
 * Get anime by Kitsu slug (e.g., "attack-on-titan")
 */
router.get('/anime/slug/:slug', async (req, res, next) => {
  try {
    const result = await kitsu.getAnimeBySlug(req.params.slug);
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /kitsu/anime/:id/episodes?limit=20&offset=0
 * Get episodes of an anime
 */
router.get('/anime/:id/episodes', async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await kitsu.getAnimeEpisodes(req.params.id, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /kitsu/anime/:id
 * Get anime by Kitsu ID
 */
router.get('/anime/:id', async (req, res, next) => {
  try {
    const result = await kitsu.getAnimeById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Manga ────────────────────────────────────────────────

/**
 * GET /kitsu/manga/search?q=one+piece&limit=10
 * Search manga by title
 */
router.get('/manga/search', async (req, res, next) => {
  try {
    const { q, limit, offset } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const result = await kitsu.searchManga(q, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /kitsu/manga/trending?limit=10
 * Get trending manga
 */
router.get('/manga/trending', async (req, res, next) => {
  try {
    const result = await kitsu.getTrendingManga({ limit: parseInt(req.query.limit) || 10 });
    res.json(result);
  } catch (err) { next(err); }
});

/**
 * GET /kitsu/manga/:id
 * Get manga by Kitsu ID
 */
router.get('/manga/:id', async (req, res, next) => {
  try {
    const result = await kitsu.getMangaById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// ─── User (Requires Auth) ─────────────────────────────────

/**
 * GET /kitsu/users/:userId/animelist?status=current&limit=20
 * Get a user's anime list (requires Kitsu credentials in .env)
 * status: current, planned, completed, on_hold, dropped
 */
router.get('/users/:userId/animelist', async (req, res, next) => {
  try {
    const { limit, offset, status } = req.query;
    const result = await kitsu.getUserAnimeList(req.params.userId, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0,
      status,
    });
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
