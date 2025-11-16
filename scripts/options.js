import {
  applyRuleTemplate,
  createEmptyServer,
  defaultSettings,
  deleteHistoryEntries,
  getSettings,
  normalizePath,
  saveSettings
} from "./storage.js";
import { listDirectory, testConnection } from "./webdav.js";

const state = {
  settings: null,
  explorerLoading: false,
  browserTarget: null,
  activeSection: "history",
  historySelection: new Set(),
  historyQuery: "",
  historyExpanded: new Set()
};

const refs = {
  navButtons: document.querySelectorAll("[data-nav]"),
  sections: document.querySelectorAll("[data-section]"),
  feedback: document.getElementById("feedback"),
  historyList: document.getElementById("historyList"),
  historySearch: document.getElementById("historySearch"),
  refreshHistory: document.getElementById("refreshHistory"),
  deleteHistory: document.getElementById("deleteHistory"),
  addServerBtn: document.getElementById("addServerBtn"),
  serverList: document.getElementById("serverList"),
  explorerServer: document.getElementById("explorerServer"),
  explorerDropdown: document.querySelector('[data-dropdown="explorer-server"]'),
  explorerPath: document.getElementById("explorerPath"),
  explorerGo: document.getElementById("explorerGo"),
  explorerApply: document.getElementById("explorerApply"),
  explorerList: document.getElementById("explorerList"),
  browserTargetLabel: document.getElementById("browserTargetLabel"),
  ruleTemplate: document.getElementById("ruleTemplate"),
  rulePreview: document.getElementById("rulePreview"),
  saveRule: document.getElementById("saveRule"),
  resetRule: document.getElementById("resetRule")
};

function showFeedback(message, tone = "success") {
  if (!refs.feedback) return;
  refs.feedback.hidden = false;
  refs.feedback.textContent = message;
  refs.feedback.classList.remove("border-slate-300", "border-slate-500", "bg-white", "bg-slate-100", "text-slate-800", "text-slate-600");
  if (tone === "danger") {
    refs.feedback.classList.add("border-slate-500", "bg-slate-100", "text-slate-600");
  } else {
    refs.feedback.classList.add("border-slate-300", "bg-white", "text-slate-800");
  }
  clearTimeout(refs.feedback._timer);
  refs.feedback._timer = setTimeout(() => {
    refs.feedback.hidden = true;
  }, 4000);
}

function switchSection(section) {
  state.activeSection = section;
  refs.sections.forEach((el) => {
    const hidden = el.dataset.section !== section;
    el.classList.toggle("hidden", hidden);
    el.toggleAttribute("hidden", hidden);
  });
  refs.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === section);
  });
}

