// News Feed System Implementation in TypeScript with Bun

interface User {
  id: string;
  username: string;
  profilePicture: string;
}

interface Post {
  id: string;
  userId: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  timestamp: number;
  likeCount: number;
  replyCount: number;
}

interface NewsFeedItem {
  postId: string;
  timestamp: number;
}

interface FanoutMessage {
  postId: string;
  userId: string;
  friendIds: string[];
}

// In-memory caches (in production, use Redis or similar)
class CacheLayer {
  private newsFeeds = new Map<string, NewsFeedItem[]>();
  private posts = new Map<string, Post>();
  private users = new Map<string, User>();
  private hotCache = new Map<string, Post>();
  private socialGraph = new Map<string, Set<string>>();
  private actions = new Map<string, Map<string, boolean>>(); // userId -> postId -> liked
  private counters = new Map<string, { likes: number; replies: number }>();

  // News Feed Cache
  getNewsFeed(userId: string): NewsFeedItem[] {
    return this.newsFeeds.get(userId) || [];
  }

  addToNewsFeed(userId: string, item: NewsFeedItem): void {
    const feed = this.newsFeeds.get(userId) || [];
    feed.unshift(item);
    // Keep only latest 1000 items
    if (feed.length > 1000) {
      feed.splice(1000);
    }
    this.newsFeeds.set(userId, feed);
  }

  // Post Cache
  getPost(postId: string): Post | undefined {
    return this.hotCache.get(postId) || this.posts.get(postId);
  }

  setPost(post: Post): void {
    this.posts.set(post.id, post);
    // Popular posts go to hot cache
    if (post.likeCount > 100) {
      this.hotCache.set(post.id, post);
    }
  }

  // User Cache
  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  setUser(user: User): void {
    this.users.set(user.id, user);
  }

  // Social Graph
  getFollowers(userId: string): string[] {
    return Array.from(this.socialGraph.get(`followers_${userId}`) || []);
  }

  getFollowing(userId: string): string[] {
    return Array.from(this.socialGraph.get(`following_${userId}`) || []);
  }

  addFollower(userId: string, followerId: string): void {
    let followers = this.socialGraph.get(`followers_${userId}`);
    if (!followers) {
      followers = new Set();
      this.socialGraph.set(`followers_${userId}`, followers);
    }
    followers.add(followerId);

    let following = this.socialGraph.get(`following_${followerId}`);
    if (!following) {
      following = new Set();
      this.socialGraph.set(`following_${followerId}`, following);
    }
    following.add(userId);
  }

  // Actions
  likePost(userId: string, postId: string): void {
    let userActions = this.actions.get(userId);
    if (!userActions) {
      userActions = new Map();
      this.actions.set(userId, userActions);
    }
    userActions.set(postId, true);

    // Update counters
    const counter = this.counters.get(postId) || { likes: 0, replies: 0 };
    counter.likes++;
    this.counters.set(postId, counter);

    // Update post cache
    const post = this.getPost(postId);
    if (post) {
      post.likeCount = counter.likes;
      this.setPost(post);
    }
  }

  hasLiked(userId: string, postId: string): boolean {
    return this.actions.get(userId)?.get(postId) || false;
  }

  getCounters(postId: string) {
    return this.counters.get(postId) || { likes: 0, replies: 0 };
  }
}

// Message Queue for async processing
class MessageQueue {
  private queue: FanoutMessage[] = [];
  private workers: FanoutWorker[] = [];

  constructor(workerCount: number = 3) {
    for (let i = 0; i < workerCount; i++) {
      this.workers.push(new FanoutWorker(i));
    }
  }

  enqueue(message: FanoutMessage): void {
    this.queue.push(message);
    this.processQueue();
  }

  private processQueue(): void {
    if (this.queue.length === 0) return;

    const availableWorker = this.workers.find((w) => !w.isBusy());
    if (availableWorker) {
      const message = this.queue.shift()!;
      availableWorker.process(message);
    }
  }
}

class FanoutWorker {
  private busy = false;

  constructor(private id: number) {}

  isBusy(): boolean {
    return this.busy;
  }

  async process(message: FanoutMessage): Promise<void> {
    this.busy = true;
    console.log(
      `Worker ${this.id} processing fanout for post ${message.postId}`,
    );

    // Simulate fanout processing
    const newsFeedItem: NewsFeedItem = {
      postId: message.postId,
      timestamp: Date.now(),
    };

    // Add to each friend's news feed
    for (const friendId of message.friendIds) {
      cache.addToNewsFeed(friendId, newsFeedItem);
    }

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 100));
    this.busy = false;
  }
}

