/**
 * Vulnpokalypse Tracker — HTML5 IndexedDB Storage Layer
 * Stores all RSS feeds, fetched articles, read statuses, and app preferences.
 */

const VulnDB = (() => {
  const DB_NAME = "VulnpokalypseDB";
  const DB_VERSION = 3;
  const MAX_EVENTS = 300;

  const DEFAULT_FEEDS = [
    {
      name: "Tenable Cyber Exposure Alerts",
      url: "https://www.tenable.com/blog/cyber-exposure-alerts/feed",
      feedType: "standard",
      enrichmentSource: null,
      enabled: true,
    },
    {
      name: "Cloudflare Zero Wire",
      url: "https://radar.cloudflare.com/zero-wire/feed",
      feedType: "standard",
      enrichmentSource: null,
      enabled: true,
    },
    {
      name: "Wiz Blog",
      url: "https://www.wiz.io/feed/rss.xml",
      feedType: "standard",
      enrichmentSource: null,
      enabled: true,
    },
    {
      name: "Tenable Nessus Plugins",
      url: "https://www.tenable.com/blog/cyber-exposure-alerts/feed",
      feedType: "enrichment",
      enrichmentSource: "nessus",
      enabled: true,
    },
    {
      name: "CISA KEV Catalog",
      url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
      feedType: "enrichment",
      enrichmentSource: "kev",
      enabled: true,
    },
  ];

  const DEFAULT_SETTINGS = {
    pollIntervalMinutes: 15,
    corsMode: "auto",
    customProxyUrl: "",
    maxArticlesPerFeed: 100,
    initialized: true,
  };

  let dbInstance = null;

  function open() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("HTML5 IndexedDB is not supported in this browser."));
        return;
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const tx = event.target.transaction;

        if (!db.objectStoreNames.contains("feeds")) {
          const feedStore = db.createObjectStore("feeds", {
            keyPath: "id",
            autoIncrement: true,
          });
          feedStore.createIndex("url", "url", { unique: false });
        } else if (event.oldVersion < 3) {
          // Relax unique constraint on url so standard & enrichment feeds can reference the same URL if needed
          const feedStore = tx.objectStore("feeds");
          if (feedStore.indexNames.contains("url")) {
            feedStore.deleteIndex("url");
          }
          feedStore.createIndex("url", "url", { unique: false });
        }

        if (!db.objectStoreNames.contains("articles")) {
          const articleStore = db.createObjectStore("articles", {
            keyPath: "id",
          });
          articleStore.createIndex("publishedAt", "publishedAt", { unique: false });
          articleStore.createIndex("feedId", "feedId", { unique: false });
        }

        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains("events")) {
          const eventStore = db.createObjectStore("events", {
            keyPath: "id",
            autoIncrement: true,
          });
          eventStore.createIndex("timestamp", "timestamp", { unique: false });
        }

        if (!db.objectStoreNames.contains("enrichmentItems")) {
          const enrichStore = db.createObjectStore("enrichmentItems", {
            keyPath: "id",
          });
          enrichStore.createIndex("feedId", "feedId", { unique: false });
          enrichStore.createIndex("publishedAt", "publishedAt", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        reject(event.target.error || new Error("Failed to open IndexedDB."));
      };
    });
  }

  function withStore(storeName, mode, callback) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          const store = tx.objectStore(storeName);
          let result;
          try {
            result = callback(store, tx);
          } catch (err) {
            reject(err);
            return;
          }

          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error || new Error(`Transaction failed on ${storeName}`));
          tx.onabort = () => reject(tx.error || new Error(`Transaction aborted on ${storeName}`));
        })
    );
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function normalizeLabels(rawLabels) {
    const seen = new Set();
    const result = [];
    for (const raw of rawLabels || []) {
      const trimmed = String(raw || "").trim();
      if (!trimmed) continue;
      const formatted = /^cve-\d{4}-\d{4,7}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
      const key = formatted.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(formatted);
      }
    }
    return result;
  }

  function extractCVEsFromRecord(record) {
    const text = [
      record.title,
      record.link,
      record.excerpt,
      record.contentHtml,
      ...(record.categories || []),
      ...(record.cves || []),
    ]
      .filter(Boolean)
      .join(" ");
    const matches = text.match(/\bCVE-\d{4}-\d{4,7}\b/gi);
    return matches ? matches.map((m) => m.toUpperCase()) : [];
  }

  async function init() {
    await open();

    const initializedFlag = await getSetting("initialized");
    if (!initializedFlag) {
      await seedDefaultFeeds();
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await setSetting(key, value);
      }
      await setSetting("enrichmentSeeded", true);
      await setSetting("kevEnrichmentSeeded", true);
      await setSetting("kevCisaMigrated", true);
    } else {
      const enrichmentSeeded = await getSetting("enrichmentSeeded");
      const kevEnrichmentSeeded = await getSetting("kevEnrichmentSeeded");
      if (!enrichmentSeeded || !kevEnrichmentSeeded) {
        await seedDefaultEnrichmentFeeds();
        await setSetting("enrichmentSeeded", true);
        await setSetting("kevEnrichmentSeeded", true);
      }
      const kevCisaMigrated = await getSetting("kevCisaMigrated");
      if (!kevCisaMigrated) {
        await migrateKevFeedToCisaJson();
        await setSetting("kevCisaMigrated", true);
      }
    }

    await backfillArticleLabels();
  }

  async function migrateKevFeedToCisaJson() {
    const feeds = await getAllFeeds();
    const cisaJsonUrl =
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

    for (const feed of feeds) {
      if (
        feed.feedType === "enrichment" &&
        feed.enrichmentSource === "kev" &&
        feed.url.trim().toLowerCase().includes("kevdb.com")
      ) {
        await updateFeed({
          ...feed,
          name: feed.name === "KEV Catalog" ? "CISA KEV Catalog" : feed.name,
          url: cisaJsonUrl,
          lastStatus: "pending",
          lastError: null,
        });
      }
    }
  }

  async function seedDefaultEnrichmentFeeds() {
    const existing = await getAllFeeds();
    const existingKeys = new Set(
      existing.map((f) => `${(f.feedType || "standard").toLowerCase()}::${f.url.trim().toLowerCase()}`)
    );
    let added = 0;

    for (const feed of DEFAULT_FEEDS.filter((f) => f.feedType === "enrichment")) {
      const key = `${feed.feedType}::${feed.url.toLowerCase()}`;
      if (!existingKeys.has(key)) {
        await addFeed({
          name: feed.name,
          url: feed.url,
          feedType: feed.feedType,
          enrichmentSource: feed.enrichmentSource || "nessus",
          enabled: feed.enabled,
          createdAt: Date.now(),
          lastFetchedAt: null,
          lastStatus: "pending",
          lastError: null,
          articleCount: 0,
        });
        added++;
      }
    }
    return added;
  }

  let activityLogSeq = 0;

  function makeArticleLogEntry(type, parts, level = "info", timestamp = Date.now()) {
    return {
      id: `${timestamp}_${activityLogSeq++}`,
      timestamp,
      type: String(type || "INFO"),
      level,
      parts: typeof parts === "string" ? [{ text: parts }] : parts,
    };
  }

  function appendArticleLog(record, type, parts, level = "info", timestamp = Date.now()) {
    if (!Array.isArray(record.activityLog)) {
      record.activityLog = [];
    }
    record.activityLog.push(makeArticleLogEntry(type, parts, level, timestamp));
  }

  async function backfillArticleLabels() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const record = cursor.value;
        const extractedCves = extractCVEsFromRecord(record);
        const mergedLabels = normalizeLabels([...(record.labels || []), ...extractedCves]);
        const missingLog = !Array.isArray(record.activityLog) || record.activityLog.length === 0;
        const needsUpdate =
          !Array.isArray(record.labels) ||
          mergedLabels.length !== record.labels.length ||
          !Array.isArray(record.linkedArticles) ||
          !Array.isArray(record.linkedTo) ||
          typeof record.linked !== "boolean" ||
          missingLog;

        if (needsUpdate) {
          record.labels = mergedLabels;
          record.cves = normalizeLabels([...(record.cves || []), ...extractedCves]);
          record.linkedArticles = Array.isArray(record.linkedArticles) ? record.linkedArticles : [];
          record.linkedTo = Array.isArray(record.linkedTo) ? record.linkedTo : [];
          record.linked = Boolean(record.linked);
          if (missingLog) {
            record.activityLog = [
              makeArticleLogEntry(
                "CREATED",
                `Article created from RSS pull (${record.feedName || "RSS feed"}).`,
                "info",
                record.fetchedAt || record.publishedAt || Date.now()
              ),
            ];
          }
          cursor.update(record);
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function seedDefaultFeeds() {
    const existing = await getAllFeeds();
    const existingKeys = new Set(
      existing.map((f) => `${(f.feedType || "standard").toLowerCase()}::${f.url.trim().toLowerCase()}`)
    );
    let added = 0;

    for (const feed of DEFAULT_FEEDS) {
      const type = feed.feedType || "standard";
      const key = `${type}::${feed.url.toLowerCase()}`;
      if (!existingKeys.has(key)) {
        await addFeed({
          name: feed.name,
          url: feed.url,
          feedType: type,
          enrichmentSource: feed.enrichmentSource || null,
          enabled: feed.enabled,
          createdAt: Date.now(),
          lastFetchedAt: null,
          lastStatus: "pending",
          lastError: null,
          articleCount: 0,
        });
        added++;
      }
    }
    return added;
  }

  // ---- Feeds ----

  async function getAllFeeds() {
    const db = await open();
    const tx = db.transaction("feeds", "readonly");
    const feeds = await reqToPromise(tx.objectStore("feeds").getAll());
    return feeds
      .map((f) => ({
        ...f,
        feedType: f.feedType || "standard",
        enrichmentSource: f.feedType === "enrichment" ? f.enrichmentSource || "nessus" : null,
      }))
      .sort((a, b) => a.id - b.id);
  }

  async function getFeed(id) {
    const db = await open();
    const tx = db.transaction("feeds", "readonly");
    return reqToPromise(tx.objectStore("feeds").get(Number(id)));
  }

  async function addFeed(feedData) {
    const feedType = feedData.feedType === "enrichment" ? "enrichment" : "standard";
    const record = {
      name: (feedData.name || "").trim(),
      url: (feedData.url || "").trim(),
      feedType,
      enrichmentSource: feedType === "enrichment" ? feedData.enrichmentSource || "nessus" : null,
      enabled: feedData.enabled !== false,
      createdAt: feedData.createdAt || Date.now(),
      lastFetchedAt: feedData.lastFetchedAt || null,
      lastStatus: feedData.lastStatus || "pending",
      lastError: feedData.lastError || null,
      articleCount: feedData.articleCount || 0,
    };

    const db = await open();
    const existing = await getAllFeeds();
    const dup = existing.some(
      (f) =>
        (f.feedType || "standard") === record.feedType &&
        f.url.trim().toLowerCase() === record.url.toLowerCase()
    );
    if (dup) {
      throw new Error("A feed of this type with the same URL already exists.");
    }

    const tx = db.transaction("feeds", "readwrite");
    const id = await reqToPromise(tx.objectStore("feeds").add(record));
    return { ...record, id };
  }

  async function updateFeed(feed) {
    const db = await open();
    const tx = db.transaction("feeds", "readwrite");
    await reqToPromise(tx.objectStore("feeds").put(feed));
    return feed;
  }

  async function deleteFeed(feedId) {
    const idNum = Number(feedId);
    const db = await open();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(["feeds", "articles", "enrichmentItems"], "readwrite");
      tx.objectStore("feeds").delete(idNum);

      const deleteByFeedId = (storeName) => {
        const store = tx.objectStore(storeName);
        const index = store.index("feedId");
        const cursorReq = index.openCursor(IDBKeyRange.only(idNum));
        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      };

      deleteByFeedId("articles");
      deleteByFeedId("enrichmentItems");

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- Articles ----

  async function getAllArticles() {
    const db = await open();
    const tx = db.transaction("articles", "readonly");
    const articles = await reqToPromise(tx.objectStore("articles").getAll());
    // Strictly sorted by most recently published descending
    return articles.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }

  async function upsertArticlesForFeed(feedId, incomingArticles, maxPerFeed = 100) {
    const db = await open();
    let newCount = 0;
    let linkedCount = 0;
    const linkedPairs = [];

    await new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");

      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const allArticles = allReq.result || [];
        const allMap = new Map(allArticles.map((item) => [item.id, item]));
        const feedExistingMap = new Map(
          allArticles.filter((a) => Number(a.feedId) === Number(feedId)).map((item) => [item.id, item])
        );

        const focusedArticles = allArticles.filter((a) => Boolean(a.focused));
        const modifiedFocusedMap = new Map();
        let linkSeq = 0;

        for (const item of incomingArticles) {
          const itemLabels = normalizeLabels([
            ...(item.labels || []),
            ...(item.cves || []),
            ...extractCVEsFromRecord(item),
          ]);
          const prev = allMap.get(item.id);

          if (prev) {
            // Preserve user state, custom title, notes, unseen link notices, and merge labels without duplicates
            const mergedLabels = normalizeLabels([...(prev.labels || []), ...itemLabels]);
            const updatedRecord = {
              ...item,
              title: prev.customTitle ? prev.title : item.title,
              customTitle: Boolean(prev.customTitle),
              notes: typeof prev.notes === "string" ? prev.notes : "",
              labels: mergedLabels,
              cves: normalizeLabels([...(prev.cves || []), ...(item.cves || []), ...extractCVEsFromRecord(item)]),
              read: Boolean(prev.read),
              fetchedAt: prev.fetchedAt || Date.now(),
              focused: Boolean(prev.focused),
              focusedAt: prev.focusedAt || null,
              starred: Boolean(prev.starred),
              starredAt: prev.starredAt || null,
              linked: Boolean(prev.linked),
              linkedTo: Array.isArray(prev.linkedTo) ? prev.linkedTo : [],
              linkedArticles: Array.isArray(prev.linkedArticles) ? prev.linkedArticles : [],
              newLinks: Array.isArray(prev.newLinks) ? prev.newLinks : [],
              nessusPlugins: Array.isArray(prev.nessusPlugins) ? prev.nessusPlugins : [],
              kevCves: Array.isArray(prev.kevCves) ? prev.kevCves : [],
              kevItems: Array.isArray(prev.kevItems) ? prev.kevItems : [],
              activityLog: Array.isArray(prev.activityLog) ? prev.activityLog : [],
            };
            store.put(updatedRecord);
            feedExistingMap.set(updatedRecord.id, updatedRecord);
          } else {
            newCount++;
            const fetchedNow = Date.now();
            const newRecord = {
              ...item,
              customTitle: false,
              notes: "",
              labels: itemLabels,
              cves: normalizeLabels([...(item.cves || []), ...extractCVEsFromRecord(item)]),
              read: false,
              fetchedAt: fetchedNow,
              focused: false,
              focusedAt: null,
              starred: false,
              starredAt: null,
              linked: false,
              linkedTo: [],
              linkedArticles: [],
              newLinks: [],
              nessusPlugins: [],
              kevCves: [],
              kevItems: [],
              activityLog: [
                makeArticleLogEntry(
                  "CREATED",
                  `Article created from RSS pull (${item.feedName || "RSS feed"}).`,
                  "info",
                  fetchedNow
                ),
              ],
            };

            // Check against all articles in Focus List for any matching label
            if (newRecord.labels.length > 0 && focusedArticles.length > 0) {
              const incomingLabelKeys = new Set(newRecord.labels.map((l) => l.toLowerCase()));

              for (const focusArticle of focusedArticles) {
                if (focusArticle.id === newRecord.id) continue;
                const focusLabels = normalizeLabels([
                  ...(focusArticle.labels || []),
                  ...(focusArticle.cves || []),
                ]);
                if (focusLabels.length === 0) continue;

                const matchedLabels = focusLabels.filter((lbl) =>
                  incomingLabelKeys.has(lbl.toLowerCase())
                );

                if (matchedLabels.length > 0) {
                  const currentLinks = Array.isArray(focusArticle.linkedArticles)
                    ? [...focusArticle.linkedArticles]
                    : [];

                  const alreadyLinked = currentLinks.some((entry) => entry.articleId === newRecord.id);
                  if (!alreadyLinked) {
                    const addedAt = Date.now() + linkSeq++;
                    currentLinks.push({
                      articleId: newRecord.id,
                      title: newRecord.title,
                      feedName: newRecord.feedName,
                      link: newRecord.link,
                      publishedAt: newRecord.publishedAt,
                      addedAt,
                      matchedLabels,
                    });
                    // Sort by earliest added first
                    currentLinks.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
                    focusArticle.linkedArticles = currentLinks;

                    const unseen = Array.isArray(focusArticle.newLinks)
                      ? [...focusArticle.newLinks]
                      : [];
                    unseen.push({
                      articleId: newRecord.id,
                      title: newRecord.title,
                      addedAt,
                    });
                    focusArticle.newLinks = unseen;

                    appendArticleLog(
                      focusArticle,
                      "LINKED",
                      [
                        { text: "Linked article " },
                        { text: newRecord.title, articleId: newRecord.id },
                        { text: ` on RSS pull (matched ${matchedLabels.join(", ")}).` },
                      ],
                      "info",
                      addedAt
                    );
                    appendArticleLog(
                      newRecord,
                      "LINKED",
                      [
                        { text: "Linked to focused article " },
                        { text: focusArticle.title, articleId: focusArticle.id },
                        { text: ` on RSS pull (matched ${matchedLabels.join(", ")}).` },
                      ],
                      "info",
                      addedAt
                    );

                    modifiedFocusedMap.set(focusArticle.id, focusArticle);

                    linkedPairs.push({
                      sourceId: newRecord.id,
                      sourceTitle: newRecord.title,
                      focusId: focusArticle.id,
                      focusTitle: focusArticle.title,
                      matchedLabels,
                    });
                  }

                  newRecord.linked = true;
                  newRecord.read = true;
                  if (!newRecord.linkedTo.includes(focusArticle.id)) {
                    newRecord.linkedTo.push(focusArticle.id);
                  }
                }
              }

              if (newRecord.linked) {
                linkedCount++;
              }
            }

            store.put(newRecord);
            feedExistingMap.set(newRecord.id, newRecord);
          }
        }

        // Persist any focused articles that gained new linked articles
        for (const updatedFocus of modifiedFocusedMap.values()) {
          store.put(updatedFocus);
        }

        // Enforce per-feed retention cap (keep newest by publishedAt, never evict focused or linked articles)
        const mergedSorted = Array.from(feedExistingMap.values()).sort(
          (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)
        );
        if (mergedSorted.length > maxPerFeed) {
          const toRemove = mergedSorted.slice(maxPerFeed);
          for (const oldItem of toRemove) {
            if (!oldItem.focused && !oldItem.linked) {
              store.delete(oldItem.id);
            }
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { newCount, linkedCount, linkedPairs };
  }

  async function setArticleRead(articleId, isRead) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const getReq = store.get(articleId);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.read = Boolean(isRead);
          store.put(record);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function linkMatchingExistingArticles(store, focusArticle, allArticles) {
    const focusLabels = normalizeLabels([
      ...(focusArticle.labels || []),
      ...(focusArticle.cves || []),
    ]);
    if (focusLabels.length === 0) return [];

    const focusLabelKeys = new Set(focusLabels.map((l) => l.toLowerCase()));
    const currentLinks = Array.isArray(focusArticle.linkedArticles)
      ? [...focusArticle.linkedArticles]
      : [];
    const existingLinkedIds = new Set(currentLinks.map((entry) => entry.articleId));

    // Sort candidates chronologically so earliest published articles get earliest addedAt
    const candidates = allArticles
      .filter((a) => a.id !== focusArticle.id && !a.focused && !existingLinkedIds.has(a.id))
      .sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0));

    let linkSeq = 0;
    const linkedPairs = [];

    for (const candidate of candidates) {
      const candidateLabels = normalizeLabels([
        ...(candidate.labels || []),
        ...(candidate.cves || []),
      ]);
      if (candidateLabels.length === 0) continue;

      const matchedLabels = candidateLabels.filter((lbl) =>
        focusLabelKeys.has(lbl.toLowerCase())
      );

      if (matchedLabels.length > 0) {
        const addedAt = Date.now() + linkSeq++;
        currentLinks.push({
          articleId: candidate.id,
          title: candidate.title,
          feedName: candidate.feedName,
          link: candidate.link,
          publishedAt: candidate.publishedAt,
          addedAt,
          matchedLabels,
        });

        const unseen = Array.isArray(focusArticle.newLinks) ? [...focusArticle.newLinks] : [];
        unseen.push({
          articleId: candidate.id,
          title: candidate.title,
          addedAt,
        });
        focusArticle.newLinks = unseen;

        candidate.linked = true;
        candidate.read = true;
        candidate.linkedTo = Array.isArray(candidate.linkedTo) ? [...candidate.linkedTo] : [];
        if (!candidate.linkedTo.includes(focusArticle.id)) {
          candidate.linkedTo.push(focusArticle.id);
        }

        appendArticleLog(
          focusArticle,
          "LINKED",
          [
            { text: "Linked article " },
            { text: candidate.title, articleId: candidate.id },
            { text: ` (matched ${matchedLabels.join(", ")}).` },
          ],
          "info",
          addedAt
        );
        appendArticleLog(
          candidate,
          "LINKED",
          [
            { text: "Linked to focused article " },
            { text: focusArticle.title, articleId: focusArticle.id },
            { text: ` (matched ${matchedLabels.join(", ")}).` },
          ],
          "info",
          addedAt
        );

        store.put(candidate);
        linkedPairs.push({
          sourceId: candidate.id,
          sourceTitle: candidate.title,
          focusId: focusArticle.id,
          focusTitle: focusArticle.title,
          matchedLabels,
        });
      }
    }

    if (linkedPairs.length > 0) {
      currentLinks.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
      focusArticle.linkedArticles = currentLinks;
    }

    return linkedPairs;
  }

  function extractCveLabelsFromArticle(article) {
    const raw = normalizeLabels([...(article.labels || []), ...(article.cves || [])]);
    return raw.filter((lbl) => /^CVE-\d{4}-\d{4,7}$/i.test(lbl)).map((lbl) => lbl.toUpperCase());
  }

  function computeMatchingNessusPlugins(article, allEnrichmentItems) {
    const cveLabels = extractCveLabelsFromArticle(article);
    if (cveLabels.length === 0) return [];

    const cveSet = new Set(cveLabels);
    const matches = [];
    const seenKeys = new Set();

    for (const item of allEnrichmentItems || []) {
      if ((item.enrichmentSource || "nessus") !== "nessus") continue;
      const itemCves = normalizeLabels(item.cves || []).map((c) => c.toUpperCase());
      const matchedCves = itemCves.filter((c) => cveSet.has(c));
      if (matchedCves.length === 0) continue;

      const dedupeKey = item.pluginId ? `plugin:${item.pluginId}` : `item:${item.id}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      matches.push({
        itemId: item.id,
        pluginId: item.pluginId || null,
        title: item.title,
        link: item.link || "",
        publishedAt: item.publishedAt || null,
        matchedCves,
        feedName: item.feedName || "Tenable Nessus",
      });
    }

    return matches.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }

  async function getAllEnrichmentItems() {
    const db = await open();
    const tx = db.transaction("enrichmentItems", "readonly");
    const items = await reqToPromise(tx.objectStore("enrichmentItems").getAll());
    return items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
  }

  function computeMatchingKev(article, allEnrichmentItems) {
    const cveLabels = extractCveLabelsFromArticle(article);
    if (cveLabels.length === 0) return { kevCves: [], kevItems: [] };

    const cveSet = new Set(cveLabels);
    const matchedCveSet = new Set();
    const kevItems = [];
    const seenIds = new Set();

    for (const item of allEnrichmentItems || []) {
      if (item.enrichmentSource !== "kev") continue;
      const itemCves = normalizeLabels(item.cves || []).map((c) => c.toUpperCase());
      const matchedCves = itemCves.filter((c) => cveSet.has(c));
      if (matchedCves.length === 0) continue;

      matchedCves.forEach((c) => matchedCveSet.add(c));
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        kevItems.push({
          itemId: item.id,
          title: item.title,
          link: item.link || "",
          publishedAt: item.publishedAt || null,
          matchedCves,
          feedName: item.feedName || "KEV Catalog",
        });
      }
    }

    kevItems.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return {
      kevCves: Array.from(matchedCveSet),
      kevItems,
    };
  }

  async function upsertEnrichmentItemsForFeed(feed, incomingItems, maxPerFeed = 500) {
    const db = await open();
    let newCount = 0;
    const matchedFocusUpdates = [];
    const matchedKevUpdates = [];

    await new Promise((resolve, reject) => {
      const tx = db.transaction(["enrichmentItems", "articles"], "readwrite");
      const enrichStore = tx.objectStore("enrichmentItems");
      const articleStore = tx.objectStore("articles");

      const allEnrichReq = enrichStore.getAll();
      const allArtReq = articleStore.getAll();

      let allEnrichment = null;
      let allArticles = null;

      const process = () => {
        if (allEnrichment === null || allArticles === null) return;

        const enrichById = new Map(allEnrichment.map((i) => [i.id, i]));
        const feedMap = new Map(
          allEnrichment.filter((i) => Number(i.feedId) === Number(feed.id)).map((i) => [i.id, i])
        );

        for (const item of incomingItems) {
          const itemCves = normalizeLabels([
            ...(item.cves || []),
            ...(item.labels || []),
            ...extractCVEsFromRecord(item),
          ])
            .filter((lbl) => /^CVE-\d{4}-\d{4,7}$/i.test(lbl))
            .map((lbl) => lbl.toUpperCase());

          const prev = enrichById.get(item.id);
          const record = {
            id: item.id,
            feedId: feed.id,
            feedName: feed.name,
            enrichmentSource: feed.enrichmentSource || "nessus",
            pluginId: item.pluginId || (prev && prev.pluginId) || null,
            title: item.title,
            link: item.link || "",
            contentHtml: item.contentHtml || (prev && prev.contentHtml) || "",
            publishedAt: item.publishedAt || Date.now(),
            cves: itemCves,
            fetchedAt: prev ? prev.fetchedAt : Date.now(),
          };

          if (!prev) {
            newCount++;
          }
          enrichStore.put(record);
          enrichById.set(record.id, record);
          feedMap.set(record.id, record);
        }

        // Retention cap per enrichment feed (higher cap for KEV catalog)
        const effectiveCap = feed.enrichmentSource === "kev" ? Math.max(2500, maxPerFeed) : maxPerFeed;
        const feedSorted = Array.from(feedMap.values()).sort(
          (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)
        );
        if (feedSorted.length > effectiveCap) {
          for (const oldItem of feedSorted.slice(effectiveCap)) {
            enrichStore.delete(oldItem.id);
            enrichById.delete(oldItem.id);
          }
        }

        // Sync enrichment data with ALL focus articles
        const latestEnrichmentList = Array.from(enrichById.values());
        const focusedArticles = allArticles.filter((a) => Boolean(a.focused));

        for (const focusArticle of focusedArticles) {
          let dirty = false;

          if ((feed.enrichmentSource || "nessus") === "nessus") {
            const prevPlugins = Array.isArray(focusArticle.nessusPlugins)
              ? focusArticle.nessusPlugins
              : [];
            const prevKeys = new Set(
              prevPlugins.map((p) => (p.pluginId ? `plugin:${p.pluginId}` : `item:${p.itemId}`))
            );

            const nextPlugins = computeMatchingNessusPlugins(focusArticle, latestEnrichmentList);
            const addedPlugins = nextPlugins.filter((p) => {
              const key = p.pluginId ? `plugin:${p.pluginId}` : `item:${p.itemId}`;
              return !prevKeys.has(key);
            });

            if (addedPlugins.length > 0 || nextPlugins.length !== prevPlugins.length) {
              focusArticle.nessusPlugins = nextPlugins;
              dirty = true;
            }

            if (addedPlugins.length > 0) {
              for (const plugin of addedPlugins) {
                appendArticleLog(
                  focusArticle,
                  "NESSUS_LINKED",
                  `Linked Nessus plugin "${plugin.title}" (matched ${(plugin.matchedCves || []).join(", ")}).`,
                  "info"
                );
              }
              matchedFocusUpdates.push({
                focusId: focusArticle.id,
                focusTitle: focusArticle.title,
                addedPlugins,
              });
            }
          }

          if (feed.enrichmentSource === "kev") {
            const prevKevCves = new Set(
              (Array.isArray(focusArticle.kevCves) ? focusArticle.kevCves : []).map((c) =>
                c.toUpperCase()
              )
            );
            const { kevCves, kevItems } = computeMatchingKev(focusArticle, latestEnrichmentList);
            const newlyMatchedKevCves = kevCves.filter((c) => !prevKevCves.has(c));

            if (
              newlyMatchedKevCves.length > 0 ||
              kevCves.length !== prevKevCves.size ||
              kevItems.length !== (focusArticle.kevItems || []).length
            ) {
              focusArticle.kevCves = kevCves;
              focusArticle.kevItems = kevItems;
              dirty = true;
            }

            if (newlyMatchedKevCves.length > 0) {
              appendArticleLog(
                focusArticle,
                "KEV_LINKED",
                `Linked CISA KEV exploited CVE${
                  newlyMatchedKevCves.length === 1 ? "" : "s"
                }: ${newlyMatchedKevCves.join(", ")}.`,
                "error"
              );
              matchedKevUpdates.push({
                focusId: focusArticle.id,
                focusTitle: focusArticle.title,
                matchedCves: newlyMatchedKevCves,
              });
            }
          }

          if (dirty) {
            articleStore.put(focusArticle);
          }
        }
      };

      allEnrichReq.onsuccess = () => {
        allEnrichment = allEnrichReq.result || [];
        process();
      };
      allArtReq.onsuccess = () => {
        allArticles = allArtReq.result || [];
        process();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { newCount, matchedFocusUpdates, matchedKevUpdates };
  }

  async function setArticleFocused(articleId, isFocused) {
    const db = await open();
    let linkedPairs = [];
    let addedPlugins = [];
    let matchedKevCves = [];

    await new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "enrichmentItems"], "readwrite");
      const store = tx.objectStore("articles");
      const enrichStore = tx.objectStore("enrichmentItems");

      let allArticles = null;
      let allEnrichment = null;

      const process = () => {
        if (allArticles === null || allEnrichment === null) return;
        const record = allArticles.find((a) => a.id === articleId);
        if (!record) return;

        record.focused = Boolean(isFocused);
        record.focusedAt = isFocused ? Date.now() : null;

        if (record.focused) {
          appendArticleLog(record, "FOCUS_ADD", "Added article to Focus List.", "info");
          linkedPairs = linkMatchingExistingArticles(store, record, allArticles);
          const prevPlugins = Array.isArray(record.nessusPlugins) ? record.nessusPlugins : [];
          const prevKeys = new Set(
            prevPlugins.map((p) => (p.pluginId ? `plugin:${p.pluginId}` : `item:${p.itemId}`))
          );
          const matchedPlugins = computeMatchingNessusPlugins(record, allEnrichment);
          addedPlugins = matchedPlugins.filter((p) => {
            const key = p.pluginId ? `plugin:${p.pluginId}` : `item:${p.itemId}`;
            return !prevKeys.has(key);
          });
          record.nessusPlugins = matchedPlugins;
          for (const plugin of addedPlugins) {
            appendArticleLog(
              record,
              "NESSUS_LINKED",
              `Linked Nessus plugin "${plugin.title}" (matched ${(plugin.matchedCves || []).join(", ")}).`,
              "info"
            );
          }

          const { kevCves, kevItems } = computeMatchingKev(record, allEnrichment);
          matchedKevCves = kevCves;
          record.kevCves = kevCves;
          record.kevItems = kevItems;
          if (kevCves.length > 0) {
            appendArticleLog(
              record,
              "KEV_LINKED",
              `Linked CISA KEV exploited CVE${kevCves.length === 1 ? "" : "s"}: ${kevCves.join(", ")}.`,
              "error"
            );
          }
        } else {
          appendArticleLog(record, "FOCUS_REMOVE", "Removed article from Focus List.", "info");
        }

        store.put(record);
      };

      store.getAll().onsuccess = (e) => {
        allArticles = e.target.result || [];
        process();
      };
      enrichStore.getAll().onsuccess = (e) => {
        allEnrichment = e.target.result || [];
        process();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { linkedCount: linkedPairs.length, linkedPairs, addedPlugins, matchedKevCves };
  }

  async function clearFocusList() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.focused) {
            cursor.value.focused = false;
            cursor.value.focusedAt = null;
            cursor.update(cursor.value);
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function addArticleLabel(articleId, rawLabel) {
    const db = await open();
    let updatedLabels = [];
    let added = false;
    let linkedPairs = [];
    let linkedToFocusPairs = [];
    let addedPlugins = [];
    let newlyMatchedKevCves = [];

    await new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "enrichmentItems"], "readwrite");
      const store = tx.objectStore("articles");
      const enrichStore = tx.objectStore("enrichmentItems");

      let allArticles = null;
      let allEnrichment = null;

      const process = () => {
        if (allArticles === null || allEnrichment === null) return;
        const record = allArticles.find((a) => a.id === articleId);
        if (!record) return;

        const current = normalizeLabels(record.labels || []);
        const next = normalizeLabels([...current, rawLabel]);
        added = next.length > current.length;
        updatedLabels = next;

        if (added) {
          const addedLabel = next[next.length - 1];
          const addedKey = addedLabel.toLowerCase();
          record.labels = next;
          appendArticleLog(record, "LABEL_ADDED", `Added label "${addedLabel}".`, "info");

          if (record.focused) {
            linkedPairs = linkMatchingExistingArticles(store, record, allArticles);

            // Check if there are relevant Nessus plugins for the newly added CVE label
            const prevPlugins = Array.isArray(record.nessusPlugins) ? record.nessusPlugins : [];
            const prevKeys = new Set(
              prevPlugins.map((p) => (p.pluginId ? `plugin:${p.pluginId}` : `item:${p.itemId}`))
            );
            const matchedPlugins = computeMatchingNessusPlugins(record, allEnrichment);
            addedPlugins = matchedPlugins.filter((p) => {
              const key = p.pluginId ? `plugin:${p.pluginId}` : `item:${p.itemId}`;
              return !prevKeys.has(key);
            });
            record.nessusPlugins = matchedPlugins;
            for (const plugin of addedPlugins) {
              appendArticleLog(
                record,
                "NESSUS_LINKED",
                `Linked Nessus plugin "${plugin.title}" (matched ${(plugin.matchedCves || []).join(", ")}).`,
                "info"
              );
            }

            // Check if the newly added CVE label is in KEV
            const prevKevSet = new Set(
              (Array.isArray(record.kevCves) ? record.kevCves : []).map((c) => c.toUpperCase())
            );
            const { kevCves, kevItems } = computeMatchingKev(record, allEnrichment);
            newlyMatchedKevCves = kevCves.filter((c) => !prevKevSet.has(c));
            record.kevCves = kevCves;
            record.kevItems = kevItems;
            if (newlyMatchedKevCves.length > 0) {
              appendArticleLog(
                record,
                "KEV_LINKED",
                `Linked CISA KEV exploited CVE${
                  newlyMatchedKevCves.length === 1 ? "" : "s"
                }: ${newlyMatchedKevCves.join(", ")}.`,
                "error"
              );
            }
          } else {
            // Check if this label exists in any article in the Focus List and link them
            const focusedArticles = allArticles.filter(
              (a) => Boolean(a.focused) && a.id !== record.id
            );
            let linkSeq = 0;

            for (const focusArticle of focusedArticles) {
              const focusLabels = normalizeLabels([
                ...(focusArticle.labels || []),
                ...(focusArticle.cves || []),
              ]);
              const matched = focusLabels.find((lbl) => lbl.toLowerCase() === addedKey);
              if (!matched) continue;

              const currentLinks = Array.isArray(focusArticle.linkedArticles)
                ? [...focusArticle.linkedArticles]
                : [];
              const existingEntry = currentLinks.find((entry) => entry.articleId === record.id);

              if (existingEntry) {
                existingEntry.matchedLabels = normalizeLabels([
                  ...(existingEntry.matchedLabels || []),
                  matched,
                ]);
              } else {
                const addedAt = Date.now() + linkSeq++;
                currentLinks.push({
                  articleId: record.id,
                  title: record.title,
                  feedName: record.feedName,
                  link: record.link,
                  publishedAt: record.publishedAt,
                  addedAt,
                  matchedLabels: [matched],
                });
                currentLinks.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

                const unseen = Array.isArray(focusArticle.newLinks)
                  ? [...focusArticle.newLinks]
                  : [];
                unseen.push({
                  articleId: record.id,
                  title: record.title,
                  addedAt,
                });
                focusArticle.newLinks = unseen;

                appendArticleLog(
                  focusArticle,
                  "LINKED",
                  [
                    { text: "Linked article " },
                    { text: record.title, articleId: record.id },
                    { text: ` (matched ${matched}).` },
                  ],
                  "info",
                  addedAt
                );
                appendArticleLog(
                  record,
                  "LINKED",
                  [
                    { text: "Linked to focused article " },
                    { text: focusArticle.title, articleId: focusArticle.id },
                    { text: ` (matched ${matched}).` },
                  ],
                  "info",
                  addedAt
                );

                linkedToFocusPairs.push({
                  sourceId: record.id,
                  sourceTitle: record.title,
                  focusId: focusArticle.id,
                  focusTitle: focusArticle.title,
                  matchedLabels: [matched],
                });
              }

              focusArticle.linkedArticles = currentLinks;
              store.put(focusArticle);

              record.linked = true;
              record.read = true;
              record.linkedTo = Array.isArray(record.linkedTo) ? [...record.linkedTo] : [];
              if (!record.linkedTo.includes(focusArticle.id)) {
                record.linkedTo.push(focusArticle.id);
              }
            }
          }

          store.put(record);
        }
      };

      store.getAll().onsuccess = (e) => {
        allArticles = e.target.result || [];
        process();
      };
      enrichStore.getAll().onsuccess = (e) => {
        allEnrichment = e.target.result || [];
        process();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return {
      added,
      labels: updatedLabels,
      linkedCount: linkedPairs.length,
      linkedPairs,
      linkedToFocusCount: linkedToFocusPairs.length,
      linkedToFocusPairs,
      addedPlugins,
      newlyMatchedKevCves,
    };
  }

  async function removeArticleLabel(articleId, labelToRemove) {
    const db = await open();
    const targetKey = String(labelToRemove || "").trim().toLowerCase();
    let updatedLabels = [];

    await new Promise((resolve, reject) => {
      const tx = db.transaction(["articles", "enrichmentItems"], "readwrite");
      const store = tx.objectStore("articles");
      const enrichStore = tx.objectStore("enrichmentItems");

      let record = null;
      let allEnrichment = null;

      const process = () => {
        if (record === null || allEnrichment === null) return;
        if (!record) return;
        updatedLabels = normalizeLabels(record.labels || []).filter(
          (lbl) => lbl.toLowerCase() !== targetKey
        );
        if (updatedLabels.length < (record.labels || []).length) {
          appendArticleLog(record, "LABEL_REMOVED", `Removed label "${labelToRemove}".`, "info");
        }
        record.labels = updatedLabels;
        if (record.focused) {
          record.nessusPlugins = computeMatchingNessusPlugins(record, allEnrichment);
          const { kevCves, kevItems } = computeMatchingKev(record, allEnrichment);
          record.kevCves = kevCves;
          record.kevItems = kevItems;
        }
        store.put(record);
      };

      store.get(articleId).onsuccess = (e) => {
        record = e.target.result || false;
        process();
      };
      enrichStore.getAll().onsuccess = (e) => {
        allEnrichment = e.target.result || [];
        process();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return updatedLabels;
  }

  async function setArticleStarred(articleId, isStarred) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const getReq = store.get(articleId);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return;
        record.starred = Boolean(isStarred);
        record.starredAt = isStarred ? Date.now() : null;
        appendArticleLog(
          record,
          record.starred ? "STARRED" : "UNSTARRED",
          record.starred ? "Starred article." : "Unstarred article.",
          "info"
        );
        store.put(record);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearArticleNewLinks(articleId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const getReq = store.get(articleId);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record && Array.isArray(record.newLinks) && record.newLinks.length > 0) {
          record.newLinks = [];
          store.put(record);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function updateArticleTitle(articleId, newTitle) {
    const cleaned = String(newTitle || "").trim();
    if (!cleaned) return null;
    const db = await open();

    await new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const allReq = store.getAll();

      allReq.onsuccess = () => {
        const allArticles = allReq.result || [];
        const record = allArticles.find((a) => a.id === articleId);
        if (!record) return;

        record.title = cleaned;
        record.customTitle = true;
        store.put(record);

        // Keep any linkedArticles snapshots referencing this article in sync
        for (const other of allArticles) {
          if (other.id === articleId) continue;
          let changed = false;
          if (Array.isArray(other.linkedArticles)) {
            for (const entry of other.linkedArticles) {
              if (entry.articleId === articleId) {
                entry.title = cleaned;
                changed = true;
              }
            }
          }
          if (Array.isArray(other.newLinks)) {
            for (const notice of other.newLinks) {
              if (notice.articleId === articleId) {
                notice.title = cleaned;
                changed = true;
              }
            }
          }
          if (changed) {
            store.put(other);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return cleaned;
  }

  async function setArticleNotes(articleId, notesText) {
    const db = await open();
    const cleaned = String(notesText || "");

    await new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");
      const getReq = store.get(articleId);

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return;
        record.notes = cleaned;
        appendArticleLog(
          record,
          "NOTES_EDITED",
          cleaned.trim() ? "Custom notes edited." : "Custom notes cleared.",
          "info"
        );
        store.put(record);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return cleaned;
  }

  async function markArticlesRead(articleIds) {
    if (!articleIds || articleIds.length === 0) return;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("articles", "readwrite");
      const store = tx.objectStore("articles");

      for (const id of articleIds) {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          const record = getReq.result;
          if (record && !record.read) {
            record.read = true;
            store.put(record);
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearAllArticles() {
    await withStore("articles", "readwrite", (store) => {
      store.clear();
    });
  }

  // ---- Event Logs ----

  async function addEvent({ type, level = "info", parts = [], timestamp = Date.now() }) {
    const db = await open();
    const record = {
      timestamp,
      type: String(type || "INFO"),
      level,
      read: false,
      parts: Array.isArray(parts) ? parts : [{ text: String(parts || "") }],
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction("events", "readwrite");
      const store = tx.objectStore("events");
      store.add(record);

      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const all = allReq.result || [];
        if (all.length > MAX_EVENTS) {
          all.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0) || (a.id || 0) - (b.id || 0));
          const excess = all.slice(0, all.length - MAX_EVENTS);
          for (const oldEv of excess) {
            store.delete(oldEv.id);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return record;
  }

  async function markEventRead(eventId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("events", "readwrite");
      const store = tx.objectStore("events");
      const getReq = store.get(Number(eventId));

      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record && !record.read) {
          record.read = true;
          store.put(record);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function markAllEventsRead() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("events", "readwrite");
      const store = tx.objectStore("events");
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        if (!cursor.value.read) {
          cursor.value.read = true;
          cursor.update(cursor.value);
        }
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getAllEvents() {
    const db = await open();
    const tx = db.transaction("events", "readonly");
    const events = await reqToPromise(tx.objectStore("events").getAll());
    return events.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0) || (b.id || 0) - (a.id || 0));
  }

  async function clearEvents() {
    await withStore("events", "readwrite", (store) => {
      store.clear();
    });
  }

  // ---- Settings ----

  async function getSetting(key) {
    const db = await open();
    const tx = db.transaction("settings", "readonly");
    const row = await reqToPromise(tx.objectStore("settings").get(key));
    return row ? row.value : undefined;
  }

  async function setSetting(key, value) {
    await withStore("settings", "readwrite", (store) => {
      store.put({ key, value });
    });
  }

  async function getAllSettings() {
    const db = await open();
    const tx = db.transaction("settings", "readonly");
    const rows = await reqToPromise(tx.objectStore("settings").getAll());
    const result = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async function getStorageEstimate() {
    const db = await open();
    const enrichTx = db.transaction("enrichmentItems", "readonly");
    const [feeds, articles, settings, events, enrichmentItems] = await Promise.all([
      getAllFeeds(),
      getAllArticles(),
      getAllSettings(),
      getAllEvents(),
      reqToPromise(enrichTx.objectStore("enrichmentItems").getAll()),
    ]);
    const approxBytes = new Blob([
      JSON.stringify({ feeds, articles, settings, events, enrichmentItems }),
    ]).size;
    return {
      feedCount: feeds.length,
      articleCount: articles.length,
      eventCount: events.length,
      enrichmentCount: enrichmentItems.length,
      approxBytes,
    };
  }

  return {
    DEFAULT_FEEDS,
    DEFAULT_SETTINGS,
    init,
    seedDefaultFeeds,
    getAllFeeds,
    getFeed,
    addFeed,
    updateFeed,
    deleteFeed,
    getAllArticles,
    getAllEnrichmentItems,
    upsertArticlesForFeed,
    upsertEnrichmentItemsForFeed,
    setArticleRead,
    setArticleFocused,
    setArticleStarred,
    clearArticleNewLinks,
    updateArticleTitle,
    setArticleNotes,
    addArticleLabel,
    removeArticleLabel,
    clearFocusList,
    markArticlesRead,
    clearAllArticles,
    addEvent,
    getAllEvents,
    markEventRead,
    markAllEventsRead,
    clearEvents,
    getSetting,
    setSetting,
    getAllSettings,
    getStorageEstimate,
  };
})();