function renderHistory() {
  if (!state.settings) return;
  const list = refs.historyList;
  if (!list) return;
  list.innerHTML = "";
  const rawHistory = state.settings.history || [];
  const query = (state.historyQuery || "").trim().toLowerCase();
  const history = query ? rawHistory.filter((entry) => matchesHistoryQuery(entry, query)) : rawHistory;
  const availableIds = new Set(rawHistory.map((entry) => entry.jobId));
  Array.from(state.historySelection).forEach((id) => {
    if (!availableIds.has(id)) {
      state.historySelection.delete(id);
    }
  });
  Array.from(state.historyExpanded).forEach((id) => {
    if (!availableIds.has(id)) {
      state.historyExpanded.delete(id);
    }
  });
  if (refs.historySearch && refs.historySearch.value !== state.historyQuery) {
    refs.historySearch.value = state.historyQuery;
  }
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500";
    empty.textContent = state.historyQuery ? `未找到与“${state.historyQuery}”匹配的记录。` : "暂无下载记录。";
    list.appendChild(empty);
    updateHistorySelectionState();
    return;
  }

  history.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-soft";
    const statusColors = {
      success: "text-white bg-slate-900",
      failed: "text-white bg-rose-500",
      processing: "text-slate-700 bg-slate-200"
    };
    const badge = statusColors[entry.status] || statusColors.processing;
    const completed = (entry.success || 0) + (entry.failed || 0);
    const progressText = entry.status === "processing" ? `<p class="text-xs text-blue-600">进度：<span class="font-semibold">${completed}</span> / ${entry.total}</p>` : "";
    const expanded = state.historyExpanded.has(entry.jobId);
    const titleHtml = entry.pageUrl
      ? `<a href="${entry.pageUrl}" target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-slate-700 hover:text-slate-900">${entry.title}</a>`
      : `<span class="text-sm font-semibold text-slate-700">${entry.title}</span>`;
    card.innerHTML = `
      <div class="flex gap-3">
        <label class="mt-1 flex items-start">
          <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-slate-900" data-history-select value="${entry.jobId}" />
        </label>
        <div class="flex-1 space-y-3">
          <div class="flex flex-wrap items-start gap-2 sm:items-center sm:justify-between">
            <div>
              ${titleHtml}
              <p class="text-xs text-slate-500">${entry.serverName || "--"} · ${formatDate(entry.startedAt)}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badge}">${renderStatus(entry.status)}</span>
              <button type="button" class="btn-text text-xs font-semibold text-red-500 border border-red-200" data-history-delete>删除</button>
            </div>
          </div>
          <div class="grid gap-3 text-xs text-slate-500 sm:grid-cols-2">
            <p>目标路径：<span class="font-medium text-slate-700">${entry.targetPath}</span></p>
            <p>下载项：<span class="font-medium text-slate-700">${entry.total}</span> · 成功 <span class="font-medium text-slate-800">${entry.success}</span> · 失败 <span class="font-medium text-slate-500">${entry.failed}</span></p>
            <p>规则：<code class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">${entry.rule}</code></p>
            <div class="space-y-1">
              ${progressText}
              <p>${entry.message || (entry.status === "processing" ? "正在处理" : "-")}</p>
            </div>
          </div>
          <div class="mt-3 border-t border-slate-100 pt-3">
            <button type="button" class="btn-text text-xs font-semibold text-slate-700" data-history-toggle aria-expanded="${expanded}">
              <span data-toggle-label>${expanded ? "收起详情" : "展开详情"}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 transition" data-toggle-icon style="transform: ${expanded ? "rotate(180deg)" : "rotate(0deg)"};">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div class="mt-3 ${expanded ? "" : "hidden"}" data-history-details>
              ${renderHistoryDetails(entry)}
            </div>
          </div>
        </div>
      </div>
    `;
    const checkbox = card.querySelector("[data-history-select]");
    checkbox.checked = state.historySelection.has(entry.jobId);
    checkbox.addEventListener("change", (event) => {
      if (event.target.checked) {
        state.historySelection.add(entry.jobId);
      } else {
        state.historySelection.delete(entry.jobId);
      }
      updateHistorySelectionState();
    });
    card.querySelector("[data-history-delete]").addEventListener("click", async () => {
      await deleteHistoryEntries([entry.jobId]);
      state.historySelection.delete(entry.jobId);
      await bootstrap();
      showFeedback("已删除 1 条记录", "danger");
    });
    const toggleButton = card.querySelector("[data-history-toggle]");
    const details = card.querySelector("[data-history-details]");
    const toggleLabel = card.querySelector("[data-toggle-label]");
    const toggleIcon = card.querySelector("[data-toggle-icon]");
    if (toggleButton && details) {
      toggleButton.addEventListener("click", () => {
        const isExpanded = state.historyExpanded.has(entry.jobId);
        if (isExpanded) {
          state.historyExpanded.delete(entry.jobId);
        } else {
          state.historyExpanded.add(entry.jobId);
        }
        const nextExpanded = !isExpanded;
        toggleButton.setAttribute("aria-expanded", String(nextExpanded));
        details.classList.toggle("hidden", !nextExpanded);
        if (toggleLabel) {
          toggleLabel.textContent = nextExpanded ? "收起详情" : "展开详情";
        }
        if (toggleIcon) {
          toggleIcon.style.transform = nextExpanded ? "rotate(180deg)" : "rotate(0deg)";
        }
      });
    }
    list.appendChild(card);
  });
  updateHistorySelectionState();
}

function renderServers() {
  if (!state.settings) return;
  refs.serverList.innerHTML = "";
  state.settings.webdavServers.forEach((server) => {
    refs.serverList.appendChild(createServerCard(server));
  });
}

function updateHistorySelectionState() {
  if (!refs.deleteHistory) return;
  const count = state.historySelection.size;
  refs.deleteHistory.disabled = count === 0;
  refs.deleteHistory.textContent = count ? `删除所选 (${count})` : "删除所选";
}

