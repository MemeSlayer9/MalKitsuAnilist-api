# 🎌 Anime API — MAL & Kitsu Wrapper (Node.js)

A unified REST API wrapper for **MyAnimeList (MAL)** and **Kitsu** APIs built with Express.js.

---

## Setup

```bash
npm install
cp .env.example .env
# Fill in your credentials (see below)
npm start
```

Open `http://localhost:3000` to see all available endpoints.

---

## API Keys

### MyAnimeList (MAL)
1. Go to https://myanimelist.net/apiconfig
2. Create a new app → copy **Client ID**
3. Set `MAL_CLIENT_ID=your_id` in `.env`

### Kitsu
- **Public endpoints** (search, trending, details) — **no auth needed**
- **User lists** — set `KITSU_EMAIL` and `KITSU_PASSWORD` in `.env`

---

## Endpoints

### MyAnimeList `/mal`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mal/anime/search?q=naruto` | Search anime |
| GET | `/mal/anime/:id` | Anime by ID |
| GET | `/mal/anime/ranking?type=all` | Top anime rankings |
| GET | `/mal/anime/season/2024/winter` | Seasonal anime |
| GET | `/mal/manga/search?q=berserk` | Search manga |
| GET | `/mal/manga/:id` | Manga by ID |
| GET | `/mal/manga/ranking?type=manga` | Top manga rankings |

**Ranking types (anime):** `all` `airing` `upcoming` `tv` `ova` `movie` `special` `bypopularity` `favorite`

**Ranking types (manga):** `all` `manga` `novels` `oneshots` `doujin` `manhwa` `manhua` `bypopularity` `favorite`

### Kitsu `/kitsu`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/kitsu/anime/search?q=one+piece` | Search anime |
| GET | `/kitsu/anime/:id` | Anime by Kitsu ID |
| GET | `/kitsu/anime/slug/attack-on-titan` | Anime by slug |
| GET | `/kitsu/anime/trending` | Trending anime |
| GET | `/kitsu/anime/:id/episodes` | Anime episodes |
| GET | `/kitsu/manga/search?q=berserk` | Search manga |
| GET | `/kitsu/manga/:id` | Manga by Kitsu ID |
| GET | `/kitsu/manga/trending` | Trending manga |
| GET | `/kitsu/users/:userId/animelist` | User's anime list |

**User list status filter:** `current` `planned` `completed` `on_hold` `dropped`

---

## Query Parameters

All list endpoints support:
- `limit` — results per page (default: 10)
- `offset` — pagination offset (default: 0)

---

## Example Responses

```json
// GET /kitsu/anime/search?q=cowboy+bebop
{
  "data": [
    {
      "id": "1",
      "slug": "cowboy-bebop",
      "title": "Cowboy Bebop",
      "synopsis": "...",
      "poster": "https://media.kitsu.app/...",
      "episodes": 26,
      "status": "finished",
      "score": 86.52,
      "genres": ["Action", "Adventure", "Drama", "Sci-Fi"],
      "source": "kitsu"
    }
  ],
  "meta": { "count": 3 }
}
```

---

## Rate Limiting

The server enforces **60 requests/minute** per IP to protect against abuse.
