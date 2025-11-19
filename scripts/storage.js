const STORAGE_KEY = "kmoeSyncSettings";
const HISTORY_LIMIT = 40;
const DEFAULT_RULE = "{title}/{filename}";
const FILE_STATUSES = new Set(["pending", "downloading", "uploading", "success", "error"]);
const SAMPLE_SERVER = {
  id: "demo-webdav",
  name: "示例 WebDAV",
  baseUrl: "https://example.com/webdav",
  username: "",
  password: "",
  defaultPath: "/",
  paths: [{ id: "demo-root", label: "默认", value: "/" }]
};

export const defaultSettings = {
  webdavServers: [SAMPLE_SERVER],
  lastSelectedServerId: SAMPLE_SERVER.id,
  lastSelectedPaths: { [SAMPLE_SERVER.id]: SAMPLE_SERVER.defaultPath },
  floatingButtonPosition: { x: null, y: null },
  downloadRule: DEFAULT_RULE,
  history: [],
  collapsedServers: {},
  serverTestStatus: {}
};

export function createEmptyServer() {
  return {
    id: crypto.randomUUID(),
    name: "新的服务器",
    baseUrl: "http://",
    username: "",
    password: "",
    defaultPath: "/",
    paths: []
  };
}

export function normalizePath(path) {
  if (!path) return "/";
  const trimmed = path.trim();
  if (!trimmed) return "/";
  const hasLeading = trimmed.startsWith("/");
  let safe = trimmed.split("\\").join("/");
  if (!hasLeading) safe = `/${safe}`;
  safe = safe.replace(/\/+/g, "/");
  return safe === "/" ? "/" : safe.replace(/\/$/, "");
}