// Services
class PostService {
  async createPost(
    userId: string,
    content: string,
    imageUrl?: string,
    videoUrl?: string,
  ): Promise<Post> {
    const post: Post = {
      id: `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      content,
      imageUrl,
      videoUrl,
      timestamp: Date.now(),
      likeCount: 0,
      replyCount: 0,
    };

    cache.setPost(post);
    console.log(`Post created: ${post.id}`);
    return post;
  }

  async getPost(postId: string): Promise<Post | null> {
    return cache.getPost(postId) || null;
  }
}

class FanoutService {
  constructor(private messageQueue: MessageQueue) {}

  async fanoutPost(postId: string, userId: string): Promise<void> {
    console.log(`Starting fanout for post ${postId}`);

    // Get user's followers (who should see this post)
    const followers = cache.getFollowers(userId);

    if (followers.length === 0) {
      console.log(`No followers found for user ${userId}`);
      return;
    }

    // Use hybrid approach: immediate fanout for active users, queue for others
    const message: FanoutMessage = {
      postId,
      userId,
      friendIds: followers,
    };

    this.messageQueue.enqueue(message);
  }
}

class NewsFeedService {
  async getNewsFeed(userId: string, limit: number = 20): Promise<any[]> {
    const feedItems = cache.getNewsFeed(userId).slice(0, limit);

    const hydratedFeed = [];
    for (const item of feedItems) {
      const post = cache.getPost(item.postId);
      if (post) {
        const author = cache.getUser(post.userId);
        const counters = cache.getCounters(post.id);
        const liked = cache.hasLiked(userId, post.id);

        hydratedFeed.push({
          ...post,
          author: author
            ? {
                username: author.username,
                profilePicture: author.profilePicture,
              }
            : null,
          likeCount: counters.likes,
          replyCount: counters.replies,
          liked,
        });
      }
    }

    return hydratedFeed;
  }
}

class NotificationService {
  async sendNotification(userId: string, message: string): Promise<void> {
    console.log(`Notification to ${userId}: ${message}`);
    // In production, this would send push notifications
  }
}

// Initialize services and cache
const cache = new CacheLayer();
const messageQueue = new MessageQueue(5);
const postService = new PostService();
const fanoutService = new FanoutService(messageQueue);
const newsFeedService = new NewsFeedService();
const notificationService = new NotificationService();

// HTTP Server with Bun
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);

    // Authentication middleware (simplified)
    const authToken =
      url.searchParams.get("auth_token") ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (!authToken) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Extract user ID from token (in production, verify JWT)
    const userId = authToken.replace("user_", "");

    // Routes
    if (url.pathname === "/v1/me/feed" && req.method === "POST") {
      // Feed Publishing API
      const body = (await req.json()) as {
        content: string;
        imageUrl?: string;
        videoUrl?: string;
      };

      try {
        const post = await postService.createPost(
          userId,
          body.content,
          body.imageUrl,
          body.videoUrl,
        );

        // Trigger fanout
        await fanoutService.fanoutPost(post.id, userId);

        return new Response(
          JSON.stringify({ success: true, postId: post.id }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Failed to create post" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (url.pathname === "/v1/me/feed" && req.method === "GET") {
      // News Feed Retrieval API
      try {
        const feed = await newsFeedService.getNewsFeed(userId, 20);
        return new Response(JSON.stringify({ feed }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: "Failed to retrieve feed" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (url.pathname === "/v1/users/follow" && req.method === "POST") {
      // Follow a user
      const body = (await req.json()) as { targetUserId: string };
      cache.addFollower(body.targetUserId, userId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/v1/posts/like" && req.method === "POST") {
      // Like a post
      const body = (await req.json()) as { postId: string };
      cache.likePost(userId, body.postId);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

// Initialize some sample data
function initSampleData() {
  // Create sample users
  cache.setUser({
    id: "user1",
    username: "alice",
    profilePicture: "https://example.com/alice.jpg",
  });
  cache.setUser({
    id: "user2",
    username: "bob",
    profilePicture: "https://example.com/bob.jpg",
  });
  cache.setUser({
    id: "user3",
    username: "charlie",
    profilePicture: "https://example.com/charlie.jpg",
  });

  // Create some follow relationships
  cache.addFollower("user1", "user2"); // Bob follows Alice
  cache.addFollower("user1", "user3"); // Charlie follows Alice
  cache.addFollower("user2", "user3"); // Charlie follows Bob
}

initSampleData();

console.log(`News Feed server running on port ${server.port}`);
console.log("API Endpoints:");
console.log("POST /v1/me/feed?auth_token=user_1 - Create post");
console.log("GET /v1/me/feed?auth_token=user_2 - Get news feed");
console.log("POST /v1/users/follow?auth_token=user_1 - Follow user");
console.log("POST /v1/posts/like?auth_token=user_1 - Like post");

// Example usage:
// Create post: curl -X POST "http://localhost:3000/v1/me/feed?auth_token=user_1" -H "Content-Type: application/json" -d '{"content":"Hello World!"}'
// Get feed: curl "http://localhost:3000/v1/me/feed?auth_token=user_2"
// Follow: curl -X POST "http://localhost:3000/v1/users/follow?auth_token=user_2" -H "Content-Type: application/json" -d '{"targetUserId":"user_1"}'
// Like: curl -X POST "http://localhost:3000/v1/posts/like?auth_token=user_2" -H "Content-Type: application/json" -d '{"postId":"post_123"}'
