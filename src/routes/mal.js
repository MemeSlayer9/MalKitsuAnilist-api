const router = require('express').Router();
const mal = require('../services/malService');

// ─── Anime ────────────────────────────────────────────────

router.get('/anime/search', async (req, res, next) => {
  try {
    const { q, limit, offset } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const result = await mal.searchAnime(q, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/anime/ranking', async (req, res, next) => {
  try {
    const { type = 'all', limit, offset } = req.query;
    const result = await mal.getAnimeRanking(type, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/anime/season/:year/:season', async (req, res, next) => {
  try {
    const { year, season } = req.params;
    const { sort, limit, offset } = req.query;
    const result = await mal.getSeasonalAnime(year, season, {
      sort,
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/anime/:id/episodes', async (req, res, next) => {
  try {
    const result = await mal.getAnimeEpisodes(req.params.id, {
      page: parseInt(req.query.page) || 1,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/anime/:id', async (req, res, next) => {
  try {
    const result = await mal.getAnimeById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// ─── Manga ────────────────────────────────────────────────

router.get('/manga/search', async (req, res, next) => {
  try {
    const { q, limit, offset } = req.query;
    if (!q) return res.status(400).json({ error: 'Query parameter "q" is required' });
    const result = await mal.searchManga(q, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/manga/ranking', async (req, res, next) => {
  try {
    const { type = 'all', limit, offset } = req.query;
    const result = await mal.getMangaRanking(type, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/manga/:id', async (req, res, next) => {
  try {
    const result = await mal.getMangaById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;