function normalizeRuleSegments(value) {
  if (!value) return "";
  return value
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .replace(/[\\:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
    )
    .filter(Boolean)
    .join("/");
}

function sanitizeBaseUrl(raw) {
  if (!raw) return "";
  let value = raw.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  try {
    const url = new URL(value);
    return url.origin.replace(/\/$/, "") + url.pathname.replace(/\/$/, "");
  } catch (err) {
    return value;
  }
}

function extractBasePathFromUrl(baseUrl) {
  if (!baseUrl) return "/";
  try {
    const url = new URL(baseUrl);
    return normalizePath(url.pathname || "/");
  } catch (err) {
    return "/";
  }
}

function stripBasePath(baseUrl, rawPath) {
  const normalizedPath = normalizePath(rawPath || "/");
  const basePath = extractBasePathFromUrl(baseUrl);
  if (!basePath || basePath === "/") {
    return normalizedPath;
  }
  if (normalizedPath === basePath) {
    return "/";
  }
  if (normalizedPath.startsWith(`${basePath}/`)) {
    const sliced = normalizedPath.slice(basePath.length);
    return sliced || "/";
  }
  return normalizedPath;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function sanitizeHistoryFiles(files, title = "下载项") {
  if (!Array.isArray(files)) return [];
  return files.map((file, index) => {
    const status = FILE_STATUSES.has(file?.status) ? file.status : "pending";
    return {
      id: file?.id || crypto.randomUUID(),
      label: file?.label || `${title || "下载项"} ${index + 1}`,
      status,
      fileName: file?.fileName || "",
      remotePath: typeof file?.remotePath === "string" ? file.remotePath : "",
      error: file?.error || "",
      startedAt: file?.startedAt || null,
      finishedAt: file?.finishedAt || null,
      downloadSize: Number(file?.downloadSize) || 0,
      downloadTotal: Number(file?.downloadTotal) || 0,
      uploadSize: Number(file?.uploadSize) || 0,
      uploadTotal: Number(file?.uploadTotal) || 0,
      downloadSpeed: Number(file?.downloadSpeed) || 0,
      uploadSpeed: Number(file?.uploadSpeed) || 0
    };
  });
}

function sanitizeHistoryEntry(entry) {
  const safeTitle = entry?.title || "未命名漫画";
  return {
    id: entry?.id || entry?.jobId || crypto.randomUUID(),
    jobId: entry?.jobId || entry?.id || crypto.randomUUID(),
    title: safeTitle,
    total: Number(entry?.total) || 0,
    success: Number(entry?.success) || 0,
    failed: Number(entry?.failed) || 0,
    status: entry?.status || "processing",
    serverName: entry?.serverName || "",
    targetPath: normalizePath(entry?.targetPath || "/"),
    rule: entry?.rule || DEFAULT_RULE,
    startedAt: entry?.startedAt || Date.now(),
    finishedAt: entry?.finishedAt || null,
    message: entry?.message || "",
    line: entry?.line || "",
    pageUrl: entry?.pageUrl || "",
    error: entry?.error || "",
    files: sanitizeHistoryFiles(entry?.files || entry?.items || [], safeTitle)
  };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((entry) => sanitizeHistoryEntry(entry)).slice(0, HISTORY_LIMIT);
}

function sanitizeSettings(settings) {
  const next = {
    webdavServers: Array.isArray(settings?.webdavServers)
      ? settings.webdavServers
      : clone(defaultSettings.webdavServers),
    lastSelectedServerId: settings?.lastSelectedServerId || defaultSettings.lastSelectedServerId,
    lastSelectedPaths:
      typeof settings?.lastSelectedPaths === "object" && settings.lastSelectedPaths
        ? { ...settings.lastSelectedPaths }
        : clone(defaultSettings.lastSelectedPaths),
    floatingButtonPosition: sanitizeFloatingButtonPosition(settings?.floatingButtonPosition),
    downloadRule: settings?.downloadRule?.trim() || DEFAULT_RULE,
    history: sanitizeHistory(settings?.history || []),
    collapsedServers:
      typeof settings?.collapsedServers === "object" && settings.collapsedServers
        ? { ...settings.collapsedServers }
        : {},
    serverTestStatus:
      typeof settings?.serverTestStatus === "object" && settings.serverTestStatus
        ? { ...settings.serverTestStatus }
        : {}
  };

  next.webdavServers = next.webdavServers
    .map((server) => {
      const sanitized = {
        ...server,
        id: server.id || crypto.randomUUID(),
        name: server.name?.trim() || "未命名服务器",
        baseUrl: sanitizeBaseUrl(server.baseUrl || ""),
        username: server.username?.trim() || "",
        password: server.password || "",
        defaultPath: normalizePath(server.defaultPath || "/"),
        paths: Array.isArray(server.paths)
          ? server.paths
              .map((path) => ({
                id: path.id || crypto.randomUUID(),
                label: path.label?.trim() || "下载目录",
                value: normalizePath(path.value || "/")
              }))
              .filter((path, index, arr) => arr.findIndex((p) => p.id === path.id) === index)
          : []
      };
      sanitized.defaultPath = stripBasePath(sanitized.baseUrl, sanitized.defaultPath);
      sanitized.paths = sanitized.paths.map((path) => ({
        ...path,
        value: stripBasePath(sanitized.baseUrl, path.value)
      }));
      return sanitized;
    })
    .filter((server, index, arr) => arr.findIndex((s) => s.id === server.id) === index);

  if (!next.webdavServers.length) {
    next.webdavServers = clone(defaultSettings.webdavServers);
    next.lastSelectedServerId = next.webdavServers[0].id;
  }

  if (!next.lastSelectedServerId) {
    next.lastSelectedServerId = next.webdavServers[0].id;
  }

  const serverMap = new Map(next.webdavServers.map((server) => [server.id, server]));
  const validServerIds = new Set(serverMap.keys());
  const sanitizedPaths = {};
  Object.entries(next.lastSelectedPaths || {}).forEach(([serverId, value]) => {
    if (!validServerIds.has(serverId)) return;
    const server = serverMap.get(serverId);
    sanitizedPaths[serverId] = stripBasePath(server?.baseUrl, value || "/");
  });
  if (!sanitizedPaths[next.lastSelectedServerId]) {
    sanitizedPaths[next.lastSelectedServerId] =
      next.webdavServers.find((server) => server.id === next.lastSelectedServerId)?.defaultPath || "/";
  }
  next.lastSelectedPaths = sanitizedPaths;

  return next;
}

function sanitizeFloatingButtonPosition(value) {
  if (!value || typeof value !== "object") {
    return { ...defaultSettings.floatingButtonPosition };
  }
  const x = Number(value.x);
  const y = Number(value.y);
  return {
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null
  };
}

export async function getSettings() {
  const raw = await new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(result[STORAGE_KEY]);
    });
  });

  if (!raw) {
    await saveSettings(defaultSettings);
    return clone(defaultSettings);
  }

  return sanitizeSettings(raw);
}

export async function saveSettings(settings) {
  const sanitized = sanitizeSettings(settings);
  await new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: sanitized }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve();
    });
  });
  return sanitized;
}

export async function setLastSelectedServer(serverId) {
  const settings = await getSettings();
  settings.lastSelectedServerId = serverId;
  await saveSettings(settings);
  return settings;
}

export async function setLastSelectedPath(serverId, path) {
  if (!serverId) return null;
  const settings = await getSettings();
  if (!settings.lastSelectedPaths || typeof settings.lastSelectedPaths !== "object") {
    settings.lastSelectedPaths = {};
  }
  settings.lastSelectedPaths[serverId] = normalizePath(path || "/");
  await saveSettings(settings);
  return settings;
}

