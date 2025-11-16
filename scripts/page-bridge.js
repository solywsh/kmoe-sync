(() => {
  const SOURCE = "kmoe-sync";
  let lastPayloadKey = "";

  function collectData() {
    if (!Array.isArray(window.arr_voldata) || !window.arr_voldata.length || !window.bookid) {
      return null;
    }
    const payload = {
      bookId: window.bookid,
      arr: window.arr_voldata,
      title: document.querySelector(".text_bglight_big")?.textContent?.trim() || document.title,
      cover: document.querySelector(".img_book")?.src || "",
      author: document.querySelector("a[href*='list.php?s=']")?.textContent?.trim() || "",
      downPrefix:
        window.str_down_url_prefix || window.str_down_url_pre || `/dl/${window.bookid}/`,
      downSuffix:
        window.str_down_url_subfix || window.str_down_url_suffix || "/0/",
      downloadOrigin:
        window.down_domain || window.str_down_domain || window.str_down_host || window.location.origin,
      fileFormat: typeof window.u_def_file !== "undefined" ? Number(window.u_def_file) : null,
      quotaAvailable: typeof window.quota_now !== "undefined" ? Number(window.quota_now) : null,
      quotaUsed: typeof window.quota_used !== "undefined" ? Number(window.quota_used) : null
    };
    return payload;
  }

  function sendPayload(force = false) {
    const payload = collectData();
    if (!payload) return;
    const key = `${payload.bookId}-${payload.arr.length}`;
    if (!force && key === lastPayloadKey) return;
    lastPayloadKey = key;
    window.postMessage({ source: SOURCE, type: "MANGA_DATA", payload }, "*");
  }

  const observer = new MutationObserver(() => sendPayload(false));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => sendPayload(false), 2000);
  sendPayload(true);
})();
