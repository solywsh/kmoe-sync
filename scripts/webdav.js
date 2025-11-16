import { normalizePath } from "./storage.js";

const PROPFIND_BODY =
  `<?xml version="1.0" encoding="UTF-8"?>` +
  '<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>';

function toBasicAuth(user, pass) {
  const raw = `${user || ""}:${pass || ""}`;
  const encoded = btoa(unescape(encodeURIComponent(raw)));
  return `Basic ${encoded}`;
}

function encodePathname(rawPath = "/") {
  if (!rawPath || rawPath === "/") return "/";
  const trailing = rawPath.endsWith("/");
  const chunks = rawPath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part));
  return `/${chunks.join("/")}${trailing ? "/" : ""}`;
}

function getServerBasePath(server) {
  if (!server?.baseUrl) return "/";
  const candidate = server.baseUrl;
  const attempt = (value) => {
    const url = new URL(value);
    return normalizePath(url.pathname || "/");
  };
  try {
    return attempt(candidate);
  } catch (error) {
    try {
      if (!/^https?:\/\//i.test(candidate)) {
        return attempt(`http://${candidate}`);
      }
    } catch (innerError) {
      /* noop */
    }
    return "/";
  }
}

function applyServerBasePath(server, relativePath = "/") {
  const basePath = getServerBasePath(server);
  const normalizedRelative = normalizePath(relativePath || "/");
  if (normalizedRelative === "/") {
    return basePath || "/";
  }
  if (!basePath || basePath === "/") {
    return normalizedRelative;
  }
  return normalizePath(`${basePath}${normalizedRelative}`);
}

export function relativeToServerRoot(server, rawPath = "/") {
  const basePath = getServerBasePath(server);
  const normalized = normalizePath(rawPath || "/");
  if (!basePath || basePath === "/") {
    return normalized;
  }
  if (normalized === basePath) {
    return "/";
  }
  if (normalized.startsWith(`${basePath}/`)) {
    const sliced = normalized.slice(basePath.length);
    if (!sliced) return "/";
    return sliced.startsWith("/") ? sliced : `/${sliced}`;
  }
  return normalized;
}

function buildUrl(server, rawPath = "/") {
  if (!server?.baseUrl) throw new Error("尚未设置服务器地址");
  const base = server.baseUrl.replace(/\/$/, "");
  const path = encodePathname(rawPath);
  return `${base}${path}`;
}

export async function webDavFetch(server, rawPath = "/", options = {}) {
  const url = buildUrl(server, rawPath || "/");
  const headers = new Headers(options.headers || {});
  headers.set("Accept", headers.get("Accept") || "*/*");
  if (server.username || server.password) {
    headers.set("Authorization", toBasicAuth(server.username, server.password));
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
    credentials: "omit",
    cache: "no-store",
    redirect: "follow"
  });

  return response;
}

function getElements(root, localName) {
  if (typeof root.getElementsByTagNameNS === "function") {
    const list = Array.from(root.getElementsByTagNameNS("*", localName));
    if (list.length) return list;
  }
  return Array.from(root.getElementsByTagName(localName));
}

function parseMultiStatus(xmlText, currentPath) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  let nodes = getElements(doc, "response");
  const entries = nodes
    .map((node) => {
      const hrefNode = getElements(node, "href")[0];
      const href = hrefNode?.textContent || "";
      const absolute = new URL(href, "http://placeholder");
      const pathname = decodeURIComponent(absolute.pathname);
      const displayNameNode = getElements(node, "displayname")[0];
      const sizeNode = getElements(node, "getcontentlength")[0];
      const modifiedNode = getElements(node, "getlastmodified")[0];
      const typeNode = getElements(node, "resourcetype")[0];
      const isCollection = !!getElements(typeNode || document.createElement("div"), "collection")[0];
      return {
        href: pathname,
        name: displayNameNode?.textContent || pathname.split("/").filter(Boolean).pop() || "/",
        isCollection,
        size: sizeNode ? parseInt(sizeNode.textContent, 10) || 0 : 0,
        lastModified: modifiedNode?.textContent || null
      };
    });

  if (entries.length && normalizePath(entries[0].href) === normalizePath(currentPath)) {
    entries.shift();
  }

  return entries;
}

export async function listDirectory(server, path = "/") {
  const normalized = normalizePath(path);
  const target = normalized === "/" ? "/" : `${normalized}/`;
  const response = await webDavFetch(server, target, {
    method: "PROPFIND",
    headers: {
      Depth: "1",
      "Content-Type": "application/xml; charset=utf-8"
    },
    body: PROPFIND_BODY
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("验证失败，请检查账号密码");
  }

  if (response.status >= 400) {
    throw new Error(`WebDAV 服务器返回 ${response.status}`);
  }

  const xml = await response.text();
  const comparePath = applyServerBasePath(server, normalized);
  const entries = parseMultiStatus(xml, comparePath);
  return entries.map((entry) => ({
    ...entry,
    href: relativeToServerRoot(server, entry.href)
  }));
}

export async function testConnection(server) {
  const response = await webDavFetch(server, server.defaultPath || "/", {
    method: "PROPFIND",
    headers: {
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8"
    },
    body: PROPFIND_BODY
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("验证失败");
  }

  if (response.status >= 400 && response.status !== 207) {
    throw new Error(`WebDAV 服务器返回 ${response.status}`);
  }

  return true;
}

export async function ensureDirectory(server, dirPath) {
  const normalized = normalizePath(dirPath);
  if (normalized === "/") return;
  const segments = normalized.split("/").filter(Boolean);
  let current = "";

  for (const segment of segments) {
    current += `/${segment}`;
    const probe = await webDavFetch(server, `${current}/`, {
      method: "PROPFIND",
      headers: { Depth: "0" },
      body: PROPFIND_BODY
    });

    if (probe.status === 404) {
      const mk = await webDavFetch(server, `${current}/`, { method: "MKCOL" });
      if (!mk.ok && mk.status !== 405) {
        throw new Error(`创建 ${current} 失败 (${mk.status})`);
      }
    } else if (probe.status >= 400 && probe.status !== 207) {
      throw new Error(`无法读取 ${current} (${probe.status})`);
    }
  }
}

export async function uploadFile(server, remotePath, data, contentType = "application/octet-stream") {
  const response = await webDavFetch(server, remotePath, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: data
  });

  if (!response.ok) {
    throw new Error(`上传失败 (${response.status})`);
  }

  return true;
}