function renderRuleForm() {
  if (!refs.ruleTemplate || !refs.rulePreview || !state.settings) return;
  refs.ruleTemplate.value = state.settings.downloadRule || defaultSettings.downloadRule;
  updateRulePreview();
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderStatus(status) {
  if (status === "success") return "已完成";
  if (status === "failed") return "失败";
  return "进行中";
}

function renderHistoryDetails(entry) {
  const finished = entry.finishedAt ? formatDate(entry.finishedAt) : "尚未完成";
  const errorText = entry.error || "";
  const pageLink = entry.pageUrl
    ? `<a href="${entry.pageUrl}" target="_blank" rel="noopener noreferrer" class="text-slate-700 underline decoration-dotted">查看原页面</a>`
    : "无";
  return `
    <div class="grid gap-3 text-xs text-slate-600 sm:grid-cols-2">
      <p>完成时间：<span class="font-medium text-slate-800">${finished}</span></p>
      <p>保存路径：<code class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">${entry.targetPath}</code></p>
      <p>来源页面：<span>${pageLink}</span></p>
      <p>错误信息：<span class="${errorText ? "text-rose-500 font-semibold" : "text-slate-500"}">${errorText || "无"}</span></p>
    </div>
    <div class="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
      ${renderHistoryFiles(entry.files)}
    </div>
  `;
}

function renderHistoryFiles(files = []) {
  if (!Array.isArray(files) || !files.length) {
    return '<p class="text-xs text-slate-500">暂无文件明细</p>';
  }
  return `
    <ul class="space-y-2">
      ${files
        .map((file) => {
          const meta = getFileStatusMeta(file.status);
          return `
            <li class="rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-slate-800">${file.label || file.fileName || "下载项"}</p>
                  <p class="text-xs text-slate-500">${file.fileName || "等待生成文件"}</p>
                </div>
                <span class="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${meta.badge}">${meta.icon}${meta.text}</span>
              </div>
              <div class="mt-2 space-y-1 text-[11px] text-slate-500">
                ${file.remotePath ? `<p>路径：<code class="rounded bg-slate-100/60 px-1 py-0.5 text-slate-600">${file.remotePath}</code></p>` : ""}
                ${file.finishedAt ? `<p>完成：${formatDate(file.finishedAt)}</p>` : ""}
                ${file.error ? `<p class="text-rose-500">错误：${file.error}</p>` : ""}
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

function getFileStatusMeta(status) {
  const icon = (color, path) => `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 ${color}">
      ${path}
    </svg>
  `;
  const meta = {
    success: {
      text: "已完成",
      badge: "bg-emerald-50 text-emerald-600",
      icon: icon("text-emerald-600", "<path d='M5 13l4 4L19 7' />")
    },
    uploading: {
      text: "上传中",
      badge: "bg-blue-50 text-blue-600",
      icon: icon("text-blue-500", "<path d='M12 19V5' /><path d='M5 12l7-7 7 7' />")
    },
    downloading: {
      text: "下载中",
      badge: "bg-blue-50 text-blue-600",
      icon: icon("text-blue-500", "<path d='M12 5v14' /><path d='M19 12l-7 7-7-7' />")
    },
    error: {
      text: "失败",
      badge: "bg-rose-50 text-rose-600",
      icon: icon("text-rose-500", "<path d='M18 6 6 18' /><path d='m6 6 12 12' />")
    },
    pending: {
      text: "等待中",
      badge: "bg-slate-100 text-slate-600",
      icon: icon("text-slate-500", "<circle cx='12' cy='12' r='9' /><path d='M12 7v5l3 3' />")
    }
  };
  return meta[status] || meta.pending;
}

function matchesHistoryQuery(entry, query) {
  if (!query) return true;
  const fields = [entry.title, entry.targetPath, entry.serverName, entry.pageUrl];
  fields.push(...(Array.isArray(entry.files) ? entry.files.flatMap((file) => [file.label, file.fileName, file.remotePath]) : []));
  return fields.some((field) => (field || "").toLowerCase().includes(query));
}

function createServerCard(server) {
  const card = document.createElement("form");
  card.className = "rounded-2xl border border-slate-100 bg-white/90 p-5 shadow-soft space-y-4";
  card.dataset.serverId = server.id;
  const bodyId = `server-body-${server.id}`;
  card.innerHTML = `
    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div class="flex-1">
        <label class="text-xs text-slate-500">服务器名称</label>
        <input name="name" class="input mt-1" value="${server.name || ""}" />
      </div>
      <div class="flex items-center gap-3 text-sm text-slate-500">
        <span>状态：<span data-status class="font-semibold text-slate-800">未测试</span></span>
        <button type="button" class="btn-text text-slate-500" data-toggle aria-expanded="true">折叠</button>
      </div>
    </div>
    <div class="space-y-4" data-body id="${bodyId}">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-sm text-slate-600">WebDAV 地址
          <input name="baseUrl" class="input mt-1" placeholder="http://127.0.0.1:5005" value="${server.baseUrl || ""}" required />
        </label>
        <label class="text-sm text-slate-600">默认目录
          <input name="defaultPath" class="input mt-1 font-mono text-xs" placeholder="/manga" value="${server.defaultPath || "/"}" />
        </label>
        <label class="text-sm text-slate-600">用户名
          <input name="username" class="input mt-1" value="${server.username || ""}" />
        </label>
        <label class="text-sm text-slate-600">密码
          <input type="password" name="password" class="input mt-1" value="${server.password || ""}" />
        </label>
      </div>
      <section class="space-y-3" data-path-section>
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-slate-700">可选目录</p>
            <p class="text-xs text-slate-500">在下载面板里可直接选择预设路径。</p>
          </div>
          <button type="button" data-add-path class="btn-secondary">+ 添加</button>
        </div>
        <div class="space-y-3" data-paths></div>
      </section>
      <div class="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" data-delete class="btn-secondary">删除该服务器</button>
        <div class="flex flex-wrap gap-3">
          <button type="button" data-test class="btn-secondary">测试连接</button>
          <button type="submit" class="btn-primary">保存</button>
        </div>
      </div>
    </div>
  `;

  const pathsContainer = card.querySelector("[data-paths]");
  if (server.paths?.length) {
    server.paths.forEach((path) => addPathRow(pathsContainer, path));
  } else {
    addPathRow(pathsContainer, { label: "默认", value: server.defaultPath || "/" });
  }

  card.addEventListener("submit", (event) => {
    event.preventDefault();
    persistServer(card);
  });
  card.querySelector("[data-test]").addEventListener("click", () => testServerConnection(card));
  card.querySelector("[data-delete]").addEventListener("click", () => deleteServer(server.id));
  card.querySelector("[data-add-path]").addEventListener("click", () => addPathRow(pathsContainer));
  card.querySelector("[data-toggle]").addEventListener("click", (event) => {
    event.preventDefault();
    const body = card.querySelector("[data-body]");
    const expanded = event.currentTarget.getAttribute("aria-expanded") === "true";
    event.currentTarget.setAttribute("aria-expanded", expanded ? "false" : "true");
    event.currentTarget.textContent = expanded ? "展开" : "折叠";
    body.classList.toggle("hidden", expanded);
  });

  return card;
}

function addPathRow(container, path = {}) {
  const template = document.getElementById("pathRowTemplate");
  const fragment = template.content.firstElementChild.cloneNode(true);
  fragment.dataset.pathId = path.id || crypto.randomUUID();
  fragment.querySelector("[data-path-label]").value = path.label || "";
  fragment.querySelector("[data-path-value]").value = path.value || "/";
  fragment.querySelector("[data-remove-path]").addEventListener("click", () => fragment.remove());
  fragment.querySelector("[data-open-browser]").addEventListener("click", () => openBrowserForInput(fragment.querySelector("[data-path-value]")));
  container.appendChild(fragment);
}

function extractServer(form) {
  const formData = new FormData(form);
  const server = {
    id: form.dataset.serverId,
    name: formData.get("name")?.toString().trim() || "未命名服务器",
    baseUrl: formData.get("baseUrl")?.toString().trim() || "",
    username: formData.get("username")?.toString().trim() || "",
    password: formData.get("password")?.toString() || "",
    defaultPath: normalizePath(formData.get("defaultPath")?.toString().trim() || "/"),
    paths: []
  };

  form.querySelectorAll("[data-path-row]").forEach((row) => {
    const label = row.querySelector("[data-path-label]").value;
    const value = row.querySelector("[data-path-value]").value;
    if (!label && !value) return;
    server.paths.push({
      id: row.dataset.pathId || crypto.randomUUID(),
      label: label || "下载目录",
      value: normalizePath(value || "/")
    });
  });

  return server;
}

async function persistServer(form) {
  const server = extractServer(form);
  const index = state.settings.webdavServers.findIndex((item) => item.id === server.id);
  if (index >= 0) {
    state.settings.webdavServers[index] = server;
  } else {
    state.settings.webdavServers.push(server);
  }
  await saveSettings(state.settings);
  await bootstrap();
  showFeedback(`“${server.name}”已保存`);
}

async function deleteServer(serverId) {
  if (!confirm("确定要删除该服务器？")) return;
  state.settings.webdavServers = state.settings.webdavServers.filter((server) => server.id !== serverId);
  await saveSettings(state.settings);
  await bootstrap();
  showFeedback("服务器已删除", "danger");
}

async function testServerConnection(form) {
  const server = extractServer(form);
  const status = form.querySelector("[data-status]");
  status.textContent = "测试中...";
  status.classList.remove("text-slate-900", "text-slate-600");
  status.classList.add("text-slate-600");
  try {
    await testConnection(server);
    status.textContent = "连接成功";
    status.classList.remove("text-slate-600");
    status.classList.add("text-slate-900");
  } catch (error) {
    status.textContent = error.message || "失败";
    status.classList.add("text-slate-600");
  }
}

function refreshExplorerOptions() {
  if (!refs.explorerServer || !state.settings || !refs.explorerDropdown) return;
  const panel = refs.explorerDropdown.querySelector("[data-dropdown-panel]");
  const label = refs.explorerDropdown.querySelector("[data-dropdown-label]");
  if (!panel || !label) return;
  panel.innerHTML = "";
  const options = state.settings.webdavServers.map((server) => ({
    value: server.id,
    label: server.name,
    description: server.baseUrl || ""
  }));
  const selectedId = refs.explorerServer.value || state.browserTarget?.server?.id || options[0]?.value || "";
  options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dropdown-option";
    button.dataset.dropdownOption = "true";
    button.dataset.value = option.value;
    button.innerHTML = `
      <span>${option.label}</span>
      ${option.description ? `<span class="text-xs text-slate-400">${option.description}</span>` : ""}
    `;
    panel.appendChild(button);
  });
  toggleExplorerDropdownDisabled(options.length === 0);
  label.textContent = options.find((item) => item.value === selectedId)?.label || "选择服务器";
  panel.querySelectorAll("[data-dropdown-option]").forEach((el) => {
    el.classList.toggle("active", el.dataset.value === selectedId);
  });
  panel.onclick = (event) => {
    const optionEl = event.target.closest("[data-dropdown-option]");
    if (!optionEl) return;
    event.preventDefault();
    const value = optionEl.dataset.value;
    label.textContent = options.find((item) => item.value === value)?.label || value;
    panel.querySelectorAll("[data-dropdown-option]").forEach((el) => {
      el.classList.toggle("active", el.dataset.value === value);
    });
    refs.explorerServer.value = value;
    resetBrowserTarget();
    loadExplorer("/");
    closeExplorerDropdown();
  };
  refs.explorerServer.value = selectedId;
  updateExplorerDropdownSelection(selectedId);
  refs.explorerApply.disabled = !state.browserTarget;
}

