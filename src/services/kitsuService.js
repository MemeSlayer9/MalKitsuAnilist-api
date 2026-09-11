const axios = require('axios');
const config = require('../../config');

class KitsuService {
  constructor() {
    this.client = axios.create({
      baseURL: config.kitsu.baseUrl,
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
    });
    this.token = null;
  }

  // ─── Auth ─────────────────────────────────────────────────

  async authenticate() {
    if (!config.kitsu.email || !config.kitsu.password) return null;
    if (this.token) return this.token;

    const { data } = await axios.post(config.kitsu.authUrl, {
      grant_type: 'password',
      username: config.kitsu.email,
      password: config.kitsu.password,
    });
    this.token = data.access_token;
    this.client.defaults.headers['Authorization'] = `Bearer ${this.token}`;
    return this.token;
  }

  // ─── Anime ────────────────────────────────────────────────

  async searchAnime(query, { limit = 10, offset = 0 } = {}) {
    const { data } = await this.client.get('/anime', {
      params: {
        'filter[text]': query,
        'page[limit]': limit,
        'page[offset]': offset,
        'fields[anime]': 'slug,canonicalTitle,titles,synopsis,posterImage,coverImage,startDate,endDate,episodeCount,episodeLength,status,averageRating,popularityRank,ratingRank,ageRating,subtype,youtubeVideoId',
        include: 'genres,categories',
      },
    });
    return {
      data: data.data.map(item => this._formatAnime(item, data.included)),
      meta: data.meta,
      links: data.links,
    };
  }

  async getAnimeById(id) {
    const { data } = await this.client.get(`/anime/${id}`, {
      params: { include: 'genres,categories,streamingLinks,characters.character,staff.person' },
    });
    return this._formatAnime(data.data, data.included, { detailed: true });
  }

  async getAnimeBySlug(slug) {
    const { data } = await this.client.get('/anime', {
      params: {
        'filter[slug]': slug,
        include: 'genres,categories,streamingLinks',
      },
    });
    if (!data.data.length) throw new Error(`Anime not found: ${slug}`);
    return this._formatAnime(data.data[0], data.included);
  }

  async getTrendingAnime({ limit = 10 } = {}) {
    const { data } = await this.client.get('/trending/anime', {
      params: { limit },
    });
    return { data: data.data.map(item => this._formatAnime(item)) };
  }

  async getAnimeEpisodes(animeId, { limit = 20, offset = 0 } = {}) {
    const { data } = await this.client.get('/episodes', {
      params: {
        'filter[media_id]': animeId,
        'filter[media_type]': 'Anime',
        'page[limit]': limit,
        'page[offset]': offset,
        sort: 'number',
      },
    });
    return {
      data: data.data.map(ep => ({
        id: ep.id,
        number: ep.attributes.number,
        title: ep.attributes.canonicalTitle,
        synopsis: ep.attributes.synopsis,
        airdate: ep.attributes.airdate,
        length: ep.attributes.length,
        thumbnail: ep.attributes.thumbnail?.original || null,
      })),
      meta: data.meta,
    };
  }

  // ─── Manga ────────────────────────────────────────────────

  async searchManga(query, { limit = 10, offset = 0 } = {}) {
    const { data } = await this.client.get('/manga', {
      params: {
        'filter[text]': query,
        'page[limit]': limit,
        'page[offset]': offset,
        'fields[manga]': 'slug,canonicalTitle,titles,synopsis,posterImage,coverImage,startDate,endDate,chapterCount,volumeCount,status,averageRating,popularityRank,ratingRank,subtype',
        include: 'genres,categories',
      },
    });
    return {
      data: data.data.map(item => this._formatManga(item, data.included)),
      meta: data.meta,
    };
  }

  async getMangaById(id) {
    const { data } = await this.client.get(`/manga/${id}`, {
      params: { include: 'genres,categories,characters.character' },
    });
    return this._formatManga(data.data, data.included, { detailed: true });
  }

