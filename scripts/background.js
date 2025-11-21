import {
  applyRuleTemplate,
  getSettings,
  normalizePath,
  recordHistoryStart,
  updateHistoryEntry
} from "./storage.js";
import { ensureDirectory, uploadFile } from "./webdav.js";

function resolveHistoryFileId(item, index) {
  if (item?.historyId) return item.historyId;
  if (item?.id) return item.id;
  if (item?.label) return `${item.label}-${index}`;
  return `file-${index}`;
}

async function patchHistoryFile(jobId, fileId, patch = {}, fallbackLabel = "下载项") {
  if (!jobId || !fileId) return;
  await updateHistoryEntry(jobId, (entry) => {
    const files = Array.isArray(entry.files) ? entry.files.slice() : [];
    const index = files.findIndex((file) => file.id === fileId);
    const base =
      index >= 0
        ? files[index]
        : {
            id: fileId,
            label: fallbackLabel,
            status: "pending",
            fileName: "",
            remotePath: "",
            error: "",
            startedAt: null,
            finishedAt: null
          };
    files[index >= 0 ? index : files.length] = {
      ...base,
      ...patch
    };
    return { ...entry, files };
  });
}

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "KMOE_DOWNLOAD_REQUEST") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "无法取得当前标签页" });
      return false;
    }
    sendResponse({ ok: true });
    startDownloadJob(message.payload, tabId);
    return false;
  }
  if (message?.type === "KMOE_OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

async function startDownloadJob(payload, tabId) {
  try {
    await handleDownloadRequest(payload, tabId);
  } catch (error) {
    await sendProgress(tabId, {
      jobId: payload?.jobId,
      status: "fatal",
      label: payload?.bookTitle || "下载任务",
      info: error?.message || "任务失败"
    });
    if (payload?.jobId) {
      await updateHistoryEntry(payload.jobId, {
        status: "failed",
        success: 0,
        failed: payload?.items?.length || 0,
        finishedAt: Date.now(),
        message: error?.message || "任务失败",
        error: error?.message || ""
      });
    }
  }
}

async function handleDownloadRequest(payload, tabId) {
  if (!tabId) throw new Error("无法取得当前标签页");
  if (!payload?.items?.length) throw new Error("没有选择任何项目");

  const settings = await getSettings();
  const server = settings.webdavServers.find((item) => item.id === payload.serverId);
  if (!server) throw new Error("找不到对应的 WebDAV 服务器");

  await ensureConfiguredDownloadDirectories(server, [payload.targetPath]);
  const targetDir = normalizePath(payload.targetPath || server.defaultPath || "/");
  await ensureDirectory(server, targetDir);
  const jobItems = Array.isArray(payload.items) ? payload.items : [];

  const historyEntry = await recordHistoryStart({
    jobId: payload.jobId,
    title: payload.bookTitle,
    total: jobItems.length,
    serverName: server.name,
    targetPath: targetDir,
    rule: payload.rule || settings.downloadRule,
    line: payload.lineOrigin,
    pageUrl: payload.pageUrl,
    items: jobItems
  });

  const summary = { success: 0, failed: 0, total: jobItems.length };
  for (let index = 0; index < jobItems.length; index += 1) {
    const item = jobItems[index];
    const fileId = resolveHistoryFileId(item, index);
    const label = item?.label || `文件 ${index + 1}`;
    try {
      if (!item.downloadUrl) {
        throw new Error("缺少下载链接");
      }
      const startedAt = Date.now();
      await patchHistoryFile(historyEntry.jobId, fileId, { status: "downloading", startedAt, error: "" }, label);
      await sendProgress(tabId, { jobId: payload.jobId, status: "downloading", label: item.label });

      // Download with progress tracking
      const downloadResult = await requestContentDownload(
        item.downloadUrl,
        item.referer || payload.pageUrl || payload.lineOrigin || payload.downloadOrigin,
        async (progress) => {
          await patchHistoryFile(historyEntry.jobId, fileId, {
            downloadSize: progress.downloaded,
            downloadTotal: progress.total,
            downloadSpeed: progress.speed
          }, label);
          await sendProgress(tabId, {
            jobId: payload.jobId,
            status: "downloading",
            label: item.label,
            progress: {
              downloaded: progress.downloaded,
              total: progress.total,
              speed: progress.speed,
              type: "download"
            }
          });
        }
      );

      await patchHistoryFile(historyEntry.jobId, fileId, {
        status: "uploading",
        downloadSize: downloadResult.buffer.byteLength,
        downloadTotal: downloadResult.buffer.byteLength,
        downloadSpeed: 0
      }, label);
      await sendProgress(tabId, { jobId: payload.jobId, status: "uploading", label: item.label });
      const preferredExt = mapFormatToExt(payload.fileFormat);
      const fileInfo = buildFileInfo(
        downloadResult.contentDisposition,
        payload.bookTitle,
        item.label,
        preferredExt
      );
      const activeRule = payload.rule || settings.downloadRule;
      const ruleResult = applyRuleTemplate(activeRule, {
        title: payload.bookTitle,
        filename: fileInfo.baseName,
        ext: fileInfo.ext,
        date: new Date()
      });
      let relativePath = ruleResult.path;
      if (!ruleResult.includesExt) {
        relativePath = `${relativePath}.${fileInfo.ext}`;
      }
      const relativeDir = relativePath.split("/").slice(0, -1).join("/");
      if (relativeDir) {
        await ensureDirectory(server, joinRemotePath(targetDir, relativeDir));
      }
      const remotePath = joinRemotePath(targetDir, relativePath);
      const contentType = downloadResult.contentType || "application/octet-stream";

      // Upload with progress tracking
      await uploadFile(server, remotePath, downloadResult.buffer, contentType, async (progress) => {
        await patchHistoryFile(historyEntry.jobId, fileId, {
          uploadSize: progress.uploaded,
          uploadTotal: progress.total,
          uploadSpeed: progress.speed
        }, label);
        await sendProgress(tabId, {
          jobId: payload.jobId,
          status: "uploading",
          label: item.label,
          progress: {
            uploaded: progress.uploaded,
            total: progress.total,
            speed: progress.speed,
            type: "upload"
          }
        });
      });

      summary.success += 1;
      await patchHistoryFile(
        historyEntry.jobId,
        fileId,
        {
          status: "success",
          finishedAt: Date.now(),
          fileName: fileInfo.fileName,
          remotePath,
          error: ""
        },
        label
      );
      await updateHistoryEntry(historyEntry.jobId, {
        success: summary.success,
        failed: summary.failed,
        message: `已完成 ${summary.success + summary.failed}/${summary.total}`
      });
    } catch (error) {
      summary.failed += 1;
      await sendProgress(tabId, {
        jobId: payload.jobId,
        status: "error",
        label: item.label,
        info: error.message
      });
      await patchHistoryFile(
        historyEntry.jobId,
        fileId,
        {
          status: "error",
          finishedAt: Date.now(),
          error: error.message || "发生未知错误"
        },
        label
      );
      await updateHistoryEntry(historyEntry.jobId, {
        success: summary.success,
        failed: summary.failed,
        message: `已完成 ${summary.success + summary.failed}/${summary.total}`
      });
    }
  }

  await sendProgress(tabId, {
    jobId: payload.jobId,
    status: "finished",
    info: summary
  });

  await updateHistoryEntry(historyEntry.jobId, {
    status: summary.failed ? "failed" : "success",
    success: summary.success,
    failed: summary.failed,
    finishedAt: Date.now(),
    message: summary.failed ? "部分文件上传失败" : "全部文件已同步",
    error: summary.failed ? "部分文件存在错误" : ""
  });
}

function buildFileInfo(header, bookTitle = "manga", label = "item", preferredExt = "zip") {
  const parsed = parseContentDisposition(header);
  const safeExt = (preferredExt || "zip").replace(/[^a-zA-Z0-9]/g, "") || "zip";
  const fallback = `${slugify(bookTitle)}-${slugify(label)}`;
  const name = (parsed || fallback).trim();
  const hasExt = /\.[a-zA-Z0-9]+$/.test(name);
  const finalName = hasExt ? name : `${name}.${safeExt}`;
  const ext = finalName.split(".").pop() || safeExt;
  const baseName = finalName.slice(0, -(ext.length + 1)) || "download";
  return { fileName: finalName, baseName, ext };
}

function parseContentDisposition(header) {
  if (!header) return null;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch (err) {
      return utfMatch[1];
    }
  }
  const quoted = /filename="?([^";]+)"?/i.exec(header);
  return quoted ? quoted[1] : null;
}