function setupExplorerDropdown() {
  const container = refs.explorerDropdown;
  if (!container) return;
  const toggle = container.querySelector("[data-dropdown-toggle]");
  const panel = container.querySelector("[data-dropdown-panel]");
  if (!toggle || !panel) return;
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    if (container.classList.contains("open")) {
      closeExplorerDropdown();
    } else {
      container.classList.add("open");
      panel.classList.remove("hidden");
    }
  });
  document.addEventListener("click", (event) => {
    if (!container.contains(event.target)) {
      closeExplorerDropdown();
    }
  });
}

function closeExplorerDropdown() {
  if (!refs.explorerDropdown) return;
  const panel = refs.explorerDropdown.querySelector("[data-dropdown-panel]");
  if (!panel) return;
  refs.explorerDropdown.classList.remove("open");
  panel.classList.add("hidden");
}

function toggleExplorerDropdownDisabled(disabled) {
  if (!refs.explorerDropdown) return;
  refs.explorerDropdown.classList.toggle("opacity-60", disabled);
  refs.explorerDropdown.classList.toggle("pointer-events-none", disabled);
}

function updateExplorerDropdownSelection(serverId) {
  if (!refs.explorerDropdown) return;
  const label = refs.explorerDropdown.querySelector("[data-dropdown-label]");
  const panel = refs.explorerDropdown.querySelector("[data-dropdown-panel]");
  const server = state.settings?.webdavServers.find((item) => item.id === serverId);
  if (label) {
    label.textContent = server?.name || "选择服务器";
  }
  if (panel) {
    panel.querySelectorAll("[data-dropdown-option]").forEach((el) => {
      el.classList.toggle("active", el.dataset.value === serverId);
    });
  }
}

