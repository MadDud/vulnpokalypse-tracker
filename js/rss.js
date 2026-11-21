/**
 * Vulnpokalypse Tracker — RSS / Atom Fetcher, Parser & Sanitizer
 */

const VulnRSS = (() => {
  const FETCH_TIMEOUT_MS = 14000;

  const PUBLIC_PROXIES = [
    {
      name: "allorigins-raw",
      type: "xml",
      buildUrl: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    },
    {
      name: "corsproxy",
      type: "xml",
      buildUrl: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
    },
    {
      name: "codetabs",
      type: "xml",
      buildUrl: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    },
    {
      name: "rss2json",
      type: "rss2json",
      buildUrl: (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
    },
  ];

  function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, {
      ...options,
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  }

  function buildCustomProxyUrl(template, feedUrl) {
    const clean = (template || "").trim();
    if (!clean) return null;
    if (clean.includes("{url}")) {
      return clean.replace("{url}", encodeURIComponent(feedUrl));
    }
    return `${clean}${encodeURIComponent(feedUrl)}`;
  }

  function hashString(input) {
    let hash = 2166136261;
    const str = String(input || "");
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function extractCVEs(text) {
    if (!text) return [];
    const matches = String(text).match(/\bCVE-\d{4}-\d{4,7}\b/gi);
    if (!matches) return [];
    return Array.from(new Set(matches.map((m) => m.toUpperCase())));
  }

  function extractNessusPluginId(text) {
    if (!text) return null;
    const str = String(text);
    const urlMatch = str.match(/\/plugins\/(?:nessus|was|nnm|lce)\/(\d{3,8})\b/i);
    if (urlMatch) return urlMatch[1];
    const labelMatch = str.match(/\bplugin(?:\s+id)?\s*[:#-]?\s*(\d{4,8})\b/i);
    if (labelMatch) return labelMatch[1];
    return null;
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

  function extractAllItemMetadataText(xmlNode) {
    const parts = [xmlNode.textContent || ""];
    xmlNode.querySelectorAll("*").forEach((el) => {
      for (const attr of Array.from(el.attributes || [])) {
        if (attr.value) parts.push(attr.value);
      }
    });
    return parts.join(" ");
  }

  function stripHtmlToText(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeHtml(rawHtml) {
    if (!rawHtml) return "<p>No summary provided in this feed entry.</p>";

    const doc = new DOMParser().parseFromString(rawHtml, "text/html");
    const forbiddenTags = [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "meta",
      "link",
      "base",
      "svg",
    ];

    for (const tag of forbiddenTags) {
      doc.body.querySelectorAll(tag).forEach((el) => el.remove());
    }

    const allNodes = doc.body.querySelectorAll("*");
    allNodes.forEach((el) => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        const name = attr.name.toLowerCase();
        const val = (attr.value || "").trim();

        // Strip inline event handlers, inline styles (prevents bright colors!), and class overrides
        if (name.startsWith("on") || name === "style" || name === "class" || name === "id") {
          el.removeAttribute(attr.name);
          continue;
        }

        if (name === "href" || name === "src") {
          if (!/^https?:\/\//i.test(val)) {
            el.removeAttribute(attr.name);
          }
        }
      }

      if (el.tagName === "A") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
      if (el.tagName === "IMG") {
        el.setAttribute("loading", "lazy");
      }
    });

    const cleaned = doc.body.innerHTML.trim();
    return cleaned || "<p>No summary provided in this feed entry.</p>";
  }

  function parseDateMs(dateStr) {
    if (!dateStr) return null;
    const trimmed = dateStr.trim();
    // Normalize SQL-style timestamps (e.g. from rss2json: "2026-11-21 15:30:00")
    const normalized = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(trimmed)
      ? trimmed.replace(/\s+/, "T") + "Z"
      : trimmed;
    const parsed = Date.parse(normalized);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    return null;
  }

  function getFirstChildText(node, selectors) {
    for (const sel of selectors) {
      // Handle namespaced tags like content:encoded or dc:creator
      const direct = Array.from(node.children).find(
        (child) =>
          child.tagName.toLowerCase() === sel.toLowerCase() ||
          child.localName?.toLowerCase() === sel.toLowerCase()
      );
      if (direct && direct.textContent && direct.textContent.trim()) {
        return direct.textContent.trim();
      }
    }
    return "";
  }

  function extractAtomLink(entry) {
    const links = Array.from(entry.children).filter(
      (c) => c.localName?.toLowerCase() === "link"
    );
    const alternate = links.find(
      (l) => (l.getAttribute("rel") || "alternate").toLowerCase() === "alternate" && l.getAttribute("href")
    );
    if (alternate) return alternate.getAttribute("href").trim();
    const withHref = links.find((l) => l.getAttribute("href"));
    if (withHref) return withHref.getAttribute("href").trim();
    return getFirstChildText(entry, ["link"]);
  }

  function parseXmlFeed(xmlText, feed) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
    const parseErr = xmlDoc.querySelector("parsererror");
    if (parseErr) {
      throw new Error("Invalid XML response received");
    }

    const articles = [];

    // Check RSS 2.0 / RDF items
    const rssItems = Array.from(xmlDoc.querySelectorAll("item"));
    if (rssItems.length > 0) {
      for (const item of rssItems) {
        const title = getFirstChildText(item, ["title"]) || "(Untitled advisory)";
        const link = getFirstChildText(item, ["link", "guid"]);
        const guid = getFirstChildText(item, ["guid"]) || link || title;
        const pubDateRaw = getFirstChildText(item, ["pubDate", "dc:date", "date", "published", "updated"]);
        const author = getFirstChildText(item, ["dc:creator", "author", "creator"]);
        const contentRaw =
          getFirstChildText(item, ["content:encoded", "encoded", "description", "summary", "content"]) || "";

        const categories = Array.from(item.children)
          .filter((c) => c.localName?.toLowerCase() === "category")
          .map((c) => c.textContent.trim())
          .filter(Boolean)
          .slice(0, 6);

        const publishedAt = parseDateMs(pubDateRaw) || Date.now();
        const fullPlainText = stripHtmlToText(contentRaw);
        const plainExcerpt = fullPlainText.slice(0, 260);
        const rawXmlMetaText = extractAllItemMetadataText(item);
        const cves = extractCVEs(
          `${title} ${link} ${guid} ${categories.join(" ")} ${fullPlainText} ${rawXmlMetaText}`
        );
        const labels = normalizeLabels(cves);
        const pluginId = extractNessusPluginId(`${link} ${guid} ${title} ${fullPlainText}`);

        articles.push({
          id: `${feed.id}_${hashString(guid)}`,
          feedId: feed.id,
          feedName: feed.name,
          title: stripHtmlToText(title),
          link: /^https?:\/\//i.test(link) ? link : "",
          author: stripHtmlToText(author),
          publishedAt,
          excerpt: plainExcerpt,
          contentHtml: sanitizeHtml(contentRaw),
          categories,
          cves,
          labels,
          pluginId,
        });
      }
      return articles;
    }

    // Check Atom entries
    const atomEntries = Array.from(xmlDoc.querySelectorAll("entry"));
    if (atomEntries.length > 0) {
      for (const entry of atomEntries) {
        const title = getFirstChildText(entry, ["title"]) || "(Untitled advisory)";
        const link = extractAtomLink(entry);
        const entryId = getFirstChildText(entry, ["id"]) || link || title;
        const pubDateRaw = getFirstChildText(entry, ["published", "updated", "dc:date"]);
        const authorEl = Array.from(entry.children).find(
          (c) => c.localName?.toLowerCase() === "author"
        );
        const author = authorEl
          ? getFirstChildText(authorEl, ["name"]) || authorEl.textContent.trim()
          : "";
        const contentRaw =
          getFirstChildText(entry, ["content", "summary", "description"]) || "";

        const categories = Array.from(entry.children)
          .filter((c) => c.localName?.toLowerCase() === "category")
          .map((c) => (c.getAttribute("label") || c.getAttribute("term") || c.textContent || "").trim())
          .filter(Boolean)
          .slice(0, 6);

        const publishedAt = parseDateMs(pubDateRaw) || Date.now();
        const fullPlainText = stripHtmlToText(contentRaw);
        const plainExcerpt = fullPlainText.slice(0, 260);
        const rawXmlMetaText = extractAllItemMetadataText(entry);
        const cves = extractCVEs(
          `${title} ${link} ${entryId} ${categories.join(" ")} ${fullPlainText} ${rawXmlMetaText}`
        );
        const labels = normalizeLabels(cves);
        const pluginId = extractNessusPluginId(`${link} ${entryId} ${title} ${fullPlainText}`);

        articles.push({
          id: `${feed.id}_${hashString(entryId)}`,
          feedId: feed.id,
          feedName: feed.name,
          title: stripHtmlToText(title),
          link: /^https?:\/\//i.test(link) ? link : "",
          author: stripHtmlToText(author),
          publishedAt,
          excerpt: plainExcerpt,
          contentHtml: sanitizeHtml(contentRaw),
          categories,
          cves,
          labels,
          pluginId,
        });
      }
      return articles;
    }

    throw new Error("No RSS items or Atom entries found in feed");
  }

  function parseRss2Json(payload, feed) {
    if (!payload || payload.status !== "ok" || !Array.isArray(payload.items)) {
      throw new Error(payload?.message || "rss2json failed to parse feed");
    }

    return payload.items.map((item) => {
      const title = stripHtmlToText(item.title || "(Untitled advisory)");
      const link = item.link || "";
      const guid = item.guid || link || title;
      const contentRaw = item.content || item.description || "";
      const descriptionRaw = item.description || "";
      const fullPlainText = stripHtmlToText(`${descriptionRaw} ${contentRaw}`);
      const plainExcerpt = stripHtmlToText(contentRaw).slice(0, 260);
      const categories = Array.isArray(item.categories) ? item.categories.slice(0, 6) : [];
      const publishedAt = parseDateMs(item.pubDate) || Date.now();
      const cves = extractCVEs(
        `${title} ${link} ${guid} ${categories.join(" ")} ${fullPlainText}`
      );
      const labels = normalizeLabels(cves);
      const pluginId = extractNessusPluginId(`${link} ${guid} ${title} ${fullPlainText}`);

      return {
        id: `${feed.id}_${hashString(guid)}`,
        feedId: feed.id,
        feedName: feed.name,
        title,
        link: /^https?:\/\//i.test(link) ? link : "",
        author: stripHtmlToText(item.author || ""),
        publishedAt,
        excerpt: plainExcerpt,
        contentHtml: sanitizeHtml(contentRaw),
        categories,
        cves,
        labels,
        pluginId,
      };
    });
  }

  function parseJsonKevFeed(payload, feed) {
    const list = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.vulnerabilities)
      ? payload.vulnerabilities
      : Array.isArray(payload?.cves)
      ? payload.cves
      : Array.isArray(payload?.items)
      ? payload.items
      : null;

    if (!list) {
      throw new Error("Unsupported JSON format for KEV feed");
    }

    return list
      .map((entry) => {
        const rawCve = entry.cveID || entry.cve_id || entry.cve || entry.id || "";
        const cveUpper = String(rawCve).trim().toUpperCase();
        const vendor = stripHtmlToText(entry.vendorProject || "");
        const product = stripHtmlToText(entry.product || "");
        const vulnName = stripHtmlToText(
          entry.vulnerabilityName || entry.title || entry.name || ""
        );
        const title = vulnName
          ? cveUpper && !vulnName.toUpperCase().includes(cveUpper)
            ? `${cveUpper}: ${vulnName}`
            : vulnName
          : cveUpper
          ? `${cveUpper} (CISA KEV)`
          : "(KEV entry)";

        const description = stripHtmlToText(entry.shortDescription || entry.description || "");
        const action = stripHtmlToText(entry.requiredAction || "");
        const ransomware = stripHtmlToText(entry.knownRansomwareCampaignUse || "");
        const dueDate = stripHtmlToText(entry.dueDate || "");
        const notesRaw = String(entry.notes || "");
        const notesUrlMatch = notesRaw.match(/https?:\/\/[^\s;]+/i);

        const dateRaw =
          entry.dateAdded || entry.publishedAt || entry.pubDate || entry.date || "";
        const link =
          entry.link ||
          entry.url ||
          (notesUrlMatch ? notesUrlMatch[0] : "") ||
          (/^CVE-\d{4}-\d{4,7}$/i.test(cveUpper)
            ? `https://nvd.nist.gov/vuln/detail/${cveUpper}`
            : feed.url);

        const cves = extractCVEs(`${cveUpper} ${title} ${description}`);
        const labels = normalizeLabels(cves);
        if (cves.length === 0) return null;

        const htmlParts = [];
        if (vendor || product) {
          htmlParts.push(`<p><strong>Affected:</strong> ${[vendor, product].filter(Boolean).join(" — ")}</p>`);
        }
        if (description) htmlParts.push(`<p>${description}</p>`);
        if (action) htmlParts.push(`<p><strong>Required Action:</strong> ${action}</p>`);
        if (dueDate) htmlParts.push(`<p><strong>Due Date:</strong> ${dueDate}</p>`);
        if (ransomware) {
          htmlParts.push(`<p><strong>Known Ransomware Use:</strong> ${ransomware}</p>`);
        }
        if (notesRaw.trim()) {
          htmlParts.push(`<p><strong>References:</strong> ${stripHtmlToText(notesRaw)}</p>`);
        }

        const guid = cveUpper || link || title;
        const publishedAt = parseDateMs(dateRaw) || Date.now();
        return {
          id: `${feed.id}_${hashString(guid)}`,
          feedId: feed.id,
          feedName: feed.name,
          title,
          link: /^https?:\/\//i.test(link) ? link : "",
          author: vendor,
          publishedAt,
          excerpt: description.slice(0, 260),
          contentHtml: sanitizeHtml(htmlParts.join("")),
          categories: [vendor, product].filter(Boolean),
          cves,
          labels,
          pluginId: null,
        };
      })
      .filter(Boolean);
  }

  function parseHtmlKevFeed(htmlText, feed) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const baseUrl = feed.url;
    const byCve = new Map();

    // First inspect anchor tags & table rows mentioning CVE IDs
    const links = Array.from(doc.querySelectorAll("a[href]"));
    for (const a of links) {
      const text = (a.textContent || "").trim();
      const hrefAttr = a.getAttribute("href") || "";
      const found = extractCVEs(`${text} ${hrefAttr}`);
      if (found.length === 0) continue;

      let resolvedHref = "";
      try {
        resolvedHref = new URL(hrefAttr, baseUrl).href;
      } catch {
        resolvedHref = /^https?:\/\//i.test(hrefAttr) ? hrefAttr : "";
      }

      const row = a.closest("tr, li, article, div");
      const rowText = row ? (row.textContent || "").replace(/\s+/g, " ").trim() : text;

      for (const cve of found) {
        if (!byCve.has(cve)) {
          byCve.set(cve, {
            cve,
            title: text.length >= cve.length ? text : cve,
            link: resolvedHref || baseUrl,
            excerpt: rowText.slice(0, 260),
          });
        }
      }
    }

    // Fallback: extract any remaining CVEs in page text
    const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ");
    for (const cve of extractCVEs(bodyText)) {
      if (!byCve.has(cve)) {
        byCve.set(cve, {
          cve,
          title: `${cve} — Known Exploited Vulnerability`,
          link: baseUrl,
          excerpt: "",
        });
      }
    }

    if (byCve.size === 0) {
      throw new Error("No CVE entries found in KEV response");
    }

    const now = Date.now();
    return Array.from(byCve.values()).map((entry) => ({
      id: `${feed.id}_${hashString(entry.cve)}`,
      feedId: feed.id,
      feedName: feed.name,
      title: entry.title,
      link: /^https?:\/\//i.test(entry.link) ? entry.link : "",
      author: "",
      publishedAt: now,
      excerpt: entry.excerpt,
      contentHtml: entry.excerpt ? sanitizeHtml(`<p>${entry.excerpt}</p>`) : "",
      categories: ["KEV"],
      cves: [entry.cve],
      labels: [entry.cve],
      pluginId: null,
    }));
  }

  async function attemptStrategy(strategy, feed) {
    const res = await fetchWithTimeout(strategy.url, {
      headers: {
        Accept:
          strategy.type === "rss2json"
            ? "application/json"
            : "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/html, */*",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} via ${strategy.name}`);
    }

    if (strategy.type === "rss2json") {
      const json = await res.json();
      return parseRss2Json(json, feed);
    }

    const text = await res.text();
    const trimmed = text.trim();

    // If KEV feed returns JSON (e.g. CISA official KEV JSON catalog), parse directly as JSON
    if (feed.enrichmentSource === "kev" && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
      return parseJsonKevFeed(JSON.parse(trimmed), feed);
    }

    // Try standard RSS/Atom XML first
    try {
      return parseXmlFeed(text, feed);
    } catch (xmlErr) {
      // For KEV enrichment feeds, also accept HTML CVE listings as fallback
      if (feed.enrichmentSource === "kev") {
        if (/<html|<!doctype|<body|<a\s/i.test(trimmed) || /\bCVE-\d{4}-\d{4,7}\b/i.test(trimmed)) {
          return parseHtmlKevFeed(text, feed);
        }
      }
      throw xmlErr;
    }
  }

  async function fetchFeed(feed, settings = {}) {
    const corsMode = settings.corsMode || "auto";
    const strategies = [];
    const isJsonFeed = /\.json(\?|$)/i.test(feed.url || "");

    const directStrategy = { name: "direct", type: "xml", url: feed.url };
    const proxyStrategies = PUBLIC_PROXIES.filter((p) => !(isJsonFeed && p.type === "rss2json")).map(
      (p) => ({
        name: p.name,
        type: p.type,
        url: p.buildUrl(feed.url),
      })
    );

    if (corsMode === "direct") {
      strategies.push(directStrategy);
    } else if (corsMode === "custom") {
      const customUrl = buildCustomProxyUrl(settings.customProxyUrl, feed.url);
      if (customUrl) {
        strategies.push({ name: "custom-proxy", type: "xml", url: customUrl });
      } else {
        throw new Error("Custom proxy URL is not configured in Settings.");
      }
    } else if (corsMode === "proxy-first") {
      strategies.push(...proxyStrategies, directStrategy);
    } else {
      // auto: try direct first, then public proxy chain
      strategies.push(directStrategy, ...proxyStrategies);
    }

    const errors = [];
    for (const strat of strategies) {
      try {
        const articles = await attemptStrategy(strat, feed);
        return {
          articles,
          via: strat.name,
        };
      } catch (err) {
        errors.push(`${strat.name}: ${err.message}`);
      }
    }

    throw new Error(`All fetch attempts failed (${errors[0] || "network error"})`);
  }

  return {
    fetchFeed,
    extractCVEs,
    normalizeLabels,
    sanitizeHtml,
  };
})();
