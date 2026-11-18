/**
 * Instagram Stories Scheduler Publisher
 *
 * Safe institutional publisher for recurring Instagram Stories plans.
 * Contains no secrets. Accepts both canonical snake_case plan keys and
 * legacy/camelCase keys produced by earlier materializers.
 */

const DEFAULT_GRAPH_BASE_URL = "https://graph.facebook.com/v21.0";

export class InstagramSchedulerError extends Error {
  constructor(code, message, details = {}) {
    super(message ?? code);
    this.name = "InstagramSchedulerError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function normalizeStoryItem(item) {
  if (!item || typeof item !== "object") {
    throw new InstagramSchedulerError("invalid_item", "Scheduler item must be an object");
  }

  const instagram = firstNonEmpty(item.instagram, item.instagram_handle, item.handle);
  const igUserId = firstNonEmpty(item.ig_user_id, item.igUserId, item.ig_userId, item.instagram_user_id);
  const imageUrl = firstNonEmpty(item.url_publica, item.imageUrl, item.image_url, item.public_url, item.url);

  return Object.freeze({
    instagram,
    igUserId,
    imageUrl,
    action: firstNonEmpty(item.action, item.acao, "story"),
    topic: firstNonEmpty(item.topic, item.tema_ou_arquivo, item.file, item.arquivo) || null,
    source: Object.freeze({ ...item }),
  });
}

export function assertStoriesOnlyItem(item) {
  const normalized = normalizeStoryItem(item);

  if (!normalized.igUserId) {
    throw new InstagramSchedulerError("missing_ig_user_id", "Missing ig_user_id", { item });
  }
  if (!normalized.instagram) {
    throw new InstagramSchedulerError("missing_instagram", "Missing instagram handle", { item });
  }
  if (!/^https:\/\/.+/i.test(normalized.imageUrl)) {
    throw new InstagramSchedulerError("invalid_image_url", "Story image URL must be HTTPS", {
      imageUrl: normalized.imageUrl,
      item,
    });
  }

  return normalized;
}

export function daysBetween(startDate, targetDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(target)) {
    throw new InstagramSchedulerError("invalid_date", "Invalid date in scheduler plan", {
      startDate,
      targetDate,
    });
  }
  return Math.floor((target - start) / 86400000);
}

export function buildDailyStoryItems(plan, targetDate) {
  if (!plan || typeof plan !== "object") {
    throw new InstagramSchedulerError("invalid_plan", "Plan must be an object");
  }

  const active = Boolean(plan.active);
  const startDate = String(plan.start_date ?? plan.startDate ?? "");
  const endDate = String(plan.end_date ?? plan.endDate ?? "");

  if (!active) {
    return Object.freeze({ due: false, reason: "plan_inactive", items: [] });
  }
  if (startDate && targetDate < startDate) {
    return Object.freeze({ due: false, reason: "before_start_date", items: [] });
  }
  if (endDate && targetDate > endDate) {
    return Object.freeze({ due: false, reason: "after_end_date", items: [] });
  }

  const items = [];

  for (const item of plan.daily_repost_items ?? plan.dailyRepostItems ?? []) {
    items.push(assertStoriesOnlyItem({ ...item, action: item.action ?? item.acao ?? "repost_story" }));
  }

  const cycle = plan.peterle_daily_cycle ?? plan.peterleDailyCycle;
  if (cycle && Array.isArray(cycle.items) && cycle.items.length > 0) {
    const cycleStartDate = cycle.cycle_start_date ?? cycle.cycleStartDate;
    const delta = daysBetween(cycleStartDate, targetDate);
    if (delta >= 0) {
      const cycleItem = cycle.items[delta % cycle.items.length];
      items.push(
        assertStoriesOnlyItem({
          action: "peterle_story_of_day",
          instagram: cycle.instagram,
          ig_user_id: cycle.ig_user_id ?? cycle.igUserId,
          url_publica: cycleItem.url_publica ?? cycleItem.imageUrl,
          topic: cycleItem.topic,
          tema_ou_arquivo: cycleItem.tema_ou_arquivo,
        }),
      );
    }
  }

  return Object.freeze({ due: true, reason: "due", items: Object.freeze(items) });
}