function resetBrowserTarget() {
  state.browserTarget = null;
  refs.browserTargetLabel.textContent = "点击“浏览”按钮后，此处会锁定对应输入框。";
  refs.explorerApply.disabled = true;
}

function getExplorerServer() {
  if (state.browserTarget?.server) return state.browserTarget.server;
  const selectedId = refs.explorerServer.value;
  return state.settings.webdavServers.find((server) => server.id === selectedId) || null;
}

async function loadExplorer(pathInput) {
  if (state.explorerLoading) return;
  const server = getExplorerServer();
  if (!server) {
    refs.explorerList.innerHTML = '<div class="p-4 text-sm text-slate-600">请先创建服务器</div>';
    return;
  }
  const sourcePath = (pathInput ?? refs.explorerPath.value) || "/";
  const targetPath = normalizePath(sourcePath);
  refs.explorerPath.value = targetPath;
  refs.explorerList.innerHTML = '<div class="p-4 text-sm text-slate-500">加载中...</div>';
  state.explorerLoading = true;
  try {
    const entries = await listDirectory(server, targetPath);
    renderExplorerList(entries, targetPath);
  } catch (error) {
    refs.explorerList.innerHTML = `<div class="p-4 text-sm text-slate-600">${error.message}</div>`;
  } finally {
    state.explorerLoading = false;
  }
}