  async getTrendingManga({ limit = 10 } = {}) {
    const { data } = await this.client.get('/trending/manga', {
      params: { limit },
    });
    return { data: data.data.map(item => this._formatManga(item)) };
  }

  // ─── User Lists (Requires Auth) ───────────────────────────

  async getUserAnimeList(userId, { limit = 20, offset = 0, status } = {}) {
    await this.authenticate();
    const params = {
      'filter[userId]': userId,
      'page[limit]': limit,
      'page[offset]': offset,
      include: 'anime',
    };
    if (status) params['filter[status]'] = status;

    const { data } = await this.client.get('/library-entries', { params });
    return {
      data: data.data.map(entry => ({
        id: entry.id,
        status: entry.attributes.status,
        progress: entry.attributes.progress,
        rating: entry.attributes.ratingTwenty ? entry.attributes.ratingTwenty / 2 : null,
        reconsuming: entry.attributes.reconsuming,
        notes: entry.attributes.notes,
        updatedAt: entry.attributes.updatedAt,
        anime: data.included?.find(i => i.id === entry.relationships.anime?.data?.id)
          ? this._formatAnime(data.included.find(i => i.id === entry.relationships.anime.data.id))
          : null,
      })),
      meta: data.meta,
    };
  }

  // ─── Formatters ───────────────────────────────────────────

  _formatAnime(item, included = [], { detailed = false } = {}) {
    const a = item.attributes;
    const base = {
      id: item.id,
      slug: a.slug,
      title: a.canonicalTitle,
      titles: a.titles || {},
      synopsis: a.synopsis || null,
      poster: a.posterImage?.large || a.posterImage?.original || null,
      cover: a.coverImage?.large || null,
      startDate: a.startDate || null,
      endDate: a.endDate || null,
      episodes: a.episodeCount || null,
      episodeLength: a.episodeLength || null,
      status: a.status || null,
      score: a.averageRating ? parseFloat(a.averageRating) : null,
      popularityRank: a.popularityRank || null,
      ratingRank: a.ratingRank || null,
      ageRating: a.ageRating || null,
      subtype: a.subtype || null,
      youtubeTrailer: a.youtubeVideoId ? `https://youtube.com/watch?v=${a.youtubeVideoId}` : null,
      genres: this._extractRelated(item, included, 'genres', 'name'),
      source: 'kitsu',
    };

    if (detailed && included?.length) {
      base.streamingLinks = included
        .filter(i => i.type === 'streamingLinks')
        .map(l => ({ url: l.attributes.url, subs: l.attributes.subs, dubs: l.attributes.dubs }));
    }

    return base;
  }

  _formatManga(item, included = [], { detailed = false } = {}) {
    const a = item.attributes;
    return {
      id: item.id,
      slug: a.slug,
      title: a.canonicalTitle,
      titles: a.titles || {},
      synopsis: a.synopsis || null,
      poster: a.posterImage?.large || a.posterImage?.original || null,
      cover: a.coverImage?.large || null,
      startDate: a.startDate || null,
      endDate: a.endDate || null,
      chapters: a.chapterCount || null,
      volumes: a.volumeCount || null,
      status: a.status || null,
      score: a.averageRating ? parseFloat(a.averageRating) : null,
      popularityRank: a.popularityRank || null,
      ratingRank: a.ratingRank || null,
      subtype: a.subtype || null,
      genres: this._extractRelated(item, included, 'genres', 'name'),
      source: 'kitsu',
    };
  }

  _extractRelated(item, included, type, field) {
    const rel = item.relationships?.[type]?.data;
    if (!rel || !included?.length) return [];
    const ids = Array.isArray(rel) ? rel.map(r => r.id) : [rel.id];
    return included
      .filter(i => i.type === type && ids.includes(i.id))
      .map(i => i.attributes[field])
      .filter(Boolean);
  }
}

module.exports = new KitsuService();
