# News Feed Service in Bun

This project is an experiment in building a **simplified social media backend** using [Bun](https://bun.sh).  
It demonstrates how to implement an API server with basic feed, post, and follow functionality while exploring Bun’s performance and developer experience.

---

## Overview

The goal is to simulate a social media **news feed system**:

- Users can create posts, follow others, and like posts.
- Posts are distributed (fanned out) to followers’ feeds.
- Feeds are cached in memory for fast retrieval.
- The system is lightweight and intended as a prototype for studying architecture patterns.

This is not production-ready, but shows how Bun can be used to build high-performance APIs.

---

## Architecture

1. **In-Memory Data Structures**
   - Store users, posts, social graph, and news feeds.
   - Use `Map` and `Set` for quick lookups.
   - Each user’s feed is a bounded array storing the latest items.

2. **Message Queue (Fanout)**
   - When a post is created, it is enqueued for distribution.
   - A simple round-robin worker loop assigns posts to followers’ feeds.
   - Implements **fanout-on-write**.

3. **API Endpoints**
   - `POST /v1/me/feed` – Create a post.
   - `GET /v1/me/feed` – Get the authenticated user’s feed.
   - `POST /v1/users/follow` – Follow another user.
   - `POST /v1/posts/like` – Like a post.

4. **Authentication**
   - Simplified via `auth_token` query param or header.
   - Tokens follow the format `user_<id>`.

---

## Algorithm: Fanout on Write

When a user creates a post:

1. The post is stored in memory.
2. A fanout message is queued containing the post and the author’s followers.
3. Workers pull from the queue and insert the post into each follower’s feed.
4. Each feed is capped to a fixed number of posts (e.g., 1000).

This mimics the **fanout-on-write** approach common in real feed systems.  
It trades higher write cost for faster reads.

---

## How to Run Locally

### Prerequisites

- [Bun](https://bun.sh/) (latest release)

Check installation:

```bash
bun --version
```

Install if missing:

```bash
curl -fsSL https://bun.sh/install | bash
```

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/news-feed-bun.git
   cd news-feed-bun
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Run the development server:

   ```bash
   bun run dev
   ```

4. The server starts on `http://localhost:3000`.

---

## Example Usage

Create a post:

```bash
curl -X POST "http://localhost:3000/v1/me/feed?auth_token=user_1" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from Bun!"}'
```

Get feed:

```bash
curl "http://localhost:3000/v1/me/feed?auth_token=user_2"
```

Follow a user:

```bash
curl -X POST "http://localhost:3000/v1/users/follow?auth_token=user_2" \
  -H "Content-Type: application/json" \
  -d '{"target_user_id":"user1"}'
```

Like a post:

```bash
curl -X POST "http://localhost:3000/v1/posts/like?auth_token=user_2" \
  -H "Content-Type: application/json" \
  -d '{"post_id":"post_123"}'
```

---

## Limitations

- In-memory only (no database).
- Very basic authentication.
- No pagination or ranking logic.
- Single-process only; scaling requires external cache and queue.

---

## License

MIT License