function slugify(text) {
  return (text || "").trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 80) || "download";
}

function mapFormatToExt(formatCode) {
  const code = Number(formatCode);
  if (code === 1) return "mobi";
  if (code === 2) return "epub";
  return "zip";
}

function joinRemotePath(baseDir, relative) {
  const directory = normalizePath(baseDir);
  if (!relative) return directory;
  const cleanRelative = relative.replace(/^\/+/g, "");
  return directory === "/" ? `/${cleanRelative}` : `${directory}/${cleanRelative}`;
}

async function ensureConfiguredDownloadDirectories(server, extraPaths = []) {
  const paths = new Set();
  const defaultPath = normalizePath(server.defaultPath || "/");
  if (defaultPath !== "/") {
    paths.add(defaultPath);
  }
  (server.paths || []).forEach((path) => {
    const normalized = normalizePath(path.value || "/");
    if (normalized !== "/") {
      paths.add(normalized);
    }
  });
  (extraPaths || []).forEach((path) => {
    const normalized = normalizePath(path || "/");
    if (normalized !== "/") {
      paths.add(normalized);
    }
  });

  for (const dir of paths) {
    await ensureDirectory(server, dir);
  }
}

async function requestContentDownload(url, referer, progressCallback) {
  const headers = new Headers({
    Accept: "application/octet-stream",
    "X-KM-FROM": "kb_http_down"
  });
  if (referer) {
    headers.set("Referer", referer);
  }
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      redirect: "follow",
      credentials: "omit"
    });
  } catch (error) {
    throw new Error(error?.message ? `请求文件失败：${error.message}` : "请求文件失败");
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body || !progressCallback) {
    // Fallback to simple download without progress
    const buffer = await response.arrayBuffer();
    return {
      buffer,
      contentType: response.headers.get("content-type") || "application/octet-stream",
      contentDisposition: response.headers.get("content-disposition") || null
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let downloaded = 0;
  let lastUpdate = Date.now();
  let lastDownloaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloaded += value.length;

      // Calculate speed and send progress update
      const now = Date.now();
      const timeDiff = (now - lastUpdate) / 1000; // seconds
      if (timeDiff >= 0.5) { // Update every 0.5 seconds
        const byteDiff = downloaded - lastDownloaded;
        const speed = timeDiff > 0 ? byteDiff / timeDiff : 0;

        await progressCallback({
          downloaded,
          total,
          speed
        });

        lastUpdate = now;
        lastDownloaded = downloaded;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Final progress update
  if (progressCallback) {
    await progressCallback({
      downloaded,
      total,
      speed: 0
    });
  }

  // Combine chunks into single buffer
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  return {
    buffer: buffer.buffer,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    contentDisposition: response.headers.get("content-disposition") || null
  };
}

function sendProgress(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "KMOE_DOWNLOAD_PROGRESS", payload }, () => {
      if (chrome.runtime.lastError) {
        console.warn("Failed to send progress:", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}