export async function setFloatingButtonPosition(position) {
  const settings = await getSettings();
  settings.floatingButtonPosition = sanitizeFloatingButtonPosition(position);
  await saveSettings(settings);
  return settings.floatingButtonPosition;
}

export function onSettingsChanged(handler) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    handler(changes[STORAGE_KEY].newValue ? sanitizeSettings(changes[STORAGE_KEY].newValue) : clone(defaultSettings));
  });
}

export async function recordHistoryStart(payload) {
  const settings = await getSettings();
  const entry = {
    id: crypto.randomUUID(),
    jobId: payload.jobId || crypto.randomUUID(),
    title: payload.title || "未命名漫画",
    total: payload.total || 0,
    success: 0,
    failed: 0,
    status: "processing",
    serverName: payload.serverName || "",
    targetPath: normalizePath(payload.targetPath || "/"),
    rule: payload.rule || settings.downloadRule || DEFAULT_RULE,
    line: payload.line || "",
    pageUrl: payload.pageUrl || payload.line || "",
    startedAt: payload.startedAt || Date.now(),
    finishedAt: null,
    message: "",
    error: "",
    files: Array.isArray(payload.items || payload.files)
      ? (payload.items || payload.files).map((item, index) => ({
          id: item?.historyId || item?.id || `${Date.now()}-${index}`,
          label: item?.label || `${payload.title || "下载项"} ${index + 1}`,
          status: "pending",
          fileName: item?.fileName || "",
          remotePath: item?.remotePath || "",
          error: "",
          startedAt: null,
          finishedAt: null
        }))
      : []
  };
  settings.history.unshift(entry);
  settings.history = settings.history.slice(0, HISTORY_LIMIT);
  await saveSettings(settings);
  return entry;
}

export async function updateHistoryEntry(jobId, patch) {
  if (!jobId) return null;
  const settings = await getSettings();
  const index = settings.history.findIndex((entry) => entry.jobId === jobId || entry.id === jobId);
  if (index < 0) return null;
  const current = settings.history[index];
  let nextEntry;
  if (typeof patch === "function") {
    const draft = patch({ ...current }) || current;
    nextEntry = { ...current, ...draft };
  } else {
    nextEntry = { ...current, ...patch };
  }
  settings.history[index] = sanitizeHistoryEntry(nextEntry);
  await saveSettings(settings);
  return settings.history[index];
}

export async function deleteHistoryEntries(ids = []) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const settings = await getSettings();
  const idSet = new Set(ids);
  settings.history = settings.history.filter((entry) => !idSet.has(entry.jobId) && !idSet.has(entry.id));
  await saveSettings(settings);
  return settings.history;
}

function padNumber(num) {
  return String(num).padStart(2, "0");
}

export function applyRuleTemplate(template, context = {}) {
  const now = context.date instanceof Date ? context.date : new Date();
  const baseTemplate = (template || DEFAULT_RULE).trim() || DEFAULT_RULE;
  let includesExt = baseTemplate.includes("{ext}");
  const tokens = {
    title: normalizeRuleSegments(context.title || "漫画"),
    filename: normalizeRuleSegments(context.filename || "download"),
    year: String(now.getFullYear()),
    month: padNumber(now.getMonth() + 1),
    day: padNumber(now.getDate()),
    hour: padNumber(now.getHours()),
    min: padNumber(now.getMinutes()),
    ext: (context.ext || "zip").replace(/[^a-zA-Z0-9]/g, "")
  };

  const replaced = baseTemplate.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === "ext") {
      includesExt = true;
    }
    return tokens[key] ?? "";
  });

  const normalized = normalizeRuleSegments(replaced) || tokens.filename || "download";

  return { path: normalized, includesExt };
}

export async function setServerCollapsed(serverId, collapsed) {
  if (!serverId) return null;
  const settings = await getSettings();
  if (!settings.collapsedServers || typeof settings.collapsedServers !== "object") {
    settings.collapsedServers = {};
  }
  settings.collapsedServers[serverId] = !!collapsed;
  await saveSettings(settings);
  return settings;
}

export async function setServerTestStatus(serverId, status) {
  if (!serverId) return null;
  const settings = await getSettings();
  if (!settings.serverTestStatus || typeof settings.serverTestStatus !== "object") {
    settings.serverTestStatus = {};
  }
  if (status === null) {
    delete settings.serverTestStatus[serverId];
  } else {
    settings.serverTestStatus[serverId] = {
      success: !!status.success,
      message: status.message || "",
      testedAt: status.testedAt || Date.now()
    };
  }
  await saveSettings(settings);
  return settings;
}
