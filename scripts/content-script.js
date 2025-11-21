(async () => {
  if (window.top !== window) return;
  if (window.__KMOE_SYNC_ACTIVE__) return;
  window.__KMOE_SYNC_ACTIVE__ = true;

  const storageModule = await import(chrome.runtime.getURL("scripts/storage.js"));
  const {
    getSettings,
    onSettingsChanged,
    setLastSelectedServer,
    setLastSelectedPath,
    setFloatingButtonPosition,
    normalizePath,
    applyRuleTemplate,
    defaultSettings
  } = storageModule;

  const initialSettings = await getSettings();

  const state = {
    settings: initialSettings,
    defaultRule: initialSettings.downloadRule || defaultSettings.downloadRule,
    ruleTemplate: initialSettings.downloadRule || defaultSettings.downloadRule,
    selectedServerId: null,
    selectedPath: null,
    selectedLine: "auto",
    manga: null,
    groups: [],
    itemsById: new Map(),
    selectedItems: new Set(),
    collapsedGroups: new Set(),
    overlayOpen: false,
    menuOpen: false,
    jobId: null,
    jobActive: false,
    downloadOrigin: window.location.origin,
    fileFormat: 2,
    quotaAvailable: null,
    quotaUsed: null,
    applyFloatingButtonPosition: null
  };

  const LINE_OPTIONS = [
    { id: "auto", label: "自动 · 当前站点", origin: null, vip: 0 },
    { id: "kxx", label: "线路 A · kxx.moe", origin: "https://kxx.moe", vip: 1 },
    { id: "kxo", label: "线路 B · kxo.moe", origin: "https://kxo.moe", vip: 2 },
    { id: "mox", label: "线路 C · mox.moe", origin: "https://mox.moe", vip: 3 },
    { id: "koz", label: "线路 D · koz.moe", origin: "https://koz.moe", vip: 4 },
    { id: "kox", label: "线路 E · kox.moe", origin: "https://kox.moe", vip: 5 },
    { id: "kox", label: "线路 F · kzz.moe", origin: "https://kzz.moe", vip: 6 }
  ];
  const FORMAT_OPTIONS = [
    { id: "epub", label: "EPUB 格式", value: 2 },
    { id: "mobi", label: "MOBI 格式", value: 1 }
  ];

  const host = document.createElement("div");
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const tailwindLink = document.createElement("link");
  tailwindLink.rel = "stylesheet";
  tailwindLink.href = chrome.runtime.getURL("styles/tailwind.css");
  shadowRoot.appendChild(tailwindLink);

  const uiRoot = document.createElement("div");
  uiRoot.className = "pointer-events-none font-sans";
  shadowRoot.appendChild(uiRoot);

  uiRoot.innerHTML = `
    <div class="pointer-events-auto fixed bottom-6 right-6" id="kmoe-floating">
      <div class="flex flex-col items-center gap-3 text-white">
        <div id="kmoe-menu" class="absolute bottom-full left-1/2 z-10 mb-3 hidden -translate-x-1/2 rounded-3xl border border-white/20 bg-white/20 p-2 text-white shadow-soft backdrop-blur">
          <button data-action="open-panel" class="floating-action" title="打开下载面板" aria-label="打开下载面板">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
              <path d="M12 4v10" />
              <path d="M8 10l4 4 4-4" />
              <path d="M5 20h14" />
            </svg>
          </button>
          <button data-action="open-options" class="floating-action mt-2" title="打开设置" aria-label="打开设置">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
        <button id="kmoe-floating-button" class="floating-trigger" aria-label="Kmoe Sync">
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-6 w-6">
            <rect x="5" y="5" width="5" height="5" rx="1" />
            <rect x="14" y="5" width="5" height="5" rx="1" />
            <rect x="5" y="14" width="5" height="5" rx="1" />
            <rect x="14" y="14" width="5" height="5" rx="1" />
          </svg>
        </button>
      </div>
    </div>
    <div id="kmoe-modal" class="pointer-events-none fixed inset-0 hidden">
      <div class="absolute inset-0 bg-black/50" data-close></div>
      <div class="pointer-events-auto relative mx-auto my-8 w-[68vw] max-w-2xl max-h-[85vh] overflow-y-auto no-scrollbar rounded-[28px] border border-white/80 bg-white/95 p-5 text-slate-900 shadow-soft sm:p-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div id="kmoe-cover" class="h-32 w-24 rounded-2xl border border-slate-100 bg-slate-100"></div>
          <div class="flex-1 space-y-1.5">
            <p class="text-xs uppercase tracking-[0.4em] text-slate-400">Kmoe Sync</p>
            <h2 id="kmoe-title" class="text-2xl font-semibold">Kmoe Sync</h2>
            <p id="kmoe-meta" class="text-xs text-slate-500"></p>
            <p id="kmoe-quota" class="text-xs text-slate-500"></p>
          </div>
          <button class="btn-secondary h-9 shrink-0 self-start px-4 text-sm" data-close>关闭</button>
        </div>

        <div class="mt-5 space-y-5">
          <section class="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
            <div class="flex flex-wrap items-center gap-3">
              <div class="flex-1">
                <p class="text-sm font-semibold">WebDAV 服务器</p>
                <p class="text-xs text-slate-500">选择目标服务器与目录</p>
              </div>
              <button id="kmoe-open-options" class="btn-secondary px-3 py-1 text-xs">管理设置</button>
            </div>
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="dropdown" data-dropdown="server">
                <button type="button" class="dropdown-toggle" data-dropdown-toggle>
                  <span class="truncate" data-dropdown-label>选择服务器</span>
                  <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true">
                    <path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <div class="dropdown-panel hidden" data-dropdown-panel></div>
              </div>
              <div class="dropdown" data-dropdown="path">
                <button type="button" class="dropdown-toggle" data-dropdown-toggle>
                  <span class="truncate" data-dropdown-label>选择目录</span>
                  <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true">
                    <path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
                <div class="dropdown-panel hidden" data-dropdown-panel></div>
              </div>
            </div>
            <input id="kmoe-path-input" class="input mt-3 font-mono text-xs" placeholder="/library/manga" />
            <div class="mt-3 space-y-2">
              <div class="flex items-center justify-between gap-3">
                <label class="text-xs font-semibold text-slate-500">下载规则</label>
                <button id="kmoe-rule-reset" class="btn-text px-2 py-1 text-[11px] text-slate-600">恢复默认</button>
              </div>
              <input id="kmoe-rule-input" class="input font-mono text-xs" placeholder="{title}/{filename}" />
              <p id="kmoe-rule-preview" class="text-[11px] text-slate-500">当前任务路径预览</p>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
            <div class="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center">
              <div class="flex-1 min-w-[220px] space-y-2">
                <label class="text-xs font-semibold text-slate-500">下载线路</label>
                <div class="dropdown" data-dropdown="line">
                  <button type="button" class="dropdown-toggle" data-dropdown-toggle>
                    <span class="truncate" data-dropdown-label>选择线路</span>
                    <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <div class="dropdown-panel hidden" data-dropdown-panel></div>
                </div>
              </div>
              <div class="flex-1 min-w-[220px] space-y-2">
                <label class="text-xs font-semibold text-slate-500">文件格式</label>
                <div class="dropdown" data-dropdown="format">
                  <button type="button" class="dropdown-toggle" data-dropdown-toggle>
                    <span class="truncate" data-dropdown-label>选择格式</span>
                    <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true">
                      <path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>
                  <div class="dropdown-panel hidden" data-dropdown-panel></div>
                </div>
              </div>
              <div class="flex-1 min-w-[220px] space-y-2">
                <p class="text-xs font-semibold text-slate-500">任务状态</p>
                <div class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600" id="kmoe-status-text">等待操作</div>
              </div>
              <div class="flex flex-col gap-2">
                <button id="kmoe-start" class="btn-primary">开始下载</button>
                <button class="btn-secondary" data-close>取消</button>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-200/80 bg-white/85 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold">章节列表</p>
                <p class="text-xs text-slate-500">单行本 / 短篇 / 连载</p>
              </div>
              <div class="text-xs text-slate-500" id="kmoe-selection-count">尚未选择章节</div>
            </div>
            <div id="kmoe-groups" class="no-scrollbar mt-4 max-h-[45vh] space-y-3 overflow-y-auto pr-1"></div>
          </section>

          <section class="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
            <p class="text-xs font-semibold text-slate-500">任务日志</p>
            <div id="kmoe-log" data-empty="true" class="no-scrollbar mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white/60 p-3 text-xs text-slate-600 min-h-[120px] flex items-center justify-center text-center">
              等待任务开始
            </div>
          </section>
        </div>
      </div>
    </div>
  `;

  const elements = {
    container: uiRoot.querySelector("#kmoe-floating"),
    floatingButton: uiRoot.querySelector("#kmoe-floating-button"),
    menu: uiRoot.querySelector("#kmoe-menu"),
    modal: uiRoot.querySelector("#kmoe-modal"),
    cover: uiRoot.querySelector("#kmoe-cover"),
    title: uiRoot.querySelector("#kmoe-title"),
    meta: uiRoot.querySelector("#kmoe-meta"),
    quota: uiRoot.querySelector("#kmoe-quota"),
    pathInput: uiRoot.querySelector("#kmoe-path-input"),
    ruleInput: uiRoot.querySelector("#kmoe-rule-input"),
    rulePreview: uiRoot.querySelector("#kmoe-rule-preview"),
    ruleReset: uiRoot.querySelector("#kmoe-rule-reset"),
    groups: uiRoot.querySelector("#kmoe-groups"),
    selectionCount: uiRoot.querySelector("#kmoe-selection-count"),
    statusText: uiRoot.querySelector("#kmoe-status-text"),
    startButton: uiRoot.querySelector("#kmoe-start"),
    log: uiRoot.querySelector("#kmoe-log"),
    openOptionsButton: uiRoot.querySelector("#kmoe-open-options"),
    dropdownServer: uiRoot.querySelector('[data-dropdown="server"]'),
    dropdownPath: uiRoot.querySelector('[data-dropdown="path"]'),
    dropdownLine: uiRoot.querySelector('[data-dropdown="line"]'),
    dropdownFormat: uiRoot.querySelector('[data-dropdown="format"]')
  };
  const menuButtons = uiRoot.querySelectorAll("#kmoe-menu button");

  const dropdownRegistry = [];
  let coverLoaderToken = 0;

  function setCoverImage(url) {
    if (!elements.cover) return;
    const token = ++coverLoaderToken;
    if (!url) {
      elements.cover.style.backgroundImage = "none";
      elements.cover.removeAttribute("aria-label");
      setCoverPlaceholder(true);
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (token !== coverLoaderToken) return;
      elements.cover.style.backgroundImage = `url("${url}")`;
      elements.cover.setAttribute("aria-label", "封面");
      setCoverPlaceholder(false);
    };
    image.onerror = () => {
      if (token !== coverLoaderToken) return;
      elements.cover.style.backgroundImage = "none";
      elements.cover.removeAttribute("aria-label");
      setCoverPlaceholder(true);
    };
    image.src = url;
  }

  function createDropdown(container, { placeholder = "请选择", onSelect } = {}) {
    if (!container) return null;
    const toggle = container.querySelector("[data-dropdown-toggle]");
    const labelEl = container.querySelector("[data-dropdown-label]");
    const panel = container.querySelector("[data-dropdown-panel]");
    if (!toggle || !labelEl || !panel) return null;
    let options = [];
    let currentValue = null;
    let disabled = false;

    function setLabel(text) {
      labelEl.textContent = text || placeholder;
    }

    function close() {
      panel.classList.add("hidden");
      container.classList.remove("open");
    }

    function open() {
      if (disabled) return;
      dropdownRegistry.forEach((instance) => {
        if (instance !== api) instance.close();
      });
      panel.classList.remove("hidden");
      container.classList.add("open");
    }

    function applySelection(value, silent = false) {
      currentValue = value ?? null;
      const option = options.find((item) => item.value === currentValue) || null;
      setLabel(option?.label || value || placeholder);
      panel.querySelectorAll("[data-dropdown-option]").forEach((el) => {
        el.classList.toggle("active", el.dataset.value === currentValue);
      });
      if (!silent && option) {
        onSelect?.(option.value, option);
      }
    }

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      if (disabled) return;
      if (container.classList.contains("open")) {
        close();
      } else {
        open();
      }
    });

    panel.addEventListener("click", (event) => {
      const optionEl = event.target.closest("[data-dropdown-option]");
      if (!optionEl) return;
      event.preventDefault();
      applySelection(optionEl.dataset.value, false);
      close();
    });

    document.addEventListener("click", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const inDropdown =
        container.contains(event.target) ||
        path.includes(container) ||
        event.target === container;
      if (!inDropdown) {
        close();
      }
    });

    function setOptions(list = [], value = null) {
      options = Array.isArray(list) ? list : [];
      panel.innerHTML = "";
      if (!options.length) {
        const empty = document.createElement("div");
        empty.className = "px-4 py-2 text-xs text-slate-400";
        empty.textContent = "暂无选项";
        panel.appendChild(empty);
        disabled = true;
        toggle.disabled = true;
        toggle.classList.add("cursor-not-allowed", "opacity-60");
        setLabel(placeholder);
        currentValue = null;
        return;
      }
      disabled = false;
      toggle.disabled = false;
      toggle.classList.remove("cursor-not-allowed", "opacity-60");
      options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dropdown-option";
        button.dataset.dropdownOption = "true";
        button.dataset.value = option.value;
        button.innerHTML = `
          <span class="truncate flex-1 min-w-0 text-left">${option.label}</span>
          ${option.description ? `<span class="text-xs text-slate-400 shrink-0 truncate max-w-[40%] text-left" title="${option.description}">${option.description}</span>` : ""}
        `;
        panel.appendChild(button);
      });
      applySelection(value ?? currentValue ?? options[0].value, true);
    }

    function setValue(value) {
      applySelection(value, true);
    }

    const api = { setOptions, setValue, close, open };
    dropdownRegistry.push(api);
    return api;
  }

  const dropdowns = {
    server: createDropdown(elements.dropdownServer, {
      placeholder: "选择服务器",
      onSelect: (value) => handleServerChange(value)
    }),
    path: createDropdown(elements.dropdownPath, {
      placeholder: "选择目录",
      onSelect: (value) => handlePathPresetChange(value)
    }),
    line: createDropdown(elements.dropdownLine, {
      placeholder: "选择线路",
      onSelect: (value) => handleLineChange(value)
    }),
    format: createDropdown(elements.dropdownFormat, {
      placeholder: "选择格式",
      onSelect: (value) => handleFormatChange(value)
    })
  };

  function setCoverPlaceholder(active) {
    if (!elements.cover) return;
    elements.cover.classList.toggle("cover-placeholder", active);
    elements.cover.dataset.placeholder = active ? "暂无封面" : "";
  }

  function refreshServerState() {
    const servers = state.settings.webdavServers || [];
    if (!servers.length) {
      dropdowns.server?.setOptions([], null);
      dropdowns.path?.setOptions([], null);
      elements.pathInput.value = "/";
      state.selectedServerId = null;
      state.selectedPath = "/";
      updateStartButton();
      return;
    }
    if (!state.selectedServerId || !servers.find((s) => s.id === state.selectedServerId)) {
      state.selectedServerId = state.settings.lastSelectedServerId || servers[0].id;
    }

    dropdowns.server?.setOptions(
      servers.map((server) => ({
        value: server.id,
        label: server.name,
        description: server.baseUrl || ""
      })),
      state.selectedServerId
    );

    const currentServer = servers.find((server) => server.id === state.selectedServerId);
    const pathConfigs = currentServer?.paths?.length
      ? currentServer.paths
      : [{ id: "default", label: "默认", value: currentServer?.defaultPath || "/" }];
    const normalizedPaths = pathConfigs.map((path) => ({
      value: normalizePath(path.value || "/"),
      label: path.label || "目录",
      description: normalizePath(path.value || "/")
    }));
    const savedPath = state.settings?.lastSelectedPaths?.[currentServer?.id];
    const targetPath = state.selectedPath ?? savedPath ?? currentServer?.defaultPath ?? "/";
    state.selectedPath = normalizePath(targetPath);
    elements.pathInput.value = state.selectedPath;
    dropdowns.path?.setOptions(normalizedPaths, state.selectedPath);
    updateStartButton();
  }

  function refreshLineOptions() {
    if (!LINE_OPTIONS.find((line) => line.id === state.selectedLine)) {
      state.selectedLine = LINE_OPTIONS[0]?.id || "auto";
    }
    dropdowns.line?.setOptions(
      LINE_OPTIONS.map((line) => ({ value: line.id, label: line.label, description: line.origin || "" })),
      state.selectedLine
    );
  }

  function refreshFormatOptions() {
    const available = FORMAT_OPTIONS.length ? FORMAT_OPTIONS : [{ value: 2, label: "EPUB", id: "epub" }];
    const current = Number.isFinite(state.fileFormat) ? state.fileFormat : available[0]?.value;
    state.fileFormat = current;
    dropdowns.format?.setOptions(
      available.map((format) => ({
        value: String(format.value),
        label: format.label,
        description: format.id?.toUpperCase() || ""
      })),
      String(current ?? available[0]?.value ?? 2)
    );
  }

  function refreshRuleTemplate() {
    const template = state.ruleTemplate || state.settings.downloadRule || defaultSettings.downloadRule;
    state.ruleTemplate = template;
    state.defaultRule = state.settings.downloadRule || defaultSettings.downloadRule;
    if (elements.ruleInput) {
      elements.ruleInput.value = template;
    }
    refreshRulePreview();
  }

  function refreshRulePreview() {
    if (!elements.rulePreview) return;
    const template = (elements.ruleInput?.value || state.defaultRule || defaultSettings.downloadRule).trim();
    const sampleExt = state.fileFormat === 1 ? "mobi" : "epub";
    const preview = applyRuleTemplate(template, {
      title: state.manga?.title || "示例漫画",
      filename: "章节001",
      ext: sampleExt,
      date: new Date()
    });
    const finalPath = preview.includesExt ? preview.path : `${preview.path}.${sampleExt}`;
    elements.rulePreview.textContent = `当前任务路径预览（不影响默认规则）：/${finalPath}`;
  }

  function updateMangaHeader() {
    if (!state.manga) {
      elements.title.textContent = "未检测到漫画";
      elements.meta.textContent = "请在漫画详情页打开浮窗";
      setCoverImage(null);
      return;
    }
    setCoverImage(state.manga.cover || "");
    elements.title.textContent = state.manga.title;
    elements.meta.textContent = `${state.manga.author || ""} · ${state.manga.totalItems} 个下载项`;
  }

  function renderGroups() {
    elements.groups.innerHTML = "";
    state.selectedItems.clear();
    const validKeys = new Set(state.groups.map((group) => group.key));
    Array.from(state.collapsedGroups).forEach((key) => {
      if (!validKeys.has(key)) {
        state.collapsedGroups.delete(key);
      }
    });
    if (!state.groups.length) {
      elements.groups.innerHTML = '<p class="text-sm text-slate-500">此页面没有可下载的卷/话。</p>';
      updateSelectionSummary();
      return;
    }

    state.groups.forEach((group) => {
      const card = document.createElement("div");
      card.className = "rounded-2xl border border-slate-200/80 bg-white/80 p-3";
      card.dataset.group = group.key;
      const collapsed = state.collapsedGroups.has(group.key);
      card.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-lg font-semibold">${group.label}</p>
            <p class="text-xs text-slate-500">${group.items.length} 个项目</p>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <button class="btn-icon" data-toggle-group aria-expanded="${!collapsed}" aria-label="折叠 ${group.label}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="h-5 w-5 transition" data-toggle-icon style="transform: ${collapsed ? "rotate(-90deg)" : "rotate(0deg)"};">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <button class="btn-secondary" data-select-all>全选</button>
            <button class="btn-secondary" data-clear>清除</button>
          </div>
        </div>
        <div class="mt-3 ${collapsed ? "hidden" : ""}" data-group-body>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-list></div>
        </div>
      `;
      const list = card.querySelector("[data-list]");
      group.items.forEach((item) => {
        const entry = document.createElement("label");
        entry.className = "flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm";
        entry.innerHTML = `
          <div>
            <p class="font-semibold">${item.label}</p>
            <p class="text-xs text-slate-500">${item.sizeLabel || "未知大小"} · ${item.pages || 0} 页</p>
          </div>
          <input type="checkbox" data-item-id="${item.id}" class="h-4 w-4 rounded border-slate-300 text-slate-900" />
        `;
        list.appendChild(entry);
      });

      card.querySelector("[data-select-all]").addEventListener("click", () => toggleGroup(group.key, true));
      card.querySelector("[data-clear]").addEventListener("click", () => toggleGroup(group.key, false));
      card.querySelector("[data-toggle-group]").addEventListener("click", () => toggleGroupCollapse(card, group.key));
      elements.groups.appendChild(card);
    });

    elements.groups.querySelectorAll("input[data-item-id]").forEach((checkbox) => {
      checkbox.addEventListener("change", (event) => {
        const itemId = event.target.dataset.itemId;
        if (event.target.checked) {
          state.selectedItems.add(itemId);
        } else {
          state.selectedItems.delete(itemId);
        }
        updateSelectionSummary();
      });
    });
    updateSelectionSummary();
  }

  function toggleGroup(groupKey, selectAll) {
    const checkboxes = elements.groups.querySelectorAll(`[data-group="${groupKey}"] input[data-item-id]`);
    checkboxes.forEach((input) => {
      input.checked = selectAll;
      const itemId = input.dataset.itemId;
      if (selectAll) {
        state.selectedItems.add(itemId);
      } else {
        state.selectedItems.delete(itemId);
      }
    });
    updateSelectionSummary();
  }

  function toggleGroupCollapse(card, groupKey) {
    const body = card.querySelector("[data-group-body]");
    const icon = card.querySelector("[data-toggle-icon]");
    const toggleBtn = card.querySelector("[data-toggle-group]");
    const shouldCollapse = body && !body.classList.contains("hidden");
    if (body) {
      body.classList.toggle("hidden", shouldCollapse);
    }
    if (icon) {
      icon.style.transform = shouldCollapse ? "rotate(-90deg)" : "rotate(0deg)";
    }
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-expanded", (!shouldCollapse).toString());
    }
    if (shouldCollapse) {
      state.collapsedGroups.add(groupKey);
    } else {
      state.collapsedGroups.delete(groupKey);
    }
  }

  function updateSelectionSummary() {
    const count = state.selectedItems.size;
    const totalSize = calculateSelectedQuota();
    if (!count) {
      elements.selectionCount.textContent = "尚未选择章节";
      elements.statusText.textContent = "等待操作";
    } else {
      elements.selectionCount.textContent = `已选 ${count} 项 · 约 ${formatQuota(totalSize)}`;
      elements.statusText.textContent = `准备下载 ${count} 个文件`;
    }
    updateStartButton();
    updateQuotaDisplay(totalSize);
  }

  function calculateSelectedQuota() {
    return Array.from(state.selectedItems).reduce((sum, id) => {
      const item = state.itemsById.get(id);
      if (!item) return sum;
      return sum + (item.quotaCost ?? item.sizeMB ?? 0);
    }, 0);
  }

  function updateQuotaDisplay(precomputedCost) {
    if (!elements.quota) return;
    const hasAvailable = typeof state.quotaAvailable === "number" && !Number.isNaN(state.quotaAvailable);
    const hasUsed = typeof state.quotaUsed === "number" && !Number.isNaN(state.quotaUsed);
    const cost = typeof precomputedCost === "number" ? precomputedCost : calculateSelectedQuota();
    if (!hasAvailable && !hasUsed) {
      elements.quota.textContent = `额度：选中消耗 ${formatQuota(cost)}`;
      return;
    }
    const parts = [];
    if (hasAvailable) {
      parts.push(`剩余 ${formatQuota(state.quotaAvailable)}`);
    }
    if (hasUsed) {
      parts.push(`已用 ${formatQuota(state.quotaUsed)}`);
    }
    parts.push(`选中消耗 ${formatQuota(cost)}`);
    if (hasAvailable) {
      const after = Math.max(state.quotaAvailable - cost, 0);
      parts.push(`预计剩余 ${formatQuota(after)}`);
    }
    elements.quota.textContent = `额度：${parts.join(" · ")}`;
  }

  function formatQuota(value) {
    const normalized = Number(value) || 0;
    if (normalized >= 1000) {
      return `${(normalized / 1000).toFixed(1)}G`;
    }
    if (normalized >= 100) {
      return `${normalized.toFixed(0)}M`;
    }
    if (normalized >= 10) {
      return `${normalized.toFixed(1)}M`;
    }
    return `${normalized.toFixed(2)}M`;
  }

  function updateStartButton() {
    const disabled = !state.selectedServerId || !state.selectedItems.size || state.jobActive;
    elements.startButton.disabled = disabled;
    elements.startButton.textContent = state.jobActive ? "下载中..." : `开始下载 (${state.selectedItems.size})`;
  }

  function appendLog(message, tone = "info") {
    const entry = document.createElement("div");
    const color = tone === "error" ? "text-slate-700" : tone === "success" ? "text-slate-900" : "text-slate-600";
    entry.className = `py-1 ${color}`;
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    if (elements.log.dataset.empty === "true") {
      elements.log.dataset.empty = "false";
      elements.log.innerHTML = "";
      elements.log.classList.remove("items-center", "justify-center", "text-center");
      elements.log.classList.add("items-start", "text-left", "flex", "flex-col");
    }
    elements.log.appendChild(entry);
    elements.log.scrollTop = elements.log.scrollHeight;
  }

  function toggleMenu(force) {
    const open = typeof force === "boolean" ? force : !state.menuOpen;
    state.menuOpen = open;
    elements.menu.classList.toggle("hidden", !open);
  }

  function toggleModal(forceOpen) {
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !state.overlayOpen;
    state.overlayOpen = shouldOpen;
    elements.modal.classList.toggle("hidden", !shouldOpen);
    elements.modal.classList.toggle("pointer-events-none", !shouldOpen);
    if (shouldOpen) {
      elements.statusText.textContent = state.selectedItems.size ? `准备下载 ${state.selectedItems.size} 项` : "等待操作";
    }
  }

  function normalizeGroupLabel(label) {
    const value = (label || "其他").trim();
    if (value.includes("單行") || value.includes("单行")) return "单行本";
    if (value.includes("短篇")) return "短篇";
    if (value.includes("話") || value.includes("话") || value.includes("連載")) return "连载话";
    return value;
  }

  function normalizeSizeValue(raw) {
    const numeric = parseFloat(raw) || 0;
    if (!numeric) return 0;
    if (numeric > 2048) {
      return numeric / 1024;
    }
    return numeric;
  }

  function formatSizeLabel(sizeMB) {
    if (!sizeMB) return "未知大小";
    if (sizeMB >= 1024) {
      return `${(sizeMB / 1024).toFixed(2)} GB`;
    }
    if (sizeMB >= 0.1) {
      return `${sizeMB.toFixed(1)} MB`;
    }
    return `${Math.max(sizeMB * 1024, 1).toFixed(0)} KB`;
  }

  function buildDownloadPath(prefix, id, suffix) {
    const rawPrefix = typeof prefix === "string" && prefix ? prefix : "/";
    const rawSuffix = typeof suffix === "string" && suffix ? suffix : "/0/";
    const normalizedSuffix = rawSuffix.startsWith("/") ? rawSuffix : `/${rawSuffix}`;
    if (/^https?:\/\//i.test(rawPrefix)) {
      const base = rawPrefix.endsWith("/") ? rawPrefix : `${rawPrefix}/`;
      const url = new URL(base);
      const prefixPath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
      const combinedPath = `${prefixPath}${id}${normalizedSuffix}`.replace(/\/{2,}/g, "/");
      url.pathname = combinedPath;
      return { path: url.toString(), absolute: true };
    }
    const normalizedPrefix = rawPrefix.startsWith("/") ? rawPrefix : `/${rawPrefix}`;
    const baseDir = normalizedPrefix.endsWith("/") ? normalizedPrefix : `${normalizedPrefix}/`;
    const safePrefix = baseDir.replace(/\/{2,}/g, "/");
    const relativePath = `${safePrefix}${id}${normalizedSuffix}`.replace(/\/{2,}/g, "/");
    return { path: relativePath, absolute: false };
  }

  function handleServerChange(serverId) {
    if (!serverId) return;
    state.selectedServerId = serverId;
    const servers = state.settings?.webdavServers || [];
    const currentServer = servers.find((server) => server.id === serverId);
    const savedPath = state.settings?.lastSelectedPaths?.[serverId];
    state.selectedPath = normalizePath(savedPath || currentServer?.defaultPath || "/");
    elements.pathInput.value = state.selectedPath;
    dropdowns.path?.setValue(state.selectedPath);
    setLastSelectedServer(serverId).catch(() => {});
    persistSelectedPath();
    refreshServerState();
  }

  function handlePathPresetChange(value) {
    state.selectedPath = normalizePath(value || "/");
    elements.pathInput.value = state.selectedPath;
    updateStartButton();
    persistSelectedPath();
  }

  function handlePathInputChange() {
    state.selectedPath = normalizePath(elements.pathInput.value || "/");
    dropdowns.path?.setValue(state.selectedPath);
    updateStartButton();
    persistSelectedPath();
  }

  function persistSelectedPath() {
    if (!state.selectedServerId) return;
    if (state.settings?.lastSelectedPaths) {
      state.settings.lastSelectedPaths[state.selectedServerId] = state.selectedPath;
    }
    setLastSelectedPath(state.selectedServerId, state.selectedPath).catch(() => {});
  }

  function handleLineChange(value) {
    state.selectedLine = value || "auto";
  }

  function handleFormatChange(value) {
    const parsed = Number(value);
    state.fileFormat = Number.isFinite(parsed) ? parsed : FORMAT_OPTIONS[0]?.value || 2;
    updateItemSizesByFormat();
    renderGroups();
    refreshRulePreview();
  }

  function updateItemSizesByFormat() {
    if (!state.itemsById) return;
    const isMobi = state.fileFormat === 1;
    state.itemsById.forEach((item) => {
      const correctSize = isMobi
        ? item.mobiSize || item.fallbackSize
        : item.epubSize || item.fallbackSize;
      item.sizeMB = correctSize;
      item.sizeLabel = correctSize ? formatSizeLabel(correctSize) : "未知大小";
      item.quotaCost = correctSize;
    });
  }

  async function startDownload() {
    if (!state.selectedServerId || !state.selectedItems.size || state.jobActive) return;
    const currentServer = state.settings.webdavServers.find((server) => server.id === state.selectedServerId);
    if (!currentServer) {
      appendLog("找不到选中的 WebDAV 服务器", "error");
      return;
    }
    const selectedLine = LINE_OPTIONS.find((line) => line.id === state.selectedLine);
    const baseOrigin = selectedLine?.origin || state.downloadOrigin || window.location.origin;
    const lineCode = typeof selectedLine?.vip === "number" ? selectedLine.vip : 0;
    const items = Array.from(state.selectedItems).map((id) => {
      const item = state.itemsById.get(id);
      return {
        id: item.id,
        label: item.label,
        downloadPath: item.downloadPath,
        absoluteUrl: item.absoluteUrl
      };
    });
    const jobId = `job-${Date.now()}`;
    state.jobId = jobId;
    state.jobActive = true;
    updateStartButton();
    appendLog(`开始下载 ${items.length} 个项目`, "info");
    let preparedItems;
    try {
      preparedItems = await prepareDownloadItems(items, lineCode);
    } catch (error) {
      appendLog(error?.message || "获取下载链接失败", "error");
      state.jobActive = false;
      updateStartButton();
      return;
    }
    try {
      chrome.runtime.sendMessage({
        type: "KMOE_DOWNLOAD_REQUEST",
        payload: {
          jobId,
          bookId: state.manga?.bookId,
          bookTitle: state.manga?.title,
          serverId: state.selectedServerId,
          targetPath: state.selectedPath,
          lineOrigin: baseOrigin,
          lineCode,
          fileFormat: state.fileFormat,
          downloadOrigin: state.downloadOrigin,
          pageUrl: window.location.href,
          rule: state.ruleTemplate || state.defaultRule || defaultSettings.downloadRule,
          items: preparedItems
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError.message);
        }
      });
    } catch (error) {
      appendLog(error?.message || "扩展通信失败，请刷新页面后重试", "error");
      state.jobActive = false;
      updateStartButton();
    }
  }

  function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond < 1) return "0 B/s";
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let value = bytesPerSecond;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  function formatProgress(current, total) {
    if (!total) return "未知大小";
    const units = ["B", "KB", "MB", "GB"];
    let currentValue = current;
    let totalValue = total;
    let unitIndex = 0;
    while (totalValue >= 1024 && unitIndex < units.length - 1) {
      currentValue /= 1024;
      totalValue /= 1024;
      unitIndex++;
    }
    const percentage = total > 0 ? ((current / total) * 100).toFixed(1) : 0;
    return `${currentValue.toFixed(2)}/${totalValue.toFixed(2)} ${units[unitIndex]} (${percentage}%)`;
  }

  function handleProgressMessage(message) {
    if (message?.jobId !== state.jobId) return;
    const { status, label, info, fatal, progress } = message;

    if (status === "downloading") {
      if (progress && progress.type === "download") {
        const speedText = formatSpeed(progress.speed);
        const progressText = formatProgress(progress.downloaded, progress.total);
        appendLog(`下载中 ${label} - ${progressText} - ${speedText}`, "info");
        elements.statusText.textContent = `下载: ${label} | ${progressText} | ${speedText}`;
      } else {
        appendLog(`正在下载 ${label}`, "info");
        elements.statusText.textContent = `正在下载: ${label}`;
      }
    } else if (status === "uploading") {
      if (progress && progress.type === "upload") {
        const speedText = formatSpeed(progress.speed);
        const progressText = formatProgress(progress.uploaded, progress.total);
        appendLog(`上传中 ${label} - ${progressText} - ${speedText}`, "info");
        elements.statusText.textContent = `上传: ${label} | ${progressText} | ${speedText}`;
      } else {
        appendLog(`上传到 WebDAV：${label}`, "info");
        elements.statusText.textContent = `上传到 WebDAV: ${label}`;
      }
    } else if (status === "error") {
      appendLog(`${label} 失败：${info}`, "error");
      elements.statusText.textContent = `错误: ${label}`;
      if (fatal) {
        state.jobActive = false;
        updateStartButton();
      }
    } else if (status === "fatal") {
      appendLog(info || "任务失败", "error");
      elements.statusText.textContent = `任务失败: ${info || "未知错误"}`;
      state.jobActive = false;
      updateStartButton();
    } else if (status === "finished") {
      const successRate = `${info.success}/${info.total}`;
      appendLog(`完成 ${successRate} 个项目`, info.failed ? "error" : "success");
      elements.statusText.textContent = `已完成: ${successRate} 个文件`;
      state.jobActive = false;
      updateStartButton();
    }
  }

  async function processDownloadFetch(payload, sendResponse) {
    try {
      const url = await resolveDownloadUrl(payload);
      if (!url) {
        sendResponse?.({ ok: false, error: "缺少下载地址" });
        return;
      }
      sendResponse?.({ ok: true, url });
    } catch (error) {
      sendResponse?.({ ok: false, error: error?.message || "下载失败" });
    }
  }

  async function resolveDownloadUrl(payload = {}) {
    if (payload.url) return payload.url;
    const bookId = payload.bookId || state.manga?.bookId;
    const volumeId = payload.volumeId || payload.id;
    const fileFormat = typeof payload.fileFormat === "number" ? payload.fileFormat : state.fileFormat;
    const lineCode = typeof payload.lineCode === "number" ? payload.lineCode : getCurrentLineCode();
    if (!bookId || !volumeId) {
      return buildRelativeDownloadUrl(payload.relativePath, payload.downloadOrigin);
    }
    try {
      const endpoint = new URL("/getdownurl.php", window.location.origin);
      endpoint.search = new URLSearchParams({
        b: bookId,
        v: volumeId,
        mobi: String(fileFormat ?? 2),
        vip: String(lineCode ?? 0),
        json: "1"
      }).toString();
      const response = await fetch(endpoint.toString(), {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) {
        throw new Error(`获取链接失败 (${response.status})`);
      }
      const data = await response.json();
      if (Number(data.code) !== 200 || !data.url) {
        throw new Error(data.msg || "无法获取下载链接");
      }
      return data.url;
    } catch (error) {
      const fallback = buildRelativeDownloadUrl(payload.relativePath, payload.downloadOrigin);
      if (fallback) {
        appendLog("尝试使用备用链接", "info");
        return fallback;
      }
      throw error;
    }
  }

  function buildRelativeDownloadUrl(path, origin) {
    if (!path) return null;
    const base = origin || state.downloadOrigin || window.location.origin;
    try {
      return new URL(path, base).toString();
    } catch (error) {
      return null;
    }
  }

  function getCurrentLineCode() {
    const selectedLine = LINE_OPTIONS.find((line) => line.id === state.selectedLine);
    return typeof selectedLine?.vip === "number" ? selectedLine.vip : 0;
  }

  async function prepareDownloadItems(items, lineCode) {
    const prepared = [];
    for (const item of items) {
      appendLog(`获取下载链接：${item.label}`, "info");
      const url = await resolveDownloadUrl({
        bookId: state.manga?.bookId,
        volumeId: item.id,
        fileFormat: state.fileFormat,
        lineCode,
        relativePath: item.downloadPath,
        downloadOrigin: state.downloadOrigin,
        url: item.absoluteUrl ? item.downloadPath : null
      });
      if (!url) {
        throw new Error(`${item.label} 无法获取下载链接`);
      }
      const historyId = item.historyId || item.id || crypto.randomUUID();
      prepared.push({
        ...item,
        downloadUrl: url,
        referer: state.downloadOrigin || window.location.href,
        historyId
      });
    }
    return prepared;
  }

  setupDraggableFloatingButton();
  menuButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const action = event.currentTarget.dataset.action;
      if (action === "open-panel") {
        toggleModal(true);
      } else if (action === "open-options") {
        chrome.runtime.sendMessage({ type: "KMOE_OPEN_OPTIONS" }, () => {
          if (chrome.runtime.lastError) {
            console.error("Message error:", chrome.runtime.lastError.message);
          }
        });
      }
      toggleMenu(false);
    });
  });
  elements.modal.addEventListener("click", (event) => {
    if (event.target.dataset.close !== undefined) {
      toggleModal(false);
    }
  });
  elements.openOptionsButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "KMOE_OPEN_OPTIONS" }, () => {
      if (chrome.runtime.lastError) {
        console.error("Message error:", chrome.runtime.lastError.message);
      }
    });
  });
  elements.pathInput.addEventListener("blur", handlePathInputChange);
  if (elements.ruleInput) {
    elements.ruleInput.addEventListener("input", () => {
      state.ruleTemplate = elements.ruleInput.value.trim() || state.defaultRule || defaultSettings.downloadRule;
      refreshRulePreview();
    });
  }
  if (elements.ruleReset) {
    elements.ruleReset.addEventListener("click", (event) => {
      event.preventDefault();
      state.ruleTemplate = state.defaultRule || defaultSettings.downloadRule;
      if (elements.ruleInput) {
        elements.ruleInput.value = state.ruleTemplate;
      }
      refreshRulePreview();
    });
  }
  elements.startButton.addEventListener("click", startDownload);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.overlayOpen) {
      toggleModal(false);
    }
  });

  onSettingsChanged((settings) => {
    const previousDefault = state.defaultRule;
    state.settings = settings;
    state.defaultRule = settings.downloadRule || defaultSettings.downloadRule;
    if (!state.ruleTemplate || state.ruleTemplate === previousDefault) {
      state.ruleTemplate = state.defaultRule;
      if (elements.ruleInput) {
        elements.ruleInput.value = state.ruleTemplate;
      }
    }
    refreshRulePreview();
    refreshServerState();
    state.applyFloatingButtonPosition?.();
  });

  refreshServerState();
  refreshLineOptions();
  refreshFormatOptions();
  refreshRuleTemplate();
  updateMangaHeader();
  renderGroups();
  updateQuotaDisplay();
  injectBridgeScript();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "KMOE_SYNC_TOGGLE_PANEL") {
      toggleModal(true);
    }
    if (message?.type === "KMOE_DOWNLOAD_PROGRESS") {
      handleProgressMessage(message.payload);
    }
    if (message?.type === "KMOE_FETCH_ITEM") {
      processDownloadFetch(message.payload, sendResponse);
      return true;
    }
  });

  window.addEventListener("message", handlePageMessage);

  function handlePageMessage(event) {
    if (event.source !== window || !event.data || event.data.source !== "kmoe-sync") return;
    if (event.data.type === "MANGA_DATA") {
      processMangaPayload(event.data.payload);
    }
  }

  function processMangaPayload(payload) {
    if (!payload || !Array.isArray(payload.arr) || !payload.arr.length) return;
    const groupsMap = new Map();
    const itemsById = new Map();
    payload.arr.forEach((entry) => {
      const id = entry[0];
      const rawType = entry[3] || "其他";
      const groupLabel = normalizeGroupLabel(rawType);
      const label = entry[5] || `项目 ${id}`;
      const mobiSize = normalizeSizeValue(entry[9] ?? 0);
      const epubSize = normalizeSizeValue(entry[11] ?? 0);
      const fallbackSize = normalizeSizeValue(entry[9] ?? 0);
      const pages = parseInt(entry[6], 10) || parseInt(entry[7], 10) || 0;
      const { path: downloadPath, absolute } = buildDownloadPath(
        payload.downPrefix || `/dl/${payload.bookId}/`,
        id,
        payload.downSuffix || "/0/"
      );
      const item = {
        id,
        label,
        type: groupLabel,
        mobiSize,
        epubSize,
        fallbackSize,
        sizeMB: 0,
        sizeLabel: "未知大小",
        pages,
        order: parseInt(entry[4], 10) || 0,
        downloadPath,
        absoluteUrl: absolute,
        quotaCost: 0
      };
      if (!groupsMap.has(groupLabel)) {
        groupsMap.set(groupLabel, []);
      }
      groupsMap.get(groupLabel).push(item);
      itemsById.set(id, item);
    });

    const groups = Array.from(groupsMap.entries()).map(([key, items]) => ({
      key,
      label: key,
      items: items.sort((a, b) => b.order - a.order)
    }));

    state.manga = {
      bookId: payload.bookId,
      title: payload.title || "未命名漫画",
      cover: payload.cover || "",
      author: payload.author || "",
      totalItems: payload.arr.length
    };
    state.groups = groups;
    state.itemsById = itemsById;
    state.downloadOrigin = payload.downloadOrigin || window.location.origin;
    const rawAvailable = payload.quotaAvailable ?? payload.quota_now ?? payload.quotaNow;
    const rawUsed = payload.quotaUsed ?? payload.quota_used;
    const available = rawAvailable === undefined || rawAvailable === null ? null : Number(rawAvailable);
    const used = rawUsed === undefined || rawUsed === null ? null : Number(rawUsed);
    state.quotaAvailable = Number.isFinite(available) ? available : null;
    state.quotaUsed = Number.isFinite(used) ? used : null;
    if (typeof payload.fileFormat === "number" && !Number.isNaN(payload.fileFormat)) {
      state.fileFormat = payload.fileFormat;
    }
    refreshFormatOptions();
    updateItemSizesByFormat();
    updateMangaHeader();
    renderGroups();
    updateQuotaDisplay();
    refreshRulePreview();
  }

  function injectBridgeScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("scripts/page-bridge.js");
    script.type = "text/javascript";
    script.dataset.kmoeSync = "bridge";
    document.documentElement.appendChild(script);
    script.remove();
  }

  function setupDraggableFloatingButton() {
    const container = elements.container;
    const button = elements.floatingButton;
    if (!container || !button) return;
    applyStoredPosition();
    state.applyFloatingButtonPosition = applyStoredPosition;
    const DRAG_THRESHOLD = 12;
    let dragState = {
      active: false,
      dragging: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      suppressClick: false,
      latestPosition: getStoredPosition()
    };

    function updatePosition(clientX, clientY) {
      const width = container.offsetWidth || 80;
      const height = container.offsetHeight || 80;
      const x = clientX - dragState.offsetX;
      const y = clientY - dragState.offsetY;
      const clampedX = Math.min(window.innerWidth - width - 8, Math.max(8, x));
      const clampedY = Math.min(window.innerHeight - height - 8, Math.max(8, y));
      container.style.left = `${clampedX}px`;
      container.style.top = `${clampedY}px`;
      container.style.right = "auto";
      container.style.bottom = "auto";
      dragState.latestPosition = { x: clampedX, y: clampedY };
    }

    function endPointerInteraction(event, cancelled = false) {
      if (!dragState.active || event.pointerId !== dragState.pointerId) return;
      button.releasePointerCapture(event.pointerId);
      const wasDragging = dragState.dragging;
      dragState.active = false;
      dragState.dragging = false;
      dragState.pointerId = null;
      if (wasDragging && dragState.latestPosition) {
        persistFloatingButtonLocation(dragState.latestPosition);
      }
      if (!cancelled && !wasDragging) {
        dragState.suppressClick = true;
        toggleMenu();
        requestAnimationFrame(() => {
          dragState.suppressClick = false;
        });
      }
    }

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragState = {
        active: true,
        dragging: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
        suppressClick: false
      };
      button.setPointerCapture(event.pointerId);
    });

    button.addEventListener("pointermove", (event) => {
      if (!dragState.active || event.pointerId !== dragState.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (!dragState.dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        dragState.dragging = true;
      }
      if (!dragState.dragging) return;
      updatePosition(event.clientX, event.clientY);
    });

    button.addEventListener("pointerup", (event) => {
      endPointerInteraction(event, false);
    });

    button.addEventListener("pointercancel", (event) => {
      endPointerInteraction(event, true);
    });

    button.addEventListener("click", (event) => {
      if (dragState.suppressClick) {
        event.preventDefault();
        return;
      }
      toggleMenu();
    });

    function applyStoredPosition() {
      const stored = getStoredPosition();
      if (stored) {
        container.style.left = `${stored.x}px`;
        container.style.top = `${stored.y}px`;
        container.style.right = "auto";
        container.style.bottom = "auto";
      } else {
        container.style.left = "auto";
        container.style.top = "auto";
        container.style.right = "24px";
        container.style.bottom = "24px";
      }
    }

    function getStoredPosition() {
      const stored = state.settings?.floatingButtonPosition;
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        return { x: stored.x, y: stored.y };
      }
      return null;
    }

    function persistFloatingButtonLocation(position) {
      if (!position) return;
      state.settings = state.settings || {};
      state.settings.floatingButtonPosition = { ...position };
      if (typeof setFloatingButtonPosition === "function") {
        setFloatingButtonPosition(position).catch(() => {});
      }
    }
  }
})();