function renderExplorerList(entries, currentPath) {
  const fragment = document.createDocumentFragment();
  if (currentPath !== "/") {
    const upButton = document.createElement("button");
    upButton.type = "button";
    upButton.className = "flex w-full items-center justify-between border-b border-slate-100 px-4 py-2 text-left text-sm text-slate-600 hover:bg-slate-50";
    upButton.textContent = "← 返回上级";
    upButton.addEventListener("click", () => {
      const parent = normalizePath(currentPath).split("/").filter(Boolean);
      parent.pop();
      const next = parent.length ? `/${parent.join("/")}` : "/";
      refs.explorerPath.value = next;
      loadExplorer(next);
    });
    fragment.appendChild(upButton);
  }

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "p-4 text-sm text-slate-500";
    empty.textContent = "目录为空";
    fragment.appendChild(empty);
  } else {
    entries
      .sort((a, b) => Number(b.isCollection) - Number(a.isCollection))
      .forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "flex w-full items-center justify-between border-b border-slate-100 px-4 py-2 text-left text-sm hover:bg-slate-50";
        const name = entry.isCollection ? `${entry.name}/` : entry.name;
        button.innerHTML = `
          <div>
            <p class="font-mono text-sm text-slate-700">${name}</p>
            <p class="text-xs text-slate-400">${entry.isCollection ? "文件夹" : `${(entry.size / 1024 / 1024).toFixed(2)} MB`}</p>
          </div>
          <span class="text-xs text-slate-400">${entry.isCollection ? "进入" : "文件"}</span>
        `;

        if (entry.isCollection) {
          button.addEventListener("click", () => {
            let nextPath = entry.href.endsWith("/") ? entry.href.slice(0, -1) : entry.href;
            if (!nextPath) nextPath = "/";
            refs.explorerPath.value = nextPath;
            loadExplorer(nextPath);
          });
        } else {
          button.disabled = true;
        }

        fragment.appendChild(button);
      });
  }

  refs.explorerList.innerHTML = "";
  refs.explorerList.appendChild(fragment);
}

