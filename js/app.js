/**
 * Vulnpokalypse Tracker — Application Controller & UI
 */

(() => {
  const state = {
    feeds: [],
    articles: [],
    enrichmentItems: [],
    kevCveSet: new Set(),
    events: [],
    settings: { ...VulnDB.DEFAULT_SETTINGS },
    selectedArticleId: null,
    viewingLinkedArticleId: null,
    viewingLinkedKind: null, // "article" | "enrichment" | null
    linkedFilterMode: "all", // "all" | "articles" | "enrichment"
    isEditingTitle: false,
    isEditingNotes: false,
    confirmingUnfocusId: null,
    confirmUnfocusTimerId: null,
    filterMode: "unread", // "all" | "unread" | "exploited"
    filterFeedId: "all",
    searchQuery: "",
    editingFeedId: null,
    isSyncing: false,
    pollTimerId: null,
    nextPollAt: null,
    countdownTimerId: null,
  };

  // DOM References
  const els = {
    btnSubscriptionStatus: document.getElementById("btn-subscription-status"),
    topSubStatusDot: document.getElementById("top-sub-status-dot"),
    modalSubStatusDot: document.getElementById("modal-sub-status-dot"),
    btnOpenSettings: document.getElementById("btn-open-settings"),

    btnRefresh: document.getElementById("btn-refresh"),
    syncBtnLabel: document.getElementById("sync-btn-label"),
    articleSearch: document.getElementById("article-search"),
    filterChips: document.querySelectorAll(".filter-chip[data-filter]"),
    unreadBadge: document.getElementById("unread-badge"),
    exploitedBadge: document.getElementById("exploited-badge"),
    feedFilterSelect: document.getElementById("feed-filter-select"),
    btnMarkAllRead: document.getElementById("btn-mark-all-read"),
    markAllReadCount: document.getElementById("mark-all-read-count"),
    articleList: document.getElementById("article-list"),

    eventLogList: document.getElementById("event-log-list"),
    eventLogUnread: document.getElementById("event-log-unread"),
    btnMarkLogsRead: document.getElementById("btn-mark-logs-read"),
    eventLogTotal: document.getElementById("event-log-total"),
    btnOpenFullLogs: document.getElementById("btn-open-full-logs"),
    logsBackdrop: document.getElementById("logs-backdrop"),
    logsWindow: document.getElementById("logs-window"),
    btnCloseLogs: document.getElementById("btn-close-logs"),
    btnClearLogs: document.getElementById("btn-clear-logs"),
    fullLogsList: document.getElementById("full-logs-list"),

    focusGrid: document.getElementById("focus-grid"),
    focusEmptyState: document.getElementById("focus-empty-state"),

    statusBackdrop: document.getElementById("status-backdrop"),
    statusWindow: document.getElementById("status-window"),
    btnCloseStatus: document.getElementById("btn-close-status"),
    feedHealthList: document.getElementById("feed-health-list"),

    detailsBackdrop: document.getElementById("details-backdrop"),
    detailsWindow: document.getElementById("details-window"),
    detailsArticlePane: document.getElementById("details-article-pane"),
    linkedViewerBanner: document.getElementById("linked-viewer-banner"),
    linkedViewerSource: document.getElementById("linked-viewer-source"),
    btnBackToMainArticle: document.getElementById("btn-back-to-main-article"),
    detailsToggleFocus: document.getElementById("details-toggle-focus"),
    detailsToggleRead: document.getElementById("details-toggle-read"),
    btnArticleActivityLog: document.getElementById("btn-article-activity-log"),
    detailsLogCount: document.getElementById("details-log-count"),
    btnCloseDetails: document.getElementById("btn-close-details"),
    articleLogsBackdrop: document.getElementById("article-logs-backdrop"),
    articleLogsWindow: document.getElementById("article-logs-window"),
    articleLogsTitle: document.getElementById("article-logs-window-title"),
    btnCloseArticleLogs: document.getElementById("btn-close-article-logs"),
    articleLogsList: document.getElementById("article-logs-list"),
    detailsTitleDisplay: document.getElementById("details-title-display"),
    btnDetailsStar: document.getElementById("btn-details-star"),
    detailsKevIcon: document.getElementById("details-kev-icon"),
    detailsTitle: document.getElementById("details-title"),
    btnEditTitle: document.getElementById("btn-edit-title"),
    editTitleForm: document.getElementById("edit-title-form"),
    inputEditTitle: document.getElementById("input-edit-title"),
    btnCancelEditTitle: document.getElementById("btn-cancel-edit-title"),
    detailsLabelsBar: document.getElementById("details-labels-bar"),
    notesViewMode: document.getElementById("notes-view-mode"),
    notesContent: document.getElementById("notes-content"),
    notesEmptyMode: document.getElementById("notes-empty-mode"),
    btnAddNotes: document.getElementById("btn-add-notes"),
    btnEditNotes: document.getElementById("btn-edit-notes"),
    notesEditForm: document.getElementById("notes-edit-form"),
    textareaNotes: document.getElementById("textarea-notes"),
    btnCancelNotes: document.getElementById("btn-cancel-notes"),
    detailsBody: document.getElementById("details-body"),
    detailsMetadataTbody: document.getElementById("details-metadata-tbody"),
    labelPopup: document.getElementById("label-popup"),
    addLabelForm: document.getElementById("add-label-form"),
    inputAddLabel: document.getElementById("input-add-label"),
    btnCancelLabelPopup: document.getElementById("btn-cancel-label-popup"),
    detailsLinkedSection: document.getElementById("details-linked-section"),
    detailsLinkedCount: document.getElementById("details-linked-count"),
    linkedFilterChips: document.querySelectorAll("[data-linked-filter]"),
    detailsLinkedList: document.getElementById("details-linked-list"),

    settingsBackdrop: document.getElementById("settings-backdrop"),
    settingsWindow: document.getElementById("settings-window"),
    settingsTitlebar: document.getElementById("settings-titlebar"),
    btnCloseSettings: document.getElementById("btn-close-settings"),
    tabButtons: document.querySelectorAll(".tab-btn"),
    tabPanels: document.querySelectorAll(".tab-panel"),

    btnToggleAddFeed: document.getElementById("btn-toggle-add-feed"),
    addFeedForm: document.getElementById("add-feed-form"),
    newFeedName: document.getElementById("new-feed-name"),
    newFeedUrl: document.getElementById("new-feed-url"),
    newFeedType: document.getElementById("new-feed-type"),
    btnCancelAddFeed: document.getElementById("btn-cancel-add-feed"),
    subscriptionsList: document.getElementById("subscriptions-list"),

    syncSettingsForm: document.getElementById("sync-settings-form"),
    settingPollInterval: document.getElementById("setting-poll-interval"),
    settingCorsMode: document.getElementById("setting-cors-mode"),
    customProxyRow: document.getElementById("custom-proxy-row"),
    settingCustomProxy: document.getElementById("setting-custom-proxy"),
    settingMaxArticles: document.getElementById("setting-max-articles"),

    dbStatFeeds: document.getElementById("db-stat-feeds"),
    dbStatArticles: document.getElementById("db-stat-articles"),
    dbStatSize: document.getElementById("db-stat-size"),
    btnExportData: document.getElementById("btn-export-data"),
    btnClearArticles: document.getElementById("btn-clear-articles"),
    btnRestoreDefaults: document.getElementById("btn-restore-defaults"),

    toastContainer: document.getElementById("toast-container"),
  };

  // ---- Utilities ----

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRelativeTime(timestamp) {
    if (!timestamp) return "unknown";
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatExactDate(timestamp) {
    if (!timestamp) return "Unknown date";
    return new Date(timestamp).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatShortUrl(rawUrl) {
    if (!rawUrl) return "—";
    try {
      const u = new URL(rawUrl);
      const host = u.hostname.replace(/^www\./i, "");
      const path = u.pathname === "/" ? "" : u.pathname;
      const combined = `${host}${path}`;
      return combined.length > 34 ? `${combined.slice(0, 31)}…` : combined;
    } catch {
      return rawUrl.length > 34 ? `${rawUrl.slice(0, 31)}…` : rawUrl;
    }
  }

  function formatLogDateTime(timestamp) {
    const d = new Date(timestamp || Date.now());
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatNewLinkAgo(timestamp) {
    if (!timestamp) return "just now";
    const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  }

  function renderNotesHtml(rawText) {
    const text = String(rawText || "");
    if (!text.trim()) return "";

    // Match Markdown links [label](https://...) OR bare http(s):// URLs
    const tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]+)/gi;
    let out = "";
    let lastIndex = 0;
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        out += escapeHtml(text.slice(lastIndex, match.index));
      }

      if (match[1] && match[2]) {
        const label = match[1];
        const href = match[2];
        out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
      } else if (match[3]) {
        let url = match[3];
        let trailing = "";
        while (/[.,;:!?]$/.test(url)) {
          trailing = url.slice(-1) + trailing;
          url = url.slice(0, -1);
        }
        out += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      out += escapeHtml(text.slice(lastIndex));
    }

    return out;
  }

  async function logEvent(type, parts, level = "info") {
    const normalizedParts =
      typeof parts === "string" ? [{ text: parts }] : parts;
    await VulnDB.addEvent({ type, level, parts: normalizedParts });
    state.events = await VulnDB.getAllEvents();
    renderEventLogs();
  }

  function showToast(message, isError = false) {
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " error" : ""}`;
    toast.textContent = message;
    els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3600);
  }

  // ---- Data Loading & Filtering ----

  function isTenableItem(item) {
    if (!item) return false;
    const hay = `${item.feedName || ""} ${item.feedUrl || ""} ${item.link || ""}`.toLowerCase();
    return hay.includes("tenable");
  }

  function isExploitedCve(label) {
    if (!label) return false;
    return state.kevCveSet.has(String(label).trim().toUpperCase());
  }

  function getArticleKevCves(article) {
    if (!article) return [];
    const matched = new Set();
    for (const lbl of article.labels || []) {
      const upper = String(lbl || "").trim().toUpperCase();
      if (state.kevCveSet.has(upper)) {
        matched.add(upper);
      }
    }
    for (const cve of article.kevCves || []) {
      const upper = String(cve || "").trim().toUpperCase();
      if (state.kevCveSet.has(upper)) {
        matched.add(upper);
      }
    }
    return Array.from(matched);
  }

  function renderLabelPill(label, removable = false) {
    const exploitedClass = isExploitedCve(label) ? " cve-exploited" : "";
    const titleAttr = isExploitedCve(label)
      ? ` title="Known Exploited Vulnerability (KEV)"`
      : "";
    if (removable) {
      return `<span class="cve-pill${exploitedClass}"${titleAttr}>${escapeHtml(label)}<button type="button" class="label-remove-btn" data-remove-label="${escapeHtml(label)}" title="Remove label" aria-label="Remove label ${escapeHtml(label)}">×</button></span>`;
    }
    return `<span class="cve-pill${exploitedClass}"${titleAttr}>${escapeHtml(label)}</span>`;
  }

  function renderSortedLabelPills(labels) {
    if (!Array.isArray(labels) || labels.length === 0) return "";
    const kevLabels = [];
    const otherLabels = [];
    for (const lbl of labels) {
      if (isExploitedCve(lbl)) {
        kevLabels.push(lbl);
      } else {
        otherLabels.push(lbl);
      }
    }
    return [...kevLabels, ...otherLabels].map((lbl) => renderLabelPill(lbl, false)).join("");
  }

  async function reloadFromDB() {
    const [feeds, articles, enrichmentItems, settings, events] = await Promise.all([
      VulnDB.getAllFeeds(),
      VulnDB.getAllArticles(),
      VulnDB.getAllEnrichmentItems(),
      VulnDB.getAllSettings(),
      VulnDB.getAllEvents(),
    ]);
    state.feeds = feeds;
    state.enrichmentItems = enrichmentItems;
    state.events = events;

    const kevSet = new Set();
    for (const item of enrichmentItems) {
      if (item.enrichmentSource === "kev") {
        for (const cve of item.cves || []) {
          kevSet.add(String(cve).trim().toUpperCase());
        }
      }
    }
    state.kevCveSet = kevSet;
    // Map current feed names onto articles in case a feed was renamed
    const feedMap = new Map(feeds.map((f) => [f.id, f]));
    state.articles = articles
      .filter((a) => {
        const f = feedMap.get(a.feedId);
        return f && f.feedType !== "enrichment";
      })
      .map((a) => ({
        ...a,
        feedName: feedMap.get(a.feedId).name,
        feedUrl: feedMap.get(a.feedId).url,
        feedEnabled: feedMap.get(a.feedId).enabled,
        focused: Boolean(a.focused),
        focusedAt: a.focusedAt || null,
        starred: Boolean(a.starred),
        starredAt: a.starredAt || null,
        customTitle: Boolean(a.customTitle),
        notes: typeof a.notes === "string" ? a.notes : "",
        labels: Array.isArray(a.labels) ? a.labels : Array.isArray(a.cves) ? a.cves : [],
        linked: Boolean(a.linked),
        linkedTo: Array.isArray(a.linkedTo) ? a.linkedTo : [],
        linkedArticles: Array.isArray(a.linkedArticles)
          ? [...a.linkedArticles].sort((x, y) => (x.addedAt || 0) - (y.addedAt || 0))
          : [],
        newLinks: Array.isArray(a.newLinks) ? a.newLinks : [],
        nessusPlugins: Array.isArray(a.nessusPlugins) ? a.nessusPlugins : [],
        kevCves: Array.isArray(a.kevCves) ? a.kevCves : [],
        kevItems: Array.isArray(a.kevItems) ? a.kevItems : [],
        activityLog: Array.isArray(a.activityLog) ? a.activityLog : [],
      }))
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    state.settings = settings;
  }

  function getFilteredArticles() {
    const query = state.searchQuery.trim().toLowerCase();
    return state.articles.filter((article) => {
      if (state.filterFeedId === "all" && !article.feedEnabled) {
        return false;
      }
      if (state.filterMode === "unread" && article.read) {
        return false;
      }
      if (state.filterMode === "exploited" && getArticleKevCves(article).length === 0) {
        return false;
      }
      if (state.filterFeedId !== "all" && String(article.feedId) !== String(state.filterFeedId)) {
        return false;
      }
      if (query) {
        const haystack = [
          article.title,
          article.excerpt,
          article.feedName,
          ...(article.labels || []),
          ...(article.cves || []),
          ...(article.categories || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }

  // ---- Rendering ----

  function renderAll() {
    renderHeaderMeta();
    renderEventLogs();
    renderFeedFilterSelect();
    renderArticleList();
    renderFocusGrid();
    renderSubscriptionStatus();
    renderDetailsWindow();
    renderSubscriptionsTab();
    renderSyncSettingsTab();
    renderDatabaseTab();
  }

  function renderHeaderMeta() {
    const unreadTotal = state.articles.filter((a) => !a.read).length;
    els.unreadBadge.textContent = String(unreadTotal);

    const exploitedTotal = state.articles.filter(
      (a) => a.feedEnabled && getArticleKevCves(a).length > 0
    ).length;
    els.exploitedBadge.textContent = String(exploitedTotal);

    if (state.isSyncing) {
      els.syncBtnLabel.textContent = "Syncing…";
    }
  }

  function buildEventRowHtml(ev) {
    const msgHtml = (ev.parts || [])
      .map((part) => {
        if (part.articleId) {
          return `<button type="button" class="event-article-link" data-open-article-id="${escapeHtml(
            part.articleId
          )}">${escapeHtml(part.text)}</button>`;
        }
        return escapeHtml(part.text);
      })
      .join("");

    const levelClass = ev.level ? ` level-${escapeHtml(ev.level)}` : "";
    const unreadClass = ev.read ? "" : " unread";
    return `
      <div class="event-log-row${levelClass}${unreadClass}" data-event-id="${ev.id}" title="${
      ev.read ? "" : "Click to mark as read"
    }">
        <span class="event-log-ts">${escapeHtml(formatLogDateTime(ev.timestamp))}</span>
        <span class="event-log-type">${escapeHtml(ev.type)}</span>
        <span class="event-log-msg">${msgHtml}</span>
      </div>
    `;
  }

  function renderEventLogs() {
    const unreadCount = state.events.filter((ev) => !ev.read).length;
    els.eventLogUnread.textContent = String(unreadCount);
    els.eventLogUnread.classList.toggle("has-unread", unreadCount > 0);
    els.btnMarkLogsRead.classList.toggle("hidden", unreadCount === 0);
    els.eventLogTotal.textContent = String(state.events.length);

    const recentThree = state.events.slice(0, 3);
    if (recentThree.length === 0) {
      els.eventLogList.innerHTML = `<div class="event-log-empty">No events recorded yet.</div>`;
    } else {
      els.eventLogList.innerHTML = recentThree.map(buildEventRowHtml).join("");
    }

    if (!els.logsWindow.classList.contains("hidden")) {
      if (state.events.length === 0) {
        els.fullLogsList.innerHTML = `<div class="event-log-empty">No events recorded yet.</div>`;
      } else {
        els.fullLogsList.innerHTML = state.events.map(buildEventRowHtml).join("");
      }
    }
  }

  function renderFeedFilterSelect() {
    const prev = state.filterFeedId;
    const standardFeeds = state.feeds.filter((f) => f.feedType !== "enrichment");
    const options = [`<option value="all">All feeds (${standardFeeds.length})</option>`];
    for (const feed of standardFeeds) {
      const suffix = feed.enabled ? "" : " [disabled]";
      options.push(
        `<option value="${feed.id}">${escapeHtml(feed.name)}${suffix}</option>`
      );
    }
    els.feedFilterSelect.innerHTML = options.join("");
    els.feedFilterSelect.value = standardFeeds.some((f) => String(f.id) === String(prev))
      ? prev
      : "all";
    state.filterFeedId = els.feedFilterSelect.value;
  }

  function renderArticleList() {
    const visible = getFilteredArticles();
    els.markAllReadCount.textContent = String(visible.length);

    if (visible.length === 0) {
      const msg =
        state.articles.length === 0
          ? "No articles stored yet. Click the refresh icon to pull your RSS feeds."
          : "No articles match the current filter.";
      els.articleList.innerHTML = `<div class="empty-state"><p>${escapeHtml(msg)}</p></div>`;
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const article of visible) {
      const card = document.createElement("div");
      card.className = `article-card ${article.read ? "read" : "unread"}${
        article.id === state.selectedArticleId ? " selected" : ""
      }`;
      card.setAttribute("role", "listitem");
      card.setAttribute("tabindex", "0");
      card.dataset.articleId = article.id;

      const sortedLabelsHtml = renderSortedLabelPills(article.labels);

      const linkedBadgeHtml = article.linked
        ? `<span class="linked-badge" title="Auto-linked to a focused article">Linked</span>`
        : "";

      const linkedCount = (article.linkedArticles || []).length;
      const linkedBtnHtml =
        linkedCount > 0
          ? `<button type="button" class="focus-linked-btn" data-open-linked-id="${escapeHtml(
              article.id
            )}" title="${linkedCount} linked article${linkedCount === 1 ? "" : "s"}">${linkedCount} linked</button>`
          : "";

      card.innerHTML = `
        <div class="article-card-meta">
          <span class="article-source">${escapeHtml(article.feedName)}</span>
          <span class="article-card-meta-right">
            ${linkedBadgeHtml}
            <time class="article-time" title="${escapeHtml(formatExactDate(article.publishedAt))}">${escapeHtml(
        formatRelativeTime(article.publishedAt)
      )}</time>
          </span>
        </div>
        <h3 class="article-card-title">${escapeHtml(article.title)}</h3>
        ${
          article.excerpt
            ? `<p class="article-card-excerpt">${escapeHtml(article.excerpt)}</p>`
            : ""
        }
        <div class="article-card-footer">
          <button
            type="button"
            class="btn-focus${article.focused ? " is-focused" : ""}"
            data-focus-id="${escapeHtml(article.id)}"
            title="${article.focused ? "Remove from Focus List" : "Add to Focus List"}"
          >${article.focused ? "Unfocus" : "Focus"}</button>
          ${linkedBtnHtml}
          ${sortedLabelsHtml}
        </div>
      `;

      const focusBtn = card.querySelector(".btn-focus");
      focusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFocusArticle(article.id);
      });

      const linkedBtn = card.querySelector("[data-open-linked-id]");
      if (linkedBtn) {
        linkedBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openArticleDetails(article.id);
        });
      }

      card.addEventListener("click", () => openArticleDetails(article.id));
      card.addEventListener("keydown", (e) => {
        if (e.target === focusBtn || e.target === linkedBtn) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openArticleDetails(article.id);
        }
      });

      fragment.appendChild(card);
    }

    els.articleList.innerHTML = "";
    els.articleList.appendChild(fragment);
  }

  function renderFocusGrid() {
    const focusedArticles = state.articles
      .filter((a) => a.focused)
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        if (a.starred && b.starred) {
          return (b.starredAt || 0) - (a.starredAt || 0);
        }
        return (b.focusedAt || b.publishedAt || 0) - (a.focusedAt || a.publishedAt || 0);
      });

    if (focusedArticles.length === 0) {
      els.focusGrid.innerHTML = "";
      els.focusGrid.classList.add("hidden");
      els.focusEmptyState.classList.remove("hidden");
      return;
    }

    els.focusEmptyState.classList.add("hidden");
    els.focusGrid.classList.remove("hidden");

    const fragment = document.createDocumentFragment();
    for (const article of focusedArticles) {
      const unseenLinks = Array.isArray(article.newLinks) ? article.newLinks : [];
      const hasNewLink = unseenLinks.length > 0;
      const isConfirmingUnfocus = state.confirmingUnfocusId === article.id;

      const card = document.createElement("article");
      card.className = `focus-card${article.read ? " read" : " unread"}${
        hasNewLink ? " has-new-link" : ""
      }`;
      card.setAttribute("role", "listitem");
      card.setAttribute("tabindex", "0");

      const sortedLabelsHtml = renderSortedLabelPills(article.labels);

      const kevCves = getArticleKevCves(article);
      const kevIconHtml =
        kevCves.length > 0
          ? `<span class="kev-alert-icon" title="Exploited in KEV: ${escapeHtml(
              kevCves.join(", ")
            )}" aria-label="Exploited in KEV: ${escapeHtml(kevCves.join(", "))}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="7.5" x2="12" y2="13"></line>
                <circle cx="12" cy="16.5" r="0.8" fill="currentColor"></circle>
              </svg>
            </span>`
          : "";

      const linkedArticlesAll = Array.isArray(article.linkedArticles)
        ? article.linkedArticles
        : [];
      const linkedCount = linkedArticlesAll.length;
      const linkedCountHtml =
        linkedCount > 0
          ? `<button type="button" class="focus-linked-btn" data-open-linked-id="${escapeHtml(
              article.id
            )}" title="${linkedCount} linked article${linkedCount === 1 ? "" : "s"}">${linkedCount} linked</button>`
          : "";

      // Three most recently added linked articles, newest on top
      const recentThreeLinks = [...linkedArticlesAll]
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
        .slice(0, 3);

      const recentLinksHtml =
        recentThreeLinks.length > 0
          ? `<div class="focus-card-recent-links">${recentThreeLinks
              .map((entry) => {
                const live = state.articles.find((a) => a.id === entry.articleId);
                const title = live ? live.title : entry.title || "(Untitled article)";
                const link = live ? live.link : entry.link || "";
                const addedLabel = formatRelativeTime(entry.addedAt);
                return `
                  <div class="focus-recent-link-row">
                    <button
                      type="button"
                      class="focus-recent-link-btn"
                      data-open-focus-linked-id="${escapeHtml(entry.articleId)}"
                      title="${escapeHtml(title)}"
                    >${escapeHtml(title)}</button>
                    <span class="focus-recent-link-meta">
                      <span>${escapeHtml(addedLabel)}</span>
                      ${
                        link
                          ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="focus-recent-link-ext" title="Open external link">↗</a>`
                          : ""
                      }
                    </span>
                  </div>
                `;
              })
              .join("")}</div>`
          : "";

      const newLinksHtml = hasNewLink
        ? `<div class="focus-card-new-links">${[...unseenLinks]
            .reverse()
            .map(
              (notice) =>
                `<div class="focus-new-link-note">${escapeHtml(
                  formatNewLinkAgo(notice.addedAt)
                )} new link ${escapeHtml(notice.title)}</div>`
            )
            .join("")}</div>`
        : "";

      card.innerHTML = `
        <div>
          <div class="focus-card-title-row">
            <button
              type="button"
              class="star-btn${article.starred ? " is-starred" : ""}"
              data-star-id="${escapeHtml(article.id)}"
              title="${article.starred ? "Unstar article" : "Star and pin to top"}"
              aria-label="${article.starred ? "Unstar article" : "Star and pin to top"}"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
            ${kevIconHtml}
            <h3 class="focus-card-title">${escapeHtml(article.title)}</h3>
          </div>
          ${newLinksHtml}
          ${
            article.excerpt
              ? `<p class="focus-card-excerpt">${escapeHtml(article.excerpt)}</p>`
              : ""
          }
          ${recentLinksHtml}
        </div>
        <div class="focus-card-bottom">
          <button
            type="button"
            class="btn btn-sm ${isConfirmingUnfocus ? "btn-unfocus-confirm" : "btn-subtle"}"
            data-unfocus-id="${escapeHtml(article.id)}"
            title="${isConfirmingUnfocus ? "Click again to confirm unfocus" : "Remove from Focus List"}"
          >
            ${isConfirmingUnfocus ? "Are you sure?" : "Unfocus"}
          </button>
          ${linkedCountHtml}
          ${sortedLabelsHtml}
        </div>
      `;

      const starBtn = card.querySelector("[data-star-id]");
      starBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleStarArticle(article.id);
      });

      const unfocusBtn = card.querySelector("[data-unfocus-id]");
      unfocusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleFocusCardUnfocusClick(article.id);
      });

      const linkedBtn = card.querySelector("[data-open-linked-id]");
      if (linkedBtn) {
        linkedBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openArticleDetails(article.id);
        });
      }

      card.querySelectorAll("[data-open-focus-linked-id]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openArticleDetails(article.id, btn.dataset.openFocusLinkedId);
        });
      });

      card.querySelectorAll(".focus-recent-link-ext").forEach((anchor) => {
        anchor.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      });

      card.addEventListener("click", () => openArticleDetails(article.id));
      card.addEventListener("keydown", (e) => {
        if (e.target.closest("button, a")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openArticleDetails(article.id);
        }
      });

      fragment.appendChild(card);
    }

    els.focusGrid.innerHTML = "";
    els.focusGrid.appendChild(fragment);
  }

  function renderSubscriptionStatus() {
    const enabledFeeds = state.feeds.filter((f) => f.enabled);
    const hasError = enabledFeeds.some((f) => f.lastStatus === "error");
    const hasIssue = hasError || enabledFeeds.length === 0;

    const dotClass = hasIssue ? "sub-status-dot warn" : "sub-status-dot ok";
    els.topSubStatusDot.className = dotClass;
    els.modalSubStatusDot.className = dotClass;

    const statusTooltip =
      enabledFeeds.length === 0
        ? "Subscription Status — No active feeds"
        : hasError
        ? "Subscription Status — One or more feeds have issues"
        : "Subscription Status — All feeds OK";
    els.btnSubscriptionStatus.title = statusTooltip;
    els.btnSubscriptionStatus.setAttribute("aria-label", statusTooltip);

    if (state.feeds.length === 0) {
      els.feedHealthList.innerHTML = `<div class="health-row"><span class="health-status">No RSS subscriptions configured. Open Settings to add feeds.</span></div>`;
      return;
    }

    els.feedHealthList.innerHTML = state.feeds
      .map((feed) => {
        const indicatorClass = !feed.enabled
          ? "disabled"
          : feed.lastStatus === "ok"
          ? "ok"
          : feed.lastStatus === "error"
          ? "error"
          : "";
        let statusText = "Pending";
        if (!feed.enabled) {
          statusText = "Disabled";
        } else if (feed.lastStatus === "ok") {
          statusText = `OK · ${feed.articleCount || 0} items · ${formatRelativeTime(feed.lastFetchedAt)}`;
        } else if (feed.lastStatus === "error") {
          statusText = `Issue: ${feed.lastError || "fetch failed"}`;
        }
        return `
          <div class="health-row">
            <div class="health-row-left">
              <span class="health-indicator ${indicatorClass}"></span>
              <div class="health-row-meta">
                <span class="health-name">${escapeHtml(feed.name)} ${
          feed.feedType === "enrichment"
            ? feed.enrichmentSource === "kev"
              ? `<span class="feed-type-tag kev">KEV</span>`
              : `<span class="feed-type-tag enrichment">Nessus</span>`
            : ""
        }</span>
                <span class="health-url" title="${escapeHtml(feed.url)}">${escapeHtml(feed.url)}</span>
              </div>
            </div>
            <span class="health-status" title="${escapeHtml(statusText)}">${escapeHtml(statusText)}</span>
          </div>
        `;
      })
      .join("");
  }

  function renderDetailsWindow() {
    const mainArticle = state.articles.find((a) => a.id === state.selectedArticleId);
    if (!mainArticle) {
      els.detailsBackdrop.classList.add("hidden");
      els.detailsWindow.classList.add("hidden");
      els.detailsBackdrop.setAttribute("aria-hidden", "true");
      return;
    }

    els.detailsBackdrop.classList.remove("hidden");
    els.detailsWindow.classList.remove("hidden");
    els.detailsBackdrop.setAttribute("aria-hidden", "false");

    // Determine which article is shown on the left pane (main article, linked article, or enrichment item)
    let linkedArticle = null;
    if (state.viewingLinkedArticleId) {
      if (state.viewingLinkedKind === "enrichment") {
        linkedArticle =
          state.enrichmentItems.find((e) => e.id === state.viewingLinkedArticleId) || null;
      } else {
        linkedArticle =
          state.articles.find((a) => a.id === state.viewingLinkedArticleId) || null;
      }
    }
    const displayedArticle = linkedArticle || mainArticle;
    const isViewingEnrichment = Boolean(linkedArticle && state.viewingLinkedKind === "enrichment");

    if (linkedArticle) {
      els.linkedViewerBanner.classList.remove("hidden");
      els.linkedViewerSource.textContent = `${
        isViewingEnrichment ? "Enrichment · " : ""
      }${linkedArticle.feedName || "Tenable Nessus"} · ${formatExactDate(
        linkedArticle.publishedAt
      )}`;
    } else {
      els.linkedViewerBanner.classList.add("hidden");
    }

    // Title display, Star button, KEV alert icon & inline edit mode
    els.detailsTitle.textContent = displayedArticle.title;
    els.btnDetailsStar.classList.toggle("hidden", isViewingEnrichment);
    els.btnEditTitle.classList.toggle("hidden", isViewingEnrichment);

    const displayedKevCves = isViewingEnrichment ? [] : getArticleKevCves(displayedArticle);
    if (displayedKevCves.length > 0) {
      els.detailsKevIcon.classList.remove("hidden");
      const kevTip = `Exploited in KEV: ${displayedKevCves.join(", ")}`;
      els.detailsKevIcon.title = kevTip;
      els.detailsKevIcon.setAttribute("aria-label", kevTip);
    } else {
      els.detailsKevIcon.classList.add("hidden");
    }

    els.btnDetailsStar.classList.toggle("is-starred", Boolean(displayedArticle.starred));
    els.btnDetailsStar.title = displayedArticle.starred ? "Unstar article" : "Star and pin to top";
    els.btnDetailsStar.setAttribute(
      "aria-label",
      displayedArticle.starred ? "Unstar article" : "Star and pin to top"
    );

    if (state.isEditingTitle && !isViewingEnrichment) {
      els.detailsTitleDisplay.classList.add("hidden");
      els.editTitleForm.classList.remove("hidden");
    } else {
      els.detailsTitleDisplay.classList.remove("hidden");
      els.editTitleForm.classList.add("hidden");
    }

    // Labels bar between title and custom notes (with "+" custom label button)
    if (isViewingEnrichment) {
      const enrichPills = (displayedArticle.cves || [])
        .map((lbl) => renderLabelPill(lbl, false))
        .join("");
      els.detailsLabelsBar.innerHTML = enrichPills;
      els.detailsLabelsBar.classList.toggle("hidden", !enrichPills);
    } else {
      const existingLabelPills = (mainArticle.labels || [])
        .map((lbl) => renderLabelPill(lbl, true))
        .join("");
      els.detailsLabelsBar.innerHTML = `${existingLabelPills}<button type="button" class="btn-add-label-trigger" data-action="open-label-popup" title="Add custom label" aria-label="Add custom label">+</button>`;
      els.detailsLabelsBar.classList.remove("hidden");
    }

    // Custom Notes display vs edit mode (just below article labels)
    const hasNotes = Boolean((displayedArticle.notes || "").trim());
    if (isViewingEnrichment) {
      els.notesViewMode.classList.add("hidden");
      els.notesEmptyMode.classList.add("hidden");
      els.notesEditForm.classList.add("hidden");
    } else if (state.isEditingNotes) {
      els.notesViewMode.classList.add("hidden");
      els.notesEmptyMode.classList.add("hidden");
      els.notesEditForm.classList.remove("hidden");
    } else if (hasNotes) {
      els.notesViewMode.classList.remove("hidden");
      els.notesEmptyMode.classList.add("hidden");
      els.notesEditForm.classList.add("hidden");
      els.notesContent.innerHTML = renderNotesHtml(displayedArticle.notes);
    } else {
      els.notesViewMode.classList.add("hidden");
      els.notesEmptyMode.classList.remove("hidden");
      els.notesEditForm.classList.add("hidden");
    }

    const articleLogEntries = [...(mainArticle.activityLog || [])].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    els.detailsLogCount.textContent = String(articleLogEntries.length);

    els.detailsToggleFocus.textContent = mainArticle.focused ? "In Focus (Remove)" : "Add to Focus";
    els.detailsToggleFocus.className = `btn btn-sm ${mainArticle.focused ? "btn-subtle" : "btn-primary"}`;
    els.detailsToggleRead.textContent = mainArticle.read ? "Mark as unread" : "Mark as read";
    els.detailsBody.innerHTML = displayedArticle.contentHtml || "<p>No content available.</p>";

    if (!els.articleLogsWindow.classList.contains("hidden")) {
      renderArticleActivityLog(mainArticle);
    }

    // Build Metadata Table rows for the main/focused article (Labels moved under title)
    const categoriesCellHtml =
      mainArticle.categories && mainArticle.categories.length > 0
        ? `<div class="metadata-pills">${mainArticle.categories
            .map((cat) => `<span class="tag-pill">${escapeHtml(cat)}</span>`)
            .join("")}</div>`
        : "—";

    const linkCellHtml = mainArticle.link
      ? `<a href="${escapeHtml(mainArticle.link)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(
          mainArticle.link
        )}">${escapeHtml(formatShortUrl(mainArticle.link))} ↗</a>`
      : "—";

    const rows = [
      { label: "Source", html: escapeHtml(mainArticle.feedName) },
      { label: "Published", html: `${escapeHtml(formatExactDate(mainArticle.publishedAt))} <span class="mono">(${escapeHtml(formatRelativeTime(mainArticle.publishedAt))})</span>` },
      { label: "Fetched", html: mainArticle.fetchedAt ? escapeHtml(formatExactDate(mainArticle.fetchedAt)) : "—" },
      { label: "Read Status", html: mainArticle.read ? "Read" : "Unread" },
      ...(mainArticle.focused && mainArticle.focusedAt
        ? [{ label: "Focused At", html: escapeHtml(formatExactDate(mainArticle.focusedAt)) }]
        : []),
      ...(mainArticle.linked
        ? [{ label: "Link Status", html: `<span class="linked-badge">Linked</span>` }]
        : []),
      { label: "Categories", html: categoriesCellHtml },
      { label: "Original URL", html: linkCellHtml },
    ];

    els.detailsMetadataTbody.innerHTML = rows
      .map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${row.html}</td></tr>`)
      .join("");

    // Render Linked Articles section below Metadata (Articles + Enrichment with filter)
    const linkedArticleItems = [...(mainArticle.linkedArticles || [])]
      .sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
      .map((entry) => {
        const liveRecord = state.articles.find((a) => a.id === entry.articleId);
        return {
          kind: "article",
          id: entry.articleId,
          title: liveRecord ? liveRecord.title : entry.title || "(Untitled article)",
          feedName: liveRecord ? liveRecord.feedName : entry.feedName || "Unknown feed",
          feedUrl: liveRecord ? liveRecord.feedUrl : "",
          link: liveRecord ? liveRecord.link : entry.link || "",
          publishedAt: liveRecord ? liveRecord.publishedAt : entry.publishedAt,
          matchedLabels: entry.matchedLabels || [],
          canView: Boolean(liveRecord),
          pluginId: null,
        };
      });

    const nessusLinkedItems = (mainArticle.nessusPlugins || []).map((plugin) => {
      const liveEnrich = state.enrichmentItems.find((e) => e.id === plugin.itemId);
      return {
        kind: "enrichment",
        enrichmentSource: "nessus",
        id: plugin.itemId,
        title: plugin.title || "(Untitled plugin)",
        feedName: plugin.feedName || "Tenable Nessus",
        feedUrl: "",
        link: plugin.link || "",
        publishedAt: plugin.publishedAt,
        matchedLabels: plugin.matchedCves || [],
        canView: Boolean(liveEnrich && liveEnrich.contentHtml),
        pluginId: plugin.pluginId || null,
      };
    });

    const kevLinkedItems = (mainArticle.kevItems || []).map((kevItem) => {
      const liveEnrich = state.enrichmentItems.find((e) => e.id === kevItem.itemId);
      return {
        kind: "enrichment",
        enrichmentSource: "kev",
        id: kevItem.itemId,
        title: kevItem.title || "(KEV Entry)",
        feedName: kevItem.feedName || "KEV Catalog",
        feedUrl: "",
        link: kevItem.link || "",
        publishedAt: kevItem.publishedAt,
        matchedLabels: kevItem.matchedCves || [],
        canView: Boolean(liveEnrich && liveEnrich.contentHtml),
        pluginId: null,
      };
    });

    const enrichmentLinkedItems = [...kevLinkedItems, ...nessusLinkedItems];

    const totalLinkedCount = linkedArticleItems.length + enrichmentLinkedItems.length;
    els.detailsLinkedCount.textContent = String(totalLinkedCount);

    els.linkedFilterChips.forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.linkedFilter === state.linkedFilterMode);
    });

    let visibleLinked = [];
    if (state.linkedFilterMode === "articles") {
      visibleLinked = linkedArticleItems;
    } else if (state.linkedFilterMode === "nessus") {
      visibleLinked = nessusLinkedItems;
    } else if (state.linkedFilterMode === "kev") {
      visibleLinked = kevLinkedItems;
    } else {
      visibleLinked = [...linkedArticleItems, ...enrichmentLinkedItems];
    }

    if (!mainArticle.focused && totalLinkedCount === 0) {
      els.detailsLinkedSection.classList.add("hidden");
    } else {
      els.detailsLinkedSection.classList.remove("hidden");
      if (visibleLinked.length === 0) {
        const emptyText =
          state.linkedFilterMode === "nessus"
            ? "No matching Nessus plugins for this article's CVE labels."
            : state.linkedFilterMode === "kev"
            ? "No matching CISA KEV entries for this article's CVE labels."
            : state.linkedFilterMode === "articles"
            ? "No linked RSS articles yet."
            : "No linked articles, KEV entries, or Nessus plugins yet.";
        els.detailsLinkedList.innerHTML = `<p class="linked-empty-hint">${escapeHtml(emptyText)}</p>`;
      } else {
        els.detailsLinkedList.innerHTML = visibleLinked
          .map((item) => {
            const isViewing =
              state.viewingLinkedArticleId === item.id &&
              state.viewingLinkedKind === item.kind;
            const sourceBorderClass =
              item.kind === "enrichment"
                ? item.enrichmentSource === "kev"
                  ? " linked-source-kev"
                  : " linked-source-nessus"
                : "";
            const matchedHtml = (item.matchedLabels || [])
              .map((lbl) => renderLabelPill(lbl, false))
              .join("");
            const kindBadgeHtml =
              item.kind === "enrichment"
                ? item.enrichmentSource === "kev"
                  ? `<span class="feed-type-tag kev">KEV</span>`
                  : `<span class="feed-type-tag enrichment">Nessus</span>${
                      item.pluginId
                        ? `<span class="nessus-plugin-id">#${escapeHtml(item.pluginId)}</span>`
                        : ""
                    }`
                : "";

            return `
              <div class="linked-article-item${isViewing ? " active-viewing" : ""}${sourceBorderClass}">
                <div class="linked-item-title">${escapeHtml(item.title)}</div>
                <div class="linked-item-meta">
                  ${kindBadgeHtml}
                  <span class="linked-item-source">${escapeHtml(item.feedName)}</span>
                  <span>·</span>
                  <span>Published: ${escapeHtml(formatExactDate(item.publishedAt))}</span>
                </div>
                ${matchedHtml ? `<div class="linked-item-matches">${matchedHtml}</div>` : ""}
                <div class="linked-item-actions">
                  ${
                    item.canView
                      ? `<button
                          type="button"
                          class="btn btn-sm ${isViewing ? "btn-primary" : "btn-subtle"}"
                          data-view-linked-id="${escapeHtml(item.id)}"
                          data-view-linked-kind="${escapeHtml(item.kind)}"
                        >
                          ${isViewing ? "Viewing (Main)" : "View Article"}
                        </button>`
                      : ""
                  }
                  ${
                    item.link
                      ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-subtle">External ↗</a>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("");
      }
    }
  }

  // ---- Settings Window: Tab 1 (RSS Subscriptions) ----

  function renderSubscriptionsTab() {
    if (state.feeds.length === 0) {
      els.subscriptionsList.innerHTML = `<div class="empty-state"><p>No subscriptions configured. Click "+ Add Feed" above.</p></div>`;
      return;
    }

    els.subscriptionsList.innerHTML = state.feeds
      .map((feed) => {
        const isEditing = state.editingFeedId === feed.id;
        const metaText = !feed.enabled
          ? "Paused — excluded from automatic pulls"
          : feed.lastStatus === "ok"
          ? `Last pulled ${formatRelativeTime(feed.lastFetchedAt)} (${feed.articleCount || 0} items)`
          : feed.lastStatus === "error"
          ? `Last error: ${feed.lastError || "Unable to fetch feed"}`
          : "Not pulled yet";

        const feedTypeValue =
          feed.feedType === "enrichment"
            ? `enrichment:${feed.enrichmentSource || "nessus"}`
            : "standard";
        const feedTypeLabel =
          feed.feedType === "enrichment"
            ? feed.enrichmentSource === "kev"
              ? "KEV"
              : "Nessus"
            : "Standard";
        const feedTypeClass =
          feed.feedType === "enrichment"
            ? feed.enrichmentSource === "kev"
              ? "kev"
              : "enrichment"
            : "";

        return `
          <div class="subscription-item ${feed.enabled ? "" : "disabled"}" data-feed-id="${feed.id}">
            <div class="subscription-main-row">
              <div class="subscription-info">
                <div class="subscription-title-line">
                  <span class="subscription-name">${escapeHtml(feed.name)}</span>
                  <span class="feed-type-tag ${feedTypeClass}">${escapeHtml(feedTypeLabel)}</span>
                  <span class="subscription-status-tag">${feed.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <div class="subscription-url" title="${escapeHtml(feed.url)}">${escapeHtml(feed.url)}</div>
                <div class="subscription-meta ${feed.lastStatus === "error" && feed.enabled ? "has-error" : ""}">
                  ${escapeHtml(metaText)}
                </div>
              </div>
              <div class="subscription-actions">
                <button type="button" class="btn btn-sm btn-subtle" data-action="edit" data-feed-id="${feed.id}">
                  Edit
                </button>
                <button type="button" class="btn btn-sm ${feed.enabled ? "btn-subtle" : "btn-primary"}" data-action="toggle" data-feed-id="${feed.id}">
                  ${feed.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
            ${
              isEditing
                ? `
              <form class="inline-edit-form" data-edit-form-id="${feed.id}">
                <div class="form-row">
                  <label>Feed Name</label>
                  <input type="text" name="name" value="${escapeHtml(feed.name)}" required />
                </div>
                <div class="form-row">
                  <label>RSS / Atom URL</label>
                  <input type="url" name="url" value="${escapeHtml(feed.url)}" required />
                </div>
                <div class="form-row">
                  <label>Feed Type</label>
                  <select name="feedType">
                    <option value="standard" ${feedTypeValue === "standard" ? "selected" : ""}>Standard Feed (Left Panel)</option>
                    <option value="enrichment:nessus" ${feedTypeValue === "enrichment:nessus" ? "selected" : ""}>Nessus Feed (Tenable Nessus Plugins)</option>
                    <option value="enrichment:kev" ${feedTypeValue === "enrichment:kev" ? "selected" : ""}>KEV Feed (CISA Known Exploited Vulnerabilities)</option>
                  </select>
                </div>
                <div class="form-actions">
                  <div class="form-actions-left">
                    <button type="submit" class="btn btn-sm btn-primary">Save Changes</button>
                    <button type="button" class="btn btn-sm btn-subtle" data-action="cancel-edit">Cancel</button>
                  </div>
                  <div class="form-actions-right">
                    <button type="button" class="btn btn-sm btn-danger" data-action="delete" data-feed-id="${feed.id}">
                      Remove Feed
                    </button>
                  </div>
                </div>
              </form>
            `
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  function renderSyncSettingsTab() {
    els.settingPollInterval.value = String(state.settings.pollIntervalMinutes ?? 15);
    els.settingCorsMode.value = state.settings.corsMode || "auto";
    els.settingCustomProxy.value = state.settings.customProxyUrl || "";
    els.settingMaxArticles.value = String(state.settings.maxArticlesPerFeed ?? 100);
    els.customProxyRow.classList.toggle("hidden", els.settingCorsMode.value !== "custom");
  }

  async function renderDatabaseTab() {
    const stats = await VulnDB.getStorageEstimate();
    els.dbStatFeeds.textContent = String(stats.feedCount);
    els.dbStatArticles.textContent = String(stats.articleCount);
    els.dbStatSize.textContent = `${(stats.approxBytes / 1024).toFixed(1)} KB`;
  }

  // ---- Actions ----

  function getCurrentlyDisplayedArticle() {
    const targetId = state.viewingLinkedArticleId || state.selectedArticleId;
    if (!targetId) return null;
    return state.articles.find((a) => a.id === targetId) || null;
  }

  async function openArticleDetails(articleId, initialLinkedArticleId = null) {
    state.selectedArticleId = articleId;
    state.viewingLinkedArticleId = initialLinkedArticleId || null;
    state.viewingLinkedKind = initialLinkedArticleId ? "article" : null;
    state.linkedFilterMode = "all";
    state.isEditingTitle = false;
    state.isEditingNotes = false;

    const article = state.articles.find((a) => a.id === articleId);
    if (article && !article.read) {
      article.read = true;
      await VulnDB.setArticleRead(articleId, true);
    }
    if (article && Array.isArray(article.newLinks) && article.newLinks.length > 0) {
      article.newLinks = [];
      await VulnDB.clearArticleNewLinks(articleId);
    }

    renderHeaderMeta();
    renderArticleList();
    renderFocusGrid();
    renderSubscriptionStatus();
    renderDetailsWindow();
    if (els.detailsArticlePane) {
      els.detailsArticlePane.scrollTop = 0;
    }
  }

  function renderArticleActivityLog(article) {
    if (!article) return;
    els.articleLogsTitle.textContent = `Activity Log — ${article.title}`;
    const sorted = [...(article.activityLog || [])].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    if (sorted.length === 0) {
      els.articleLogsList.innerHTML = `<div class="event-log-empty">No activity recorded for this article yet.</div>`;
    } else {
      els.articleLogsList.innerHTML = sorted
        .map((ev) => buildEventRowHtml({ ...ev, read: true }))
        .join("");
    }
  }

  function openArticleLogsWindow() {
    const article = state.articles.find((a) => a.id === state.selectedArticleId);
    if (!article) return;
    renderArticleActivityLog(article);
    els.articleLogsBackdrop.classList.remove("hidden");
    els.articleLogsWindow.classList.remove("hidden");
    els.articleLogsBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeArticleLogsWindow() {
    els.articleLogsBackdrop.classList.add("hidden");
    els.articleLogsWindow.classList.add("hidden");
    els.articleLogsBackdrop.setAttribute("aria-hidden", "true");
  }

  function closeArticleDetails() {
    closeLabelPopup();
    closeArticleLogsWindow();
    state.selectedArticleId = null;
    state.viewingLinkedArticleId = null;
    state.viewingLinkedKind = null;
    state.isEditingTitle = false;
    state.isEditingNotes = false;
    renderArticleList();
    renderDetailsWindow();
  }

  function openLabelPopup(anchorEl) {
    const popup = els.labelPopup;
    popup.classList.remove("hidden");

    const rect = anchorEl.getBoundingClientRect();
    const popupWidth = popup.offsetWidth || 248;
    const popupHeight = popup.offsetHeight || 110;

    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + popupWidth > window.innerWidth - 12) {
      left = window.innerWidth - popupWidth - 12;
    }
    if (left < 12) left = 12;

    if (top + popupHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - popupHeight - 6);
    }

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    els.inputAddLabel.value = "";
    els.inputAddLabel.focus();
  }

  function closeLabelPopup() {
    if (!els.labelPopup) return;
    els.labelPopup.classList.add("hidden");
    els.inputAddLabel.value = "";
  }

  function openStatusWindow() {
    renderSubscriptionStatus();
    els.statusBackdrop.classList.remove("hidden");
    els.statusWindow.classList.remove("hidden");
    els.statusBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeStatusWindow() {
    els.statusBackdrop.classList.add("hidden");
    els.statusWindow.classList.add("hidden");
    els.statusBackdrop.setAttribute("aria-hidden", "true");
  }

  function openLogsWindow() {
    els.logsBackdrop.classList.remove("hidden");
    els.logsWindow.classList.remove("hidden");
    els.logsBackdrop.setAttribute("aria-hidden", "false");
    renderEventLogs();
  }

  function closeLogsWindow() {
    els.logsBackdrop.classList.add("hidden");
    els.logsWindow.classList.add("hidden");
    els.logsBackdrop.setAttribute("aria-hidden", "true");
  }

  function clearConfirmUnfocus() {
    if (state.confirmUnfocusTimerId) {
      clearTimeout(state.confirmUnfocusTimerId);
      state.confirmUnfocusTimerId = null;
    }
    if (state.confirmingUnfocusId !== null) {
      state.confirmingUnfocusId = null;
      renderFocusGrid();
    }
  }

  function handleFocusCardUnfocusClick(articleId) {
    if (state.confirmingUnfocusId === articleId) {
      clearConfirmUnfocus();
      toggleFocusArticle(articleId, false);
      return;
    }

    if (state.confirmUnfocusTimerId) {
      clearTimeout(state.confirmUnfocusTimerId);
    }
    state.confirmingUnfocusId = articleId;
    renderFocusGrid();

    state.confirmUnfocusTimerId = setTimeout(() => {
      state.confirmingUnfocusId = null;
      state.confirmUnfocusTimerId = null;
      renderFocusGrid();
    }, 4500);
  }

  async function toggleStarArticle(articleId) {
    const article = state.articles.find((a) => a.id === articleId);
    if (!article) return;

    const nextStarred = !article.starred;
    await VulnDB.setArticleStarred(articleId, nextStarred);
    await reloadFromDB();
    renderAll();
  }

  async function toggleFocusArticle(articleId, explicitState) {
    const article = state.articles.find((a) => a.id === articleId);
    if (!article) return;

    const nextFocused = typeof explicitState === "boolean" ? explicitState : !article.focused;
    const { linkedCount, linkedPairs, addedPlugins, matchedKevCves } =
      await VulnDB.setArticleFocused(articleId, nextFocused);

    if (nextFocused) {
      await VulnDB.addEvent({
        type: "FOCUS_ADD",
        level: "info",
        parts: [
          { text: "Added " },
          { text: article.title, articleId: article.id },
          { text: " to Focus List." },
        ],
      });
      for (const pair of linkedPairs || []) {
        await VulnDB.addEvent({
          type: "LINKED",
          level: "info",
          parts: [
            { text: "Linked " },
            { text: pair.sourceTitle, articleId: pair.sourceId },
            { text: " to focused article " },
            { text: pair.focusTitle, articleId: pair.focusId },
            { text: ` when added to Focus List (matched ${pair.matchedLabels.join(", ")}).` },
          ],
        });
      }
      if (addedPlugins && addedPlugins.length > 0) {
        const cves = Array.from(new Set(addedPlugins.flatMap((p) => p.matchedCves || [])));
        await VulnDB.addEvent({
          type: "ENRICH_LINK",
          level: "info",
          parts: [
            {
              text: `Attached ${addedPlugins.length} Nessus plugin${addedPlugins.length === 1 ? "" : "s"} to `,
            },
            { text: article.title, articleId: article.id },
            { text: ` (matched ${cves.join(", ")}).` },
          ],
        });
      }
      if (matchedKevCves && matchedKevCves.length > 0) {
        await VulnDB.addEvent({
          type: "KEV_ALERT",
          level: "error",
          parts: [
            { text: "Focused article " },
            { text: article.title, articleId: article.id },
            {
              text: ` has CVE${matchedKevCves.length === 1 ? "" : "s"} on the KEV list: ${matchedKevCves.join(", ")}.`,
            },
          ],
        });
      }
    } else {
      await VulnDB.addEvent({
        type: "FOCUS_REMOVE",
        level: "info",
        parts: [
          { text: "Removed " },
          { text: article.title, articleId: article.id },
          { text: " from Focus List." },
        ],
      });
    }

    await reloadFromDB();
    renderAll();

    if (nextFocused) {
      const linkMsg =
        linkedCount > 0
          ? ` Auto-linked ${linkedCount} matching article${linkedCount === 1 ? "" : "s"}.`
          : "";
      showToast(`Added article to Focus List.${linkMsg}`);
    } else {
      showToast("Removed article from Focus List.");
    }
  }

  async function pullAllFeeds(manual = false) {
    if (state.isSyncing) return;

    if (manual) {
      await logEvent("SYNC_MANUAL", "Manual sync triggered by user.");
    }

    const activeFeeds = state.feeds.filter((f) => f.enabled);
    if (activeFeeds.length === 0) {
      if (manual) showToast("No enabled RSS subscriptions to pull.");
      return;
    }

    state.isSyncing = true;
    els.btnRefresh.classList.add("spinning");
    renderHeaderMeta();

    let totalNew = 0;
    let totalLinked = 0;
    let successCount = 0;
    let failCount = 0;

    await Promise.all(
      activeFeeds.map(async (feed) => {
        try {
          const result = await VulnRSS.fetchFeed(feed, state.settings);

          if (feed.feedType === "enrichment") {
            const { newCount, matchedFocusUpdates, matchedKevUpdates } =
              await VulnDB.upsertEnrichmentItemsForFeed(
                feed,
                result.articles,
                Math.max(250, Number(state.settings.maxArticlesPerFeed) || 100)
              );
            successCount++;

            await VulnDB.updateFeed({
              ...feed,
              lastFetchedAt: Date.now(),
              lastStatus: "ok",
              lastError: null,
              articleCount: result.articles.length,
            });

            const totalFocusMatches =
              (matchedFocusUpdates || []).length + (matchedKevUpdates || []).length;
            const matchSuffix =
              totalFocusMatches > 0
                ? `, updated ${totalFocusMatches} focused article${
                    totalFocusMatches === 1 ? "" : "s"
                  }`
                : "";

            await VulnDB.addEvent({
              type: "ENRICH_PULL",
              level: "info",
              parts: [
                {
                  text: `Pulled enrichment feed ${feed.name} (${newCount} new item${
                    newCount === 1 ? "" : "s"
                  }${matchSuffix}).`,
                },
              ],
            });

            for (const upd of matchedFocusUpdates || []) {
              const cves = Array.from(
                new Set(upd.addedPlugins.flatMap((p) => p.matchedCves || []))
              );
              await VulnDB.addEvent({
                type: "ENRICH_LINK",
                level: "info",
                parts: [
                  {
                    text: `Synced ${upd.addedPlugins.length} Nessus plugin${
                      upd.addedPlugins.length === 1 ? "" : "s"
                    } to `,
                  },
                  { text: upd.focusTitle, articleId: upd.focusId },
                  { text: ` (matched ${cves.join(", ")}).` },
                ],
              });
            }

            for (const kevUpd of matchedKevUpdates || []) {
              await VulnDB.addEvent({
                type: "KEV_ALERT",
                level: "error",
                parts: [
                  { text: "Focused article " },
                  { text: kevUpd.focusTitle, articleId: kevUpd.focusId },
                  {
                    text: ` has CVE${
                      kevUpd.matchedCves.length === 1 ? "" : "s"
                    } on the KEV list: ${kevUpd.matchedCves.join(", ")}.`,
                  },
                ],
              });
            }
          } else {
            const { newCount, linkedCount, linkedPairs } = await VulnDB.upsertArticlesForFeed(
              feed.id,
              result.articles,
              Number(state.settings.maxArticlesPerFeed) || 100
            );
            totalNew += newCount;
            totalLinked += linkedCount;
            successCount++;

            await VulnDB.updateFeed({
              ...feed,
              lastFetchedAt: Date.now(),
              lastStatus: "ok",
              lastError: null,
              articleCount: result.articles.length,
            });

            await VulnDB.addEvent({
              type: "RSS_PULL",
              level: "info",
              parts: [
                {
                  text: `Pulled ${feed.name} (${newCount} new article${newCount === 1 ? "" : "s"}).`,
                },
              ],
            });

            for (const pair of linkedPairs || []) {
              await VulnDB.addEvent({
                type: "LINKED",
                level: "info",
                parts: [
                  { text: "Linked " },
                  { text: pair.sourceTitle, articleId: pair.sourceId },
                  { text: " to focused article " },
                  { text: pair.focusTitle, articleId: pair.focusId },
                  { text: ` on RSS pull (matched ${pair.matchedLabels.join(", ")}).` },
                ],
              });
            }
          }
        } catch (err) {
          failCount++;
          const errMsg = err.message || "Failed to fetch feed";
          await VulnDB.updateFeed({
            ...feed,
            lastFetchedAt: Date.now(),
            lastStatus: "error",
            lastError: errMsg,
          });

          const feedKindLabel = feed.feedType === "enrichment" ? "enrichment feed " : "";
          await VulnDB.addEvent({
            type: "RSS_ERROR",
            level: "error",
            parts: [{ text: `Failed to pull ${feedKindLabel}${feed.name}: ${errMsg}.` }],
          });
        }
      })
    );

    state.isSyncing = false;
    els.btnRefresh.classList.remove("spinning");

    await reloadFromDB();
    renderAll();
    scheduleNextPoll();

    if (manual || totalNew > 0) {
      if (failCount === activeFeeds.length) {
        showToast("Could not pull feeds. Check network or CORS settings.", true);
      } else if (totalNew > 0) {
        const linkedSuffix =
          totalLinked > 0 ? `, ${totalLinked} linked to Focus List` : "";
        showToast(
          `Pulled ${totalNew} new article${totalNew === 1 ? "" : "s"}${linkedSuffix} (${successCount}/${activeFeeds.length} feeds).`
        );
      } else if (manual) {
        showToast(`Feeds up to date (${successCount}/${activeFeeds.length} succeeded).`);
      }
    }
  }

  function scheduleNextPoll() {
    if (state.pollTimerId) {
      clearTimeout(state.pollTimerId);
      state.pollTimerId = null;
    }
    if (state.countdownTimerId) {
      clearInterval(state.countdownTimerId);
      state.countdownTimerId = null;
    }

    const minutes = Number(state.settings.pollIntervalMinutes);
    if (!minutes || minutes <= 0) {
      state.nextPollAt = null;
      if (!state.isSyncing) {
        els.syncBtnLabel.textContent = "Sync now";
      }
      return;
    }

    const ms = minutes * 60 * 1000;
    state.nextPollAt = Date.now() + ms;

    const updateCountdown = () => {
      if (!state.nextPollAt || state.isSyncing) return;
      const remainingSec = Math.max(0, Math.ceil((state.nextPollAt - Date.now()) / 1000));
      const m = Math.floor(remainingSec / 60);
      const s = remainingSec % 60;
      els.syncBtnLabel.textContent = `Sync in ${m}m ${String(s).padStart(2, "0")}s`;
    };

    updateCountdown();
    state.countdownTimerId = setInterval(updateCountdown, 1000);
    state.pollTimerId = setTimeout(() => {
      pullAllFeeds(false);
    }, ms);
  }

  // ---- Floating Settings Window Management ----

  function openSettingsWindow() {
    state.editingFeedId = null;
    els.addFeedForm.classList.add("hidden");
    renderSubscriptionsTab();
    renderSyncSettingsTab();
    renderDatabaseTab();

    els.settingsBackdrop.classList.remove("hidden");
    els.settingsWindow.classList.remove("hidden");
    els.settingsBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeSettingsWindow() {
    els.settingsBackdrop.classList.add("hidden");
    els.settingsWindow.classList.add("hidden");
    els.settingsBackdrop.setAttribute("aria-hidden", "true");
    state.editingFeedId = null;
  }

  function switchSettingsTab(tabName) {
    els.tabButtons.forEach((btn) => {
      const isMatch = btn.dataset.tab === tabName;
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", String(isMatch));
    });
    els.tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.id === `tab-panel-${tabName}`);
    });
    if (tabName === "database") {
      renderDatabaseTab();
    }
  }

  function initDraggableWindow() {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    els.settingsTitlebar.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      const rect = els.settingsWindow.getBoundingClientRect();
      els.settingsWindow.classList.add("dragged");
      els.settingsWindow.style.left = `${rect.left}px`;
      els.settingsWindow.style.top = `${rect.top}px`;
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const maxX = window.innerWidth - els.settingsWindow.offsetWidth;
      const maxY = window.innerHeight - els.settingsWindow.offsetHeight;
      const nextLeft = Math.min(Math.max(8, e.clientX - offsetX), Math.max(8, maxX - 8));
      const nextTop = Math.min(Math.max(8, e.clientY - offsetY), Math.max(8, maxY - 8));
      els.settingsWindow.style.left = `${nextLeft}px`;
      els.settingsWindow.style.top = `${nextTop}px`;
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
    });
  }

  // ---- Event Listeners ----

  function bindEvents() {
    els.btnRefresh.addEventListener("click", () => pullAllFeeds(true));

    els.articleSearch.addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      renderArticleList();
    });

    els.filterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.filterMode = chip.dataset.filter;
        els.filterChips.forEach((c) => c.classList.toggle("active", c === chip));
        renderArticleList();
      });
    });

    els.feedFilterSelect.addEventListener("change", (e) => {
      state.filterFeedId = e.target.value;
      renderArticleList();
    });

    els.btnMarkAllRead.addEventListener("click", async () => {
      const visibleUnread = getFilteredArticles()
        .filter((a) => !a.read)
        .map((a) => a.id);
      if (visibleUnread.length > 0) {
        await VulnDB.markArticlesRead(visibleUnread);
      }
      await VulnDB.addEvent({
        type: "MARK_READ",
        level: "info",
        parts: [
          {
            text: `Marked ${visibleUnread.length} article${visibleUnread.length === 1 ? "" : "s"} as read.`,
          },
        ],
      });
      await reloadFromDB();
      renderAll();
      if (visibleUnread.length === 0) {
        showToast("No unread articles in current view.");
      } else {
        showToast(`Marked ${visibleUnread.length} article${visibleUnread.length === 1 ? "" : "s"} as read.`);
      }
    });

    // Clickable rows & article links inside Activity Log (recent bar & full history window)
    const handleEventLogClick = async (e) => {
      const row = e.target.closest(".event-log-row[data-event-id]");
      const linkBtn = e.target.closest("button[data-open-article-id]");

      if (row) {
        const eventId = Number(row.dataset.eventId);
        const ev = state.events.find((item) => item.id === eventId);
        if (ev && !ev.read) {
          ev.read = true;
          await VulnDB.markEventRead(eventId);
          renderEventLogs();
        }
      }

      if (!linkBtn) return;
      const articleId = linkBtn.dataset.openArticleId;
      const exists = state.articles.some((a) => a.id === articleId);
      if (!exists) {
        showToast("This article is no longer stored in the database.", true);
        return;
      }
      if (!els.logsWindow.classList.contains("hidden")) {
        closeLogsWindow();
      }
      openArticleDetails(articleId);
    };

    els.eventLogList.addEventListener("click", handleEventLogClick);
    els.fullLogsList.addEventListener("click", handleEventLogClick);

    els.btnMarkLogsRead.addEventListener("click", async () => {
      await VulnDB.markAllEventsRead();
      state.events = state.events.map((ev) => ({ ...ev, read: true }));
      renderEventLogs();
    });

    els.btnOpenFullLogs.addEventListener("click", openLogsWindow);
    els.btnCloseLogs.addEventListener("click", closeLogsWindow);
    els.logsBackdrop.addEventListener("click", closeLogsWindow);
    els.btnClearLogs.addEventListener("click", async () => {
      await VulnDB.clearEvents();
      state.events = [];
      renderEventLogs();
      showToast("Cleared activity log history.");
    });

    // Subscription Status floating window
    els.btnSubscriptionStatus.addEventListener("click", openStatusWindow);
    els.btnCloseStatus.addEventListener("click", closeStatusWindow);
    els.statusBackdrop.addEventListener("click", closeStatusWindow);

    // Details floating page controls
    els.detailsToggleFocus.addEventListener("click", () => {
      if (!state.selectedArticleId) return;
      toggleFocusArticle(state.selectedArticleId);
    });

    els.detailsToggleRead.addEventListener("click", async () => {
      const article = state.articles.find((a) => a.id === state.selectedArticleId);
      if (!article) return;
      const nextRead = !article.read;
      article.read = nextRead;
      await VulnDB.setArticleRead(article.id, nextRead);
      renderHeaderMeta();
      renderArticleList();
      renderFocusGrid();
      renderDetailsWindow();
    });

    els.btnArticleActivityLog.addEventListener("click", openArticleLogsWindow);
    els.btnCloseArticleLogs.addEventListener("click", closeArticleLogsWindow);
    els.articleLogsBackdrop.addEventListener("click", closeArticleLogsWindow);
    els.articleLogsList.addEventListener("click", (e) => {
      const linkBtn = e.target.closest("button[data-open-article-id]");
      if (!linkBtn) return;
      const articleId = linkBtn.dataset.openArticleId;
      const exists = state.articles.some((a) => a.id === articleId);
      if (!exists) {
        showToast("This article is no longer stored in the database.", true);
        return;
      }
      closeArticleLogsWindow();
      openArticleDetails(articleId);
    });

    els.btnCloseDetails.addEventListener("click", closeArticleDetails);
    els.detailsBackdrop.addEventListener("click", closeArticleDetails);

    els.btnBackToMainArticle.addEventListener("click", () => {
      state.viewingLinkedArticleId = null;
      state.viewingLinkedKind = null;
      state.isEditingTitle = false;
      state.isEditingNotes = false;
      renderDetailsWindow();
      if (els.detailsArticlePane) {
        els.detailsArticlePane.scrollTop = 0;
      }
    });

    // Linked Articles filter chips (All / Articles / Enrichment)
    els.linkedFilterChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.linkedFilterMode = chip.dataset.linkedFilter;
        renderDetailsWindow();
      });
    });

    // Star button inside Article Details (left of title)
    els.btnDetailsStar.addEventListener("click", () => {
      const current = getCurrentlyDisplayedArticle();
      if (!current) return;
      toggleStarArticle(current.id);
    });

    // Edit Article Title (pencil icon next to title)
    els.btnEditTitle.addEventListener("click", () => {
      const current = getCurrentlyDisplayedArticle();
      if (!current) return;
      state.isEditingTitle = true;
      els.inputEditTitle.value = current.title;
      renderDetailsWindow();
      els.inputEditTitle.focus();
      els.inputEditTitle.select();
    });

    els.btnCancelEditTitle.addEventListener("click", () => {
      state.isEditingTitle = false;
      renderDetailsWindow();
    });

    els.editTitleForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const current = getCurrentlyDisplayedArticle();
      if (!current) return;
      const nextTitle = els.inputEditTitle.value.trim();
      if (!nextTitle) return;

      await VulnDB.updateArticleTitle(current.id, nextTitle);
      state.isEditingTitle = false;
      await reloadFromDB();
      renderAll();
      showToast("Updated article title.");
    });

    // Custom Notes (Add / Edit with clickable links)
    const openNotesEditor = () => {
      const current = getCurrentlyDisplayedArticle();
      if (!current) return;
      state.isEditingNotes = true;
      els.textareaNotes.value = current.notes || "";
      renderDetailsWindow();
      els.textareaNotes.focus();
    };

    els.btnAddNotes.addEventListener("click", openNotesEditor);
    els.btnEditNotes.addEventListener("click", openNotesEditor);

    els.btnCancelNotes.addEventListener("click", () => {
      state.isEditingNotes = false;
      renderDetailsWindow();
    });

    els.textareaNotes.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        els.notesEditForm.requestSubmit();
      }
    });

    els.notesEditForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const current = getCurrentlyDisplayedArticle();
      if (!current) return;
      const notesText = els.textareaNotes.value;
      await VulnDB.setArticleNotes(current.id, notesText);
      state.isEditingNotes = false;
      await reloadFromDB();
      renderAll();
      showToast("Saved custom notes.");
    });

    // View linked article or enrichment text on the left side of the Focus Details page
    els.detailsLinkedList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-view-linked-id]");
      if (!btn) return;
      const targetId = btn.dataset.viewLinkedId;
      const targetKind = btn.dataset.viewLinkedKind || "article";
      if (
        state.viewingLinkedArticleId === targetId &&
        state.viewingLinkedKind === targetKind
      ) {
        state.viewingLinkedArticleId = null;
        state.viewingLinkedKind = null;
      } else {
        state.viewingLinkedArticleId = targetId;
        state.viewingLinkedKind = targetKind;
      }
      state.isEditingTitle = false;
      state.isEditingNotes = false;
      renderDetailsWindow();
      if (els.detailsArticlePane) {
        els.detailsArticlePane.scrollTop = 0;
      }
    });

    // Add custom label from popup (enforcing no duplicates & auto-linking if focused)
    els.btnCancelLabelPopup.addEventListener("click", closeLabelPopup);

    els.addLabelForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!state.selectedArticleId) return;
      const raw = els.inputAddLabel.value.trim();
      if (!raw) return;

      const {
        added,
        linkedCount,
        linkedPairs,
        linkedToFocusCount,
        linkedToFocusPairs,
        addedPlugins,
        newlyMatchedKevCves,
      } = await VulnDB.addArticleLabel(state.selectedArticleId, raw);
      closeLabelPopup();
      if (!added) {
        showToast("Label already exists on this article.", true);
        return;
      }

      for (const pair of [...(linkedPairs || []), ...(linkedToFocusPairs || [])]) {
        await VulnDB.addEvent({
          type: "LINKED",
          level: "info",
          parts: [
            { text: "Linked " },
            { text: pair.sourceTitle, articleId: pair.sourceId },
            { text: " to focused article " },
            { text: pair.focusTitle, articleId: pair.focusId },
            { text: ` after manually adding label ${raw}.` },
          ],
        });
      }

      if (addedPlugins && addedPlugins.length > 0) {
        const targetArticle = state.articles.find((a) => a.id === state.selectedArticleId);
        const cves = Array.from(new Set(addedPlugins.flatMap((p) => p.matchedCves || [])));
        await VulnDB.addEvent({
          type: "ENRICH_LINK",
          level: "info",
          parts: [
            {
              text: `Attached ${addedPlugins.length} Nessus plugin${
                addedPlugins.length === 1 ? "" : "s"
              } to `,
            },
            {
              text: targetArticle ? targetArticle.title : "focused article",
              articleId: state.selectedArticleId,
            },
            { text: ` after adding label ${cves.join(", ") || raw}.` },
          ],
        });
      }

      if (newlyMatchedKevCves && newlyMatchedKevCves.length > 0) {
        const targetArticle = state.articles.find((a) => a.id === state.selectedArticleId);
        await VulnDB.addEvent({
          type: "KEV_ALERT",
          level: "error",
          parts: [
            { text: "Focused article " },
            {
              text: targetArticle ? targetArticle.title : "focused article",
              articleId: state.selectedArticleId,
            },
            {
              text: ` has CVE${
                newlyMatchedKevCves.length === 1 ? "" : "s"
              } on the KEV list: ${newlyMatchedKevCves.join(", ")}.`,
            },
          ],
        });
      }

      await reloadFromDB();
      renderAll();

      let linkMsg = "";
      if (linkedCount > 0) {
        linkMsg += ` Auto-linked ${linkedCount} matching article${linkedCount === 1 ? "" : "s"}.`;
      } else if (linkedToFocusCount > 0) {
        linkMsg += ` Linked to ${linkedToFocusCount} focused article${
          linkedToFocusCount === 1 ? "" : "s"
        }.`;
      }
      if (addedPlugins && addedPlugins.length > 0) {
        linkMsg += ` Matched ${addedPlugins.length} Nessus plugin${
          addedPlugins.length === 1 ? "" : "s"
        }.`;
      }
      if (newlyMatchedKevCves && newlyMatchedKevCves.length > 0) {
        linkMsg += ` KEV alert: ${newlyMatchedKevCves.join(", ")}!`;
      }
      showToast(`Added label: ${raw}.${linkMsg}`, newlyMatchedKevCves?.length > 0);
    });

    // Labels bar actions (between title and custom notes): open "+" label popup or remove a label
    els.detailsLabelsBar.addEventListener("click", async (e) => {
      const openBtn = e.target.closest('button[data-action="open-label-popup"]');
      if (openBtn) {
        if (els.labelPopup.classList.contains("hidden")) {
          openLabelPopup(openBtn);
        } else {
          closeLabelPopup();
        }
        return;
      }

      const removeBtn = e.target.closest("button[data-remove-label]");
      if (!removeBtn || !state.selectedArticleId) return;
      const labelToRemove = removeBtn.dataset.removeLabel;
      const focusId = state.selectedArticleId;

      const result = await VulnDB.removeArticleLabel(focusId, labelToRemove);
      if (!result || !result.removed) return;

      // If currently viewing an article that was just unlinked, switch back to main article
      if (
        state.viewingLinkedArticleId &&
        (result.unlinkedArticles || []).some((u) => u.articleId === state.viewingLinkedArticleId)
      ) {
        state.viewingLinkedArticleId = null;
        state.viewingLinkedKind = null;
      }

      if (result.wasFocused) {
        await VulnDB.addEvent({
          type: "LABEL_REMOVED",
          level: "info",
          parts: [
            { text: `Removed label "${labelToRemove}" from focused article ` },
            { text: result.articleTitle, articleId: focusId },
            { text: "." },
          ],
        });

        for (const unlinked of result.unlinkedArticles || []) {
          await VulnDB.addEvent({
            type: "UNLINKED",
            level: "info",
            parts: [
              { text: "Unlinked " },
              { text: unlinked.title, articleId: unlinked.articleId },
              { text: " from focused article " },
              { text: result.articleTitle, articleId: focusId },
              { text: ` after removing label "${labelToRemove}".` },
            ],
          });
        }
      }

      await reloadFromDB();
      renderAll();

      const unlinkedCount = (result.unlinkedArticles || []).length;
      const unlinkMsg =
        unlinkedCount > 0
          ? ` Unlinked ${unlinkedCount} article${unlinkedCount === 1 ? "" : "s"}.`
          : "";
      showToast(`Removed label: ${labelToRemove}.${unlinkMsg}`);
    });

    // Settings open / close / tabs
    els.btnOpenSettings.addEventListener("click", openSettingsWindow);
    els.btnCloseSettings.addEventListener("click", closeSettingsWindow);
    els.settingsBackdrop.addEventListener("click", closeSettingsWindow);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!els.labelPopup.classList.contains("hidden")) {
          closeLabelPopup();
        } else if (!els.articleLogsWindow.classList.contains("hidden")) {
          closeArticleLogsWindow();
        } else if (state.isEditingTitle) {
          state.isEditingTitle = false;
          renderDetailsWindow();
        } else if (state.isEditingNotes) {
          state.isEditingNotes = false;
          renderDetailsWindow();
        } else if (!els.detailsWindow.classList.contains("hidden")) {
          closeArticleDetails();
        } else if (!els.logsWindow.classList.contains("hidden")) {
          closeLogsWindow();
        } else if (!els.statusWindow.classList.contains("hidden")) {
          closeStatusWindow();
        } else if (!els.settingsWindow.classList.contains("hidden")) {
          closeSettingsWindow();
        }
      }
    });

    document.addEventListener("mousedown", (e) => {
      if (
        !els.labelPopup.classList.contains("hidden") &&
        !els.labelPopup.contains(e.target) &&
        !e.target.closest('button[data-action="open-label-popup"]')
      ) {
        closeLabelPopup();
      }
      if (
        state.confirmingUnfocusId &&
        !e.target.closest(`button[data-unfocus-id="${state.confirmingUnfocusId}"]`)
      ) {
        clearConfirmUnfocus();
      }
    });

    els.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => switchSettingsTab(btn.dataset.tab));
    });

    // Add feed form
    els.btnToggleAddFeed.addEventListener("click", () => {
      els.addFeedForm.classList.toggle("hidden");
      if (!els.addFeedForm.classList.contains("hidden")) {
        els.newFeedName.focus();
      }
    });

    els.btnCancelAddFeed.addEventListener("click", () => {
      els.addFeedForm.reset();
      els.addFeedForm.classList.add("hidden");
    });

    els.addFeedForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = els.newFeedName.value.trim();
      const url = els.newFeedUrl.value.trim();
      const typeRaw = els.newFeedType.value || "standard";
      const feedType = typeRaw.startsWith("enrichment") ? "enrichment" : "standard";
      const enrichmentSource =
        typeRaw === "enrichment:kev"
          ? "kev"
          : feedType === "enrichment"
          ? "nessus"
          : null;
      if (!name || !url) return;

      try {
        await VulnDB.addFeed({ name, url, feedType, enrichmentSource, enabled: true });
        await VulnDB.addEvent({
          type: "RSS_ADDED",
          level: "info",
          parts: [
            {
              text: `Added ${feedType === "enrichment" ? "enrichment " : ""}RSS feed ${name} (${url}) to monitoring list.`,
            },
          ],
        });
        els.addFeedForm.reset();
        els.addFeedForm.classList.add("hidden");
        await reloadFromDB();
        renderAll();
        showToast(`Added subscription: ${name}`);
        pullAllFeeds(false);
      } catch (err) {
        showToast(err.message || "Feed URL already exists or could not be saved.", true);
      }
    });

    // Subscriptions list delegation (Edit, Disable/Enable, Delete, Save Edit)
    els.subscriptionsList.addEventListener("click", async (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const feedId = Number(btn.dataset.feedId);

      if (action === "edit") {
        state.editingFeedId = state.editingFeedId === feedId ? null : feedId;
        renderSubscriptionsTab();
        return;
      }

      if (action === "cancel-edit") {
        state.editingFeedId = null;
        renderSubscriptionsTab();
        return;
      }

      if (action === "toggle") {
        const feed = state.feeds.find((f) => f.id === feedId);
        if (!feed) return;
        const updated = { ...feed, enabled: !feed.enabled };
        await VulnDB.updateFeed(updated);
        await VulnDB.addEvent({
          type: updated.enabled ? "RSS_ENABLED" : "RSS_DISABLED",
          level: updated.enabled ? "info" : "warn",
          parts: [
            {
              text: `${updated.enabled ? "Enabled" : "Disabled"} RSS feed ${updated.name}.`,
            },
          ],
        });
        await reloadFromDB();
        renderAll();
        showToast(`${updated.name} ${updated.enabled ? "enabled" : "disabled"}.`);
        return;
      }

      if (action === "delete") {
        const feed = state.feeds.find((f) => f.id === feedId);
        if (!feed) return;
        await VulnDB.deleteFeed(feedId);
        if (state.selectedArticleId && state.selectedArticleId.startsWith(`${feedId}_`)) {
          state.selectedArticleId = null;
        }
        state.editingFeedId = null;
        await reloadFromDB();
        renderAll();
        showToast(`Removed subscription: ${feed.name}`);
      }
    });

    els.subscriptionsList.addEventListener("submit", async (e) => {
      const form = e.target.closest("form[data-edit-form-id]");
      if (!form) return;
      e.preventDefault();

      const feedId = Number(form.dataset.editFormId);
      const feed = state.feeds.find((f) => f.id === feedId);
      if (!feed) return;

      const name = form.elements.name.value.trim();
      const url = form.elements.url.value.trim();
      const typeRaw = (form.elements.feedType && form.elements.feedType.value) || "standard";
      const feedType = typeRaw.startsWith("enrichment") ? "enrichment" : "standard";
      const enrichmentSource =
        typeRaw === "enrichment:kev"
          ? "kev"
          : feedType === "enrichment"
          ? "nessus"
          : null;
      if (!name || !url) return;

      const urlChanged =
        url !== feed.url ||
        feedType !== (feed.feedType || "standard") ||
        enrichmentSource !== (feed.enrichmentSource || null);
      try {
        await VulnDB.updateFeed({
          ...feed,
          name,
          url,
          feedType,
          enrichmentSource,
          lastStatus: urlChanged ? "pending" : feed.lastStatus,
          lastError: urlChanged ? null : feed.lastError,
        });
        state.editingFeedId = null;
        await reloadFromDB();
        renderAll();
        showToast(`Updated subscription: ${name}`);
        if (urlChanged && feed.enabled) {
          pullAllFeeds(false);
        }
      } catch (err) {
        showToast("Could not update feed (URL may duplicate an existing feed).", true);
      }
    });

    // Sync & Network settings tab
    els.settingCorsMode.addEventListener("change", () => {
      els.customProxyRow.classList.toggle("hidden", els.settingCorsMode.value !== "custom");
    });

    els.syncSettingsForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pollIntervalMinutes = Number(els.settingPollInterval.value);
      const corsMode = els.settingCorsMode.value;
      const customProxyUrl = els.settingCustomProxy.value.trim();
      const maxArticlesPerFeed = Math.max(10, Math.min(500, Number(els.settingMaxArticles.value) || 100));

      await Promise.all([
        VulnDB.setSetting("pollIntervalMinutes", pollIntervalMinutes),
        VulnDB.setSetting("corsMode", corsMode),
        VulnDB.setSetting("customProxyUrl", customProxyUrl),
        VulnDB.setSetting("maxArticlesPerFeed", maxArticlesPerFeed),
      ]);

      await reloadFromDB();
      scheduleNextPoll();
      showToast("Sync & network preferences saved to IndexedDB.");
    });

    // Database tab actions
    els.btnExportData.addEventListener("click", async () => {
      const [feeds, settings] = await Promise.all([
        VulnDB.getAllFeeds(),
        VulnDB.getAllSettings(),
      ]);
      const payload = JSON.stringify({ exportedAt: new Date().toISOString(), feeds, settings }, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vulnpokalypse-config.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Exported configuration JSON.");
    });

    els.btnClearArticles.addEventListener("click", async () => {
      await VulnDB.clearAllArticles();
      state.selectedArticleId = null;
      await reloadFromDB();
      renderAll();
      showToast("Cleared all cached articles from IndexedDB.");
    });

    els.btnRestoreDefaults.addEventListener("click", async () => {
      const added = await VulnDB.seedDefaultFeeds();
      await reloadFromDB();
      renderAll();
      if (added > 0) {
        showToast(`Restored ${added} default feed${added === 1 ? "" : "s"}.`);
        pullAllFeeds(false);
      } else {
        showToast("All default feeds are already present.");
      }
    });

    initDraggableWindow();
  }

  // ---- Bootstrap ----

  async function start() {
    try {
      await VulnDB.init();
      await reloadFromDB();
      bindEvents();
      renderAll();
      scheduleNextPoll();

      // Refresh relative timestamps ("X minutes ago") periodically
      setInterval(() => {
        renderFocusGrid();
        renderArticleList();
      }, 60000);

      // Pull RSS feeds immediately on startup
      pullAllFeeds(false);
    } catch (err) {
      console.error("Vulnpokalypse initialization error:", err);
      els.articleList.innerHTML = `<div class="empty-state"><p>Database error: ${escapeHtml(err.message)}</p></div>`;
      showToast(`Startup error: ${err.message}`, true);
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