async function parseMetaResponse(response) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new InstagramSchedulerError("meta_graph_error", "Meta Graph API request failed", {
      status: response.status,
      payload,
    });
  }

  return payload;
}

export async function createInstagramStoryContainer({
  fetchImpl = globalThis.fetch,
  graphBaseUrl = DEFAULT_GRAPH_BASE_URL,
  accessToken,
  igUserId,
  imageUrl,
}) {
  if (typeof fetchImpl !== "function") {
    throw new InstagramSchedulerError("fetch_unavailable", "fetch implementation is required");
  }
  if (!accessToken) {
    throw new InstagramSchedulerError("missing_access_token", "Meta access token is required");
  }

  const body = new URLSearchParams();
  body.set("media_type", "STORIES");
  body.set("image_url", imageUrl);
  body.set("access_token", accessToken);

  const response = await fetchImpl(`${graphBaseUrl}/${encodeURIComponent(igUserId)}/media`, {
    method: "POST",
    body,
  });

  return parseMetaResponse(response);
}

export async function publishInstagramContainer({
  fetchImpl = globalThis.fetch,
  graphBaseUrl = DEFAULT_GRAPH_BASE_URL,
  accessToken,
  igUserId,
  creationId,
}) {
  if (!creationId) {
    throw new InstagramSchedulerError("missing_creation_id", "creation_id is required");
  }

  const body = new URLSearchParams();
  body.set("creation_id", creationId);
  body.set("access_token", accessToken);

  const response = await fetchImpl(`${graphBaseUrl}/${encodeURIComponent(igUserId)}/media_publish`, {
    method: "POST",
    body,
  });

  return parseMetaResponse(response);
}

export async function publishStoryItem({
  fetchImpl,
  graphBaseUrl,
  accessToken,
  item,
  dryRun = true,
}) {
  const story = assertStoriesOnlyItem(item);

  if (dryRun) {
    return Object.freeze({
      ok: true,
      dryRun: true,
      instagram: story.instagram,
      igUserId: story.igUserId,
      imageUrl: story.imageUrl,
      mediaType: "STORIES",
    });
  }

  const container = await createInstagramStoryContainer({
    fetchImpl,
    graphBaseUrl,
    accessToken,
    igUserId: story.igUserId,
    imageUrl: story.imageUrl,
  });

  const published = await publishInstagramContainer({
    fetchImpl,
    graphBaseUrl,
    accessToken,
    igUserId: story.igUserId,
    creationId: container.id,
  });

  return Object.freeze({
    ok: true,
    dryRun: false,
    instagram: story.instagram,
    igUserId: story.igUserId,
    imageUrl: story.imageUrl,
    creationId: container.id,
    publishedId: published.id,
  });
}

export async function runInstagramStoriesSchedule({
  plan,
  targetDate,
  accessToken,
  dryRun = true,
  fetchImpl = globalThis.fetch,
  graphBaseUrl = DEFAULT_GRAPH_BASE_URL,
  logger = undefined,
}) {
  const daily = buildDailyStoryItems(plan, targetDate);
  const results = [];

  if (!daily.due) {
    return Object.freeze({
      ok: true,
      due: false,
      reason: daily.reason,
      targetDate,
      dryRun,
      planned: 0,
      published: 0,
      results,
    });
  }

  for (const item of daily.items) {
    try {
      const result = await publishStoryItem({
        fetchImpl,
        graphBaseUrl,
        accessToken,
        item,
        dryRun,
      });
      results.push({ ok: true, item, result });
      if (logger) logger({ level: "info", event: "story_published", item, result });
    } catch (error) {
      const failure = {
        ok: false,
        item,
        error: error instanceof Error ? error.message : String(error),
        code: error?.code ?? "unknown_error",
        details: error?.details ?? undefined,
      };
      results.push(failure);
      if (logger) logger({ level: "error", event: "story_publish_failed", ...failure });
    }
  }

  return Object.freeze({
    ok: results.every((entry) => entry.ok),
    due: true,
    targetDate,
    dryRun,
    planned: daily.items.length,
    published: dryRun ? 0 : results.filter((entry) => entry.ok).length,
    results,
  });
}