function openBrowserForInput(input) {
  const form = input.closest("form");
  if (!form) return;
  const server = extractServer(form);
  state.browserTarget = { server, input, label: input.closest("[data-path-row]")?.querySelector("[data-path-label]")?.value || "未命名" };
  refs.explorerServer.value = server.id;
  updateExplorerDropdownSelection(server.id);
  refs.explorerPath.value = input.value || server.defaultPath || "/";
  refs.browserTargetLabel.textContent = `当前字段：${server.name} › ${state.browserTarget.label}`;
  refs.explorerApply.disabled = false;
  loadExplorer(refs.explorerPath.value);
}

function applyExplorerPath() {
  if (!state.browserTarget) return;
  const path = normalizePath(refs.explorerPath.value || "/");
  state.browserTarget.input.value = path;
  refs.browserTargetLabel.textContent = `已填入：${path}`;
}

function updateRulePreview() {
  const template = refs.ruleTemplate.value || defaultSettings.downloadRule;
  const preview = applyRuleTemplate(template, {
    title: "示例漫画",
    filename: "卷001",
    ext: "zip",
    date: new Date()
  });
  const finalPath = preview.includesExt ? preview.path : `${preview.path}.zip`;
  refs.rulePreview.textContent = `预览路径：/根目录/${finalPath}`;
}

async function saveRuleTemplate() {
  if (!state.settings) return;
  state.settings.downloadRule = refs.ruleTemplate.value || defaultSettings.downloadRule;
  await saveSettings(state.settings);
  showFeedback("规则已保存");
}

async function resetRuleTemplate() {
  refs.ruleTemplate.value = defaultSettings.downloadRule;
  updateRulePreview();
  await saveRuleTemplate();
}

async function bootstrap() {
  state.settings = await getSettings();
  renderHistory();
  renderServers();
  refreshExplorerOptions();
  renderRuleForm();
  if (state.settings.webdavServers.length) {
    const initialServer = state.browserTarget?.server || state.settings.webdavServers[0];
    refs.explorerServer.value = initialServer.id;
    refs.explorerPath.value = initialServer.defaultPath || "/";
    loadExplorer(refs.explorerPath.value);
  } else {
    refs.explorerList.innerHTML = '<div class="p-4 text-sm text-slate-500">请先创建 WebDAV 服务器。</div>';
  }
  resetBrowserTarget();
  switchSection(state.activeSection);
}

setupExplorerDropdown();

refs.navButtons.forEach((button) => {
  button.addEventListener("click", () => switchSection(button.dataset.nav));
});

if (refs.refreshHistory) {
  refs.refreshHistory.addEventListener("click", async () => {
    await bootstrap();
    showFeedback("历史已刷新");
  });
}

if (refs.historySearch) {
  refs.historySearch.addEventListener("input", (event) => {
    state.historyQuery = event.target.value || "";
    renderHistory();
  });
}

if (refs.deleteHistory) {
  refs.deleteHistory.addEventListener("click", async (event) => {
    event.preventDefault();
    const ids = Array.from(state.historySelection);
    if (!ids.length) return;
    await deleteHistoryEntries(ids);
    state.historySelection.clear();
    await bootstrap();
    showFeedback(`已删除 ${ids.length} 条记录`, "danger");
  });
}

refs.addServerBtn.addEventListener("click", async () => {
  if (!state.settings) return;
  state.settings.webdavServers.unshift(createEmptyServer());
  await saveSettings(state.settings);
  await bootstrap();
  switchSection("servers");
  showFeedback("已添加新的服务器");
});

refs.explorerGo.addEventListener("click", (event) => {
  event.preventDefault();
  loadExplorer();
});
refs.explorerApply.addEventListener("click", applyExplorerPath);
// explorer dropdown interactions are handled via custom dropdown helpers
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.kmoeSyncSettings) {
    bootstrap();
  }
});

refs.ruleTemplate.addEventListener("input", updateRulePreview);
refs.saveRule.addEventListener("click", (event) => {
  event.preventDefault();
  saveRuleTemplate();
});
refs.resetRule.addEventListener("click", (event) => {
  event.preventDefault();
  resetRuleTemplate();
});

bootstrap();
