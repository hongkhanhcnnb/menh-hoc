(() => {
  "use strict";

  const STORAGE_KEY = "menh-hoc-app-v1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [
    ...root.querySelectorAll(selector),
  ];
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const blankState = () => ({
    profile: null,
    journals: [],
    library: [],
    chart: null,
    reports: [],
    language: localStorage.getItem("menh-hoc-language") || "vi",
    createdAt: new Date().toISOString(),
  });
  let state = blankState();
  let toastTimer = null;
  let serverLibrary = [];
  let weeklyReferences = [];
  let healthState = null;
  let latestChart = state.chart || null;
  let stateSaveQueue = Promise.resolve();

  function getLanguage() {
    return localStorage.getItem("menh-hoc-language") || state.language || "vi";
  }

  function setLanguage(language) {
    if (!["vi", "en", "ja"].includes(language)) language = "vi";
    localStorage.setItem("menh-hoc-language", language);
    state.language = language;
    const profileLanguage = $("#language");
    if (profileLanguage) profileLanguage.value = language;
    const selector = $("#appLanguage");
    if (selector) selector.value = language;
    window.MenhHocI18n?.translate(document);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    stateSaveQueue = stateSaveQueue.catch(() => {}).then(() => api("/api/me/state", {
      method: "PUT", body: JSON.stringify({ data: state })
    })).catch(error => console.warn("Could not sync language preference:", error));
  }

  function loadState() {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem("menh-hoc-mvp-v1");
      if (!raw) return blankState();
      const parsed = JSON.parse(raw);
      const data = parsed.data || parsed;
      return {
        profile: data.profile || null,
        journals: Array.isArray(data.journals) ? data.journals : [],
        library: Array.isArray(data.library) ? data.library : [],
        chart: data.chart || null,
        reports: Array.isArray(data.reports) ? data.reports : [],
        language: data.language || localStorage.getItem("menh-hoc-language") || "vi",
        createdAt: data.createdAt || new Date().toISOString(),
      };
    } catch (error) {
      console.warn("Không thể đọc dữ liệu đã lưu:", error);
      return blankState();
    }
  }

  function persist(message) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.info(
        "Local cache unavailable; server remains authoritative.",
        error,
      );
    }
    renderAll();
    const snapshot = JSON.stringify({ data: state });
    stateSaveQueue = stateSaveQueue
      .catch(() => {})
      .then(() => api("/api/me/state", { method: "PUT", body: snapshot }));
    stateSaveQueue
      .then(() => {
        if (message) showToast(message);
      })
      .catch((error) =>
        showToast(`Không thể đồng bộ dữ liệu lên máy chủ: ${error.message}`),
      );
    return true;
  }

  function showToast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
  }

  function esc(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }

  function fmtDate(
    iso,
    options = { day: "2-digit", month: "long", year: "numeric" },
  ) {
    if (!iso) return "—";
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("vi-VN", options).format(d);
  }

  function getSunSign(dateString) {
    if (!dateString) return "Chưa xác định";
    const d = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(d.getTime())) return "Chưa xác định";
    const m = d.getMonth() + 1,
      day = d.getDate();
    const signs = [
      ["Ma Kết", 1, 1, 1, 19],
      ["Bảo Bình", 1, 20, 2, 18],
      ["Song Ngư", 2, 19, 3, 20],
      ["Bạch Dương", 3, 21, 4, 19],
      ["Kim Ngưu", 4, 20, 5, 20],
      ["Song Tử", 5, 21, 6, 20],
      ["Cự Giải", 6, 21, 7, 22],
      ["Sư Tử", 7, 23, 8, 22],
      ["Xử Nữ", 8, 23, 9, 22],
      ["Thiên Bình", 9, 23, 10, 22],
      ["Bọ Cạp", 10, 23, 11, 21],
      ["Nhân Mã", 11, 22, 12, 21],
      ["Ma Kết", 12, 22, 12, 31],
    ];
    const found = signs.find(
      (s) => (m === s[1] && day >= s[2]) || (m === s[3] && day <= s[4]),
    );
    return found ? found[0] : "Chưa xác định";
  }

  function ageFrom(dateString) {
    if (!dateString) return null;
    const birth = new Date(`${dateString}T12:00:00`),
      now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (
      now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
    )
      age--;
    return age >= 0 ? age : null;
  }

  const weekdayThemes = [
    {
      theme: "Nghỉ ngơi và tái tạo",
      desc: "Quan sát năng lượng của bản thân và chuẩn bị nhẹ nhàng cho chu kỳ tiếp theo.",
      do: "Tổng kết tuần bằng vài dòng",
      doDesc: "Ghi lại điều đã làm tốt, điều cần học và một ưu tiên sắp tới.",
      avoid: "Tự gây áp lực phải luôn năng suất",
      avoidDesc: "Cho phép bản thân nghỉ ngơi mà không cần cảm thấy có lỗi.",
      color: "Trắng ngà",
      hex: "#e7dfcf",
      colorDesc: "Gợi nhắc sự giản dị và khoảng trống.",
    },
    {
      theme: "Khởi động và tạo nhịp",
      desc: "Chọn một việc quan trọng để bắt đầu tuần với mục tiêu rõ ràng.",
      do: "Xác định một ưu tiên chính",
      doDesc: "Viết ra kết quả cụ thể bạn muốn hoàn thành và bước đầu tiên.",
      avoid: "Đặt quá nhiều mục tiêu",
      avoidDesc: "Giữ danh sách việc cần làm ngắn và có thể thực hiện.",
      color: "Xanh lam trầm",
      hex: "#425b73",
      colorDesc: "Gợi nhắc sự tập trung và bình tĩnh.",
    },
    {
      theme: "Kết nối và trao đổi",
      desc: "Chú ý cách bạn lắng nghe, phản hồi và phối hợp với người khác.",
      do: "Chủ động làm rõ kỳ vọng",
      doDesc:
        "Xác nhận mục tiêu, thời hạn và trách nhiệm trong một cuộc trao đổi.",
      avoid: "Phản hồi khi đang vội",
      avoidDesc: "Dành một nhịp để đọc lại thông tin trước khi trả lời.",
      color: "Vàng ấm",
      hex: "#c6a15f",
      colorDesc: "Gợi nhắc sự cởi mở và lạc quan.",
    },
    {
      theme: "Học hỏi và mở rộng",
      desc: "Dành thời gian cho một kỹ năng hoặc góc nhìn mới.",
      do: "Học một điều có thể ứng dụng",
      doDesc: "Chọn tài liệu ngắn và ghi lại một ý có thể thử trong thực tế.",
      avoid: "Tiếp nhận quá nhiều thông tin",
      avoidDesc: "Ưu tiên chất lượng và khả năng áp dụng thay vì số lượng.",
      color: "Xanh lá dịu",
      hex: "#7e9b82",
      colorDesc: "Gợi nhắc sự phát triển và cân bằng.",
    },
    {
      theme: "Hoàn thiện và điều chỉnh",
      desc: "Rà soát tiến độ, nhìn nhận phần còn vướng và điều chỉnh kế hoạch.",
      do: "Hoàn tất một việc còn dang dở",
      doDesc: "Chia nhỏ phần việc còn lại và chốt một mốc hoàn thành.",
      avoid: "Cầu toàn ở mọi chi tiết",
      avoidDesc: "Xác định tiêu chuẩn đủ tốt cho từng đầu việc.",
      color: "Tím khói",
      hex: "#8a7d9f",
      colorDesc: "Gợi nhắc khả năng quan sát và suy ngẫm.",
    },
    {
      theme: "Tập trung vào giá trị",
      desc: "Đưa sự chú ý về điều tạo ra tác động thiết thực nhất.",
      do: "Đo lường kết quả thực tế",
      doDesc:
        "Kiểm tra điều gì đã tiến triển thay vì chỉ nhìn vào mức độ bận rộn.",
      avoid: "So sánh hành trình của mình",
      avoidDesc: "Đánh giá bằng mục tiêu và bối cảnh của chính bạn.",
      color: "Nâu đất",
      hex: "#9b795f",
      colorDesc: "Gợi nhắc sự ổn định và thực tế.",
    },
    {
      theme: "Nuôi dưỡng kết nối",
      desc: "Chừa không gian cho nghỉ ngơi, gia đình và những cuộc trò chuyện có ý nghĩa.",
      do: "Dành thời gian chất lượng",
      doDesc: "Chọn một hoạt động không bị gián đoạn bởi màn hình.",
      avoid: "Để công việc lấn hết thời gian riêng",
      avoidDesc: "Đặt giờ kết thúc và tôn trọng khoảng nghỉ của mình.",
      color: "Hồng đất",
      hex: "#ba8b8a",
      colorDesc: "Gợi nhắc sự dịu dàng và quan tâm.",
    },
  ];

  function dailyFor(dateString) {
    const d = new Date(`${dateString || todayISO()}T12:00:00`);
    return weekdayThemes[Number.isNaN(d.getTime()) ? 0 : d.getDay()];
  }

  function showPage(page) {
    const target = $(`#page-${page}`);
    if (!target) return;
    $$(".page").forEach((el) => el.classList.toggle("active", el === target));
    $$(".nav-item[data-page]").forEach((el) =>
      el.classList.toggle("active", el.dataset.page === page),
    );
    const active = $(`.nav-item[data-page="${page}"] span:nth-child(2)`);
    $("#pageCrumb").textContent = active
      ? active.textContent.trim()
      : "Mệnh Học";
    $("#sidebar").classList.remove("open");
    if (page === "daily") renderDaily();
    if (page === "profile") fillProfileForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderProfileSummary() {
    const p = state.profile;
    const host = $("#profileSummary");
    if (!p) {
      host.className = "profile-summary empty-summary";
      host.innerHTML =
        '<div class="empty-orb">◉</div><h4>Chưa thiết lập hồ sơ</h4><p>Thêm ngày, giờ, tọa độ và múi giờ nơi sinh để tính lá số.</p><button class="button button-outline" data-goto="profile">Thêm thông tin</button>';
      return;
    }
    host.className = "profile-summary";
    host.innerHTML = `<div class="profile-avatar">${esc((p.displayName || "M").trim().charAt(0).toUpperCase())}</div><div class="profile-copy"><h4>${esc(p.displayName || "Hồ sơ cá nhân")}</h4><p>${esc(fmtDate(p.birthDate))} · ${esc(p.birthTime || "Chưa rõ giờ sinh")}</p><p>${esc(p.birthPlace)}</p><span class="profile-sign">${esc(getSunSign(p.birthDate))} · ${ageFrom(p.birthDate) ?? "—"} tuổi</span></div><button class="text-link" data-goto="profile">Sửa ↗</button>`;
  }

  function renderDashboard() {
    const p = state.profile;
    $("#topDate").textContent = new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "short",
    }).format(new Date());
    $("#greetingTitle").textContent = p?.displayName
      ? `Chào ${p.displayName}, chào mừng trở lại`
      : "Chào mừng bạn đến với Mệnh Học";
    $("#statProfile").textContent = p ? "Đã thiết lập" : "Chưa có";
    $("#statProfileFoot").textContent = p
      ? `${getSunSign(p.birthDate)} · ${p.birthPlace}`
      : "Bổ sung thông tin để bắt đầu";
    $("#statJournal").innerHTML =
      `${state.journals.length} <small>bài viết</small>`;
    $("#statLibrary").innerHTML =
      `${state.library.length + serverLibrary.length} <small>tài liệu</small>`;
    renderProfileSummary();
    const d = dailyFor(todayISO());
    $("#dailyDateStamp").textContent = fmtDate(todayISO(), {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    $("#dailyTheme").textContent = d.theme;
    $("#dailyDescription").textContent = d.desc;
    const recent = [...state.journals]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 3);
    $("#recentJournals").innerHTML = recent.length
      ? recent
          .map(
            (j) =>
              `<div class="recent-item"><span class="recent-date">${esc(fmtDate(j.date, { day: "2-digit", month: "short" }))}</span><div><strong>${esc(j.title)}</strong><small>${esc(j.mood || "Bình thường")}</small></div></div>`,
          )
          .join("")
      : '<div class="empty-inline">Chưa có ghi chép. Hãy bắt đầu bằng một vài dòng về ngày hôm nay.</div>';
  }

  function renderChartProfile() {
    const p = state.profile;

    const fields = {
      chartName: p?.displayName || "Chưa có hồ sơ",
      chartBirth: p ? fmtDate(p.birthDate) : "—",
      chartTime: p?.birthTime || "Chưa rõ",
      chartPlace: p?.birthPlace || "—",
      chartSun: p ? getSunSign(p.birthDate) : "—",
    };

    for (const [id, value] of Object.entries(fields)) {
      const element = document.getElementById(id);

      // Không cập nhật phần tử không tồn tại trong HTML
      if (element) {
        element.textContent = value;
      }
    }
  }

  function markdownInline(value) {
    // The source has already been HTML-escaped before inline formatting.
    let out = value;
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__(.+?)__/g, "<strong>$1</strong>");
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
    out = out.replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return out;
  }

  function markdownTableCells(line) {
    // x-iztro/Gemini may emit tables with or without the optional outer pipes.
    // Normalize both forms so the display never falls back to a broken text table.
    const value = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return value.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
  }

  function isMarkdownTableSeparator(line) {
    const cells = markdownTableCells(line);
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }

  function looksLikeMarkdownTableHeader(lines, index) {
    return index + 1 < lines.length && lines[index].includes("|") && isMarkdownTableSeparator(lines[index + 1]);
  }

  function normalizeZiweiText(input) {
    return String(input || "")
      .replace(/([\p{L}\p{N}])\(/gu, "$1 (")
      .replace(/\)(?=[\p{L}\p{N}])/gu, ") ")
      .replace(/,(?=[\p{L}\p{N}])/gu, ", ")
      .replace(/[ \t]{2,}/g, " ");
  }

  function renderMarkdownTable(lines, startIndex) {
    const headers = markdownTableCells(lines[startIndex]);
    const separator = markdownTableCells(lines[startIndex + 1]);
    if (headers.length < 2 || separator.length < 2) return null;
    const alignments = separator.map((cell) =>
      cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : "",
    );
    const body = [];
    let i = startIndex + 2;
    while (i < lines.length) {
      const row = lines[i].trim();
      if (!row || !row.includes("|")) break;
      const cells = markdownTableCells(row);
      if (cells.length < 2) break;
      body.push(cells);
      i += 1;
    }
    const th = headers.map((cell, index) => `<th${alignments[index] ? ` style="text-align:${alignments[index]}"` : ""}>${markdownInline(cell)}</th>`).join("");
    const trs = body.map((cells) => {
      const padded = [...cells];
      while (padded.length < headers.length) padded.push("");
      return `<tr>${padded.slice(0, headers.length).map((cell, index) => `<td${alignments[index] ? ` style="text-align:${alignments[index]}"` : ""}>${markdownInline(cell)}</td>`).join("")}</tr>`;
    }).join("");
    return { html: `<div class="markdown-table-wrap"><table class="markdown-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`, nextIndex: i };
  }

  function markdownToHtml(input) {
    // Safe Markdown renderer. Raw HTML is escaped first; tables, headings, lists,
    // blockquotes and fenced code are rendered explicitly so engine/Gemini output
    // never falls back to raw Markdown text.
    const escaped = esc(input || "").replace(/\r/g, "");
    const lines = escaped.split("\n");
    const out = [];
    let listType = null;
    let paragraph = [];
    let codeLines = null;
    const closeParagraph = () => {
      if (paragraph.length) {
        out.push(`<p>${paragraph.map(markdownInline).join("<br>")}</p>`);
        paragraph = [];
      }
    };
    const closeList = () => {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    };
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        if (codeLines) {
          out.push(`<pre class="markdown-code"><code>${codeLines.join("\n")}</code></pre>`);
          codeLines = null;
        } else {
          closeParagraph();
          closeList();
          codeLines = [];
        }
        continue;
      }
      if (codeLines) {
        codeLines.push(line);
        continue;
      }
      if (looksLikeMarkdownTableHeader(lines, i)) {
        closeParagraph();
        closeList();
        const table = renderMarkdownTable(lines, i);
        if (table) {
          out.push(table.html);
          i = table.nextIndex - 1;
          continue;
        }
      }
      if (!trimmed) {
        closeParagraph();
        closeList();
        continue;
      }
      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        closeParagraph();
        closeList();
        const level = Math.min(6, heading[1].length);
        out.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`);
        continue;
      }
      const item = trimmed.match(/^([-*•]|\d+[.)])\s+(.+)$/);
      if (item) {
        closeParagraph();
        const nextType = /^\d/.test(item[1]) ? "ol" : "ul";
        if (listType !== nextType) {
          closeList();
          out.push(`<${nextType}>`);
          listType = nextType;
        }
        out.push(`<li>${markdownInline(item[2])}</li>`);
        continue;
      }
      if (/^>\s?/.test(trimmed)) {
        closeParagraph();
        closeList();
        out.push(`<blockquote>${markdownInline(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
        continue;
      }
      closeList();
      if (/^---+$/.test(trimmed)) {
        closeParagraph();
        out.push("<hr>");
        continue;
      }
      paragraph.push(trimmed);
    }
    if (codeLines) out.push(`<pre class="markdown-code"><code>${codeLines.join("\n")}</code></pre>`);
    closeParagraph();
    closeList();
    return out.join("");
  }

  function setAiResult(container, text, metadata = {}) {
    const host = typeof container === "string" ? $(container) : container;
    if (!host) return;
    let meta = "";
    if (metadata.model) meta += `<span>Model: ${esc(metadata.model)}</span>`;
    if (metadata.date) meta += `<span>Ngày: ${esc(metadata.date)}</span>`;
    if (metadata.entriesReviewed)
      meta += `<span>${metadata.entriesReviewed} ghi chép được xem xét</span>`;
    const sourceHtml = metadata.sources?.length
      ? `<div class="ai-sources"><strong>Nguồn được truy xuất</strong>${metadata.sources.map((s) => `<div>${esc(s.title || "Tài liệu")} · ${esc(s.author || "Chưa rõ tác giả")} · ${esc(s.tradition || "")}${s.source_url ? ` · <a href="${esc(s.source_url)}" target="_blank" rel="noopener noreferrer">Mở nguồn</a>` : ""}</div>`).join("")}</div>`
      : "";
    host.innerHTML = `<div class="ai-result-meta">${meta}<span>Diễn giải biểu tượng · Không phải dự báo khoa học</span></div><div class="ai-markdown">${markdownToHtml(text)}</div>${sourceHtml}`;
  }

  function formatPillarCell(pillar) {
    if (!pillar) return "<td>—</td>";
    return `<td><strong>${esc(pillar.text || `${pillar.gan || ""}${pillar.zhi || ""}`)}</strong><small>${esc(pillar.wuxing || "")}</small></td>`;
  }

  function renderAstroWheel(western) {
    const size = 620,
      c = 310,
      outer = 262,
      planetR = 198;
    const signs = [
      "♈ Bạch Dương",
      "♉ Kim Ngưu",
      "♊ Song Tử",
      "♋ Cự Giải",
      "♌ Sư Tử",
      "♍ Xử Nữ",
      "♎ Thiên Bình",
      "♏ Bọ Cạp",
      "♐ Nhân Mã",
      "♑ Ma Kết",
      "♒ Bảo Bình",
      "♓ Song Ngư",
    ];
    const pt = (r, degree) => {
      const angle = ((degree - 90) * Math.PI) / 180;
      return [c + r * Math.cos(angle), c + r * Math.sin(angle)];
    };
    const colors = {
      "Giao hội": "#b78d54",
      "Lục hợp": "#7d9e91",
      "Vuông góc": "#ba7c74",
      "Tam hợp": "#8098b3",
      "Đối đỉnh": "#a17b9a",
    };
    let svg = `<svg class="natal-wheel-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Bản đồ sao cá nhân"><circle cx="${c}" cy="${c}" r="${outer}" fill="#17283b"/><circle cx="${c}" cy="${c}" r="${outer - 26}" fill="none" stroke="#b69a69" stroke-width="1.4"/><circle cx="${c}" cy="${c}" r="${planetR - 20}" fill="none" stroke="#53677a" stroke-width="1"/><circle cx="${c}" cy="${c}" r="105" fill="#20374e" stroke="#53677a" stroke-width="1"/>`;
    for (let i = 0; i < 12; i++) {
      const a = i * 30;
      const [x1, y1] = pt(outer - 26, a),
        [x2, y2] = pt(planetR - 20, a);
      const [tx, ty] = pt(outer - 58, a + 15);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#53677a" stroke-width="1"/><text x="${tx}" y="${ty}" fill="#d7c39e" text-anchor="middle" dominant-baseline="middle" font-size="10">${signs[i].split(" ")[0]}</text>`;
    }
    for (const h of western.houses || []) {
      const [x1, y1] = pt(planetR - 20, h.absoluteLongitude);
      svg += `<line x1="${c}" y1="${c}" x2="${x1}" y2="${y1}" stroke="#8291a0" stroke-opacity=".25" stroke-width="1"/>`;
    }
    const planets = western.planets || [];
    const byName = Object.fromEntries(planets.map((p) => [p.name, p]));
    const aspects = (western.aspects || []).slice(0, 26);
    for (const a of aspects) {
      const p1 = byName[a.planet1],
        p2 = byName[a.planet2];
      if (!p1 || !p2) continue;
      const [x1, y1] = pt(planetR - 42, p1.absoluteLongitude),
        [x2, y2] = pt(planetR - 42, p2.absoluteLongitude);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors[a.aspect] || "#8492a0"}" stroke-opacity=".35" stroke-width="1.4"/>`;
    }
    for (const p of planets) {
      const [x, y] = pt(planetR - 6, p.absoluteLongitude);
      const label = p.glyph || p.name.slice(0, 1);
      svg += `<circle cx="${x}" cy="${y}" r="11" fill="#dec28e" stroke="#17283b" stroke-width="2"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="#17283b" font-size="12" font-weight="700">${esc(label)}</text>`;
    }
    svg += `<text x="${c}" y="${c - 7}" text-anchor="middle" fill="#e4d2ae" font-family="Georgia,serif" font-size="20">MỆNH HỌC</text><text x="${c}" y="${c + 17}" text-anchor="middle" fill="#9eafbd" font-size="10" letter-spacing="2">NATAL CHART</text></svg>`;
    return svg;
  }

  function renderChartResult(data) {
    latestChart = data;
    state.chart = data;
    persist(null);
    const w = data.western || {};
    const b = data.bazi || {};
    const planets = w.planets || [];
    const planetRows = planets
      .map(
        (p) =>
          `<tr><td><strong>${esc(p.glyph)} ${esc(p.name)}</strong></td><td>${esc(p.sign)}</td><td>${Number(p.degree).toFixed(2)}°</td><td>${esc(p.house || "—")}</td><td>${p.retrograde ? "Nghị hành" : "Thuận hành"}</td></tr>`,
      )
      .join("");
    const aspects =
      (w.aspects || [])
        .slice(0, 12)
        .map(
          (a) =>
            `<li><strong>${esc(a.planet1)} ${esc(a.aspect)} ${esc(a.planet2)}</strong><small>Orb ${Number(a.orb).toFixed(2)}°</small></li>`,
        )
        .join("") ||
      "<li>Không có góc chiếu chính trong ngưỡng đang dùng.</li>";
    const houses = (w.houses || [])
      .map(
        (h) =>
          `<span>Nhà ${h.house}: ${esc(h.sign)} ${Number(h.degree).toFixed(1)}°</span>`,
      )
      .join("");
    const asc = w.ascendant
      ? `${w.ascendant.sign} ${Number(w.ascendant.degree).toFixed(1)}°`
      : "Chưa xác định do thiếu giờ sinh chính xác";
    const p = b.pillars || {};
    const baziTable = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tứ trụ</th><th>Năm</th><th>Tháng</th><th>Ngày</th><th>Giờ</th></tr></thead><tbody><tr><th>Can Chi</th>${formatPillarCell(p.year)}${formatPillarCell(p.month)}${formatPillarCell(p.day)}${formatPillarCell(p.hour)}</tr></tbody></table></div>`;
    const vedic = data.vedic?.planets?.length
      ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Hành tinh</th><th>Cung Sidereal</th><th>Độ</th><th>Nakshatra</th><th>Pada</th></tr></thead><tbody>${data.vedic.planets.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.sign)}</td><td>${Number(x.degree).toFixed(2)}°</td><td>${esc(x.nakshatra || "—")}</td><td>${esc(x.nakshatraPada || "—")}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="muted-note">Vedic chưa có dữ liệu trong lần tính này.</p>';
    const notes = [
      ...(w.notes || []),
      ...(b.notes || []),
      ...(data.vedic?.notes || []),
      ...(data.ziwei?.notes || []),
    ]
      .map((x) => `<li>${esc(x)}</li>`)
      .join("");
    const z = data.ziwei || {};
    const ziweiPanel = z.available
      ? `<section class="panel chart-table-panel ziwei-result-panel"><div class="panel-heading"><div><p class="eyebrow">TỬ VI ĐẨU SỐ · DETERMINISTIC ENGINE</p><h3>Lá số Tử Vi cá nhân</h3><p class="muted-note">${esc(z.engine || "x-iztro")} · ${esc(z.school || "Quy ước mặc định")}</p></div><span class="chart-chip">ĐÃ AN SAO</span></div><div class="ziwei-meta-grid"><div><span>Giờ sinh quy đổi</span><strong>${esc(z.conventions?.hourIndex ?? "—")}</strong></div><div><span>Quy tắc tháng nhuận</span><strong>Chia tại trung điểm</strong></div><div><span>Giờ Tý muộn</span><strong>Chuyển ngày</strong></div><div><span>Độ tin cậy giờ sinh</span><strong>${esc(z.conventions?.timeAccuracy || "—")}</strong></div></div><details class="ziwei-chart-details" open><summary>Toàn bộ 12 cung, chính tinh, phụ tinh, Tứ Hóa và Đại vận</summary><div class="ziwei-chart-markdown">${markdownToHtml(normalizeZiweiText(z.chartText || "Engine đã tính lá số nhưng không có bản trình bày văn bản."))}</div></details><p class="muted-note">Các quy ước có thể khác giữa các trường phái Tử Vi Việt Nam. Xem phần luận giải AI để đọc ý nghĩa từng cung; không coi nội dung này là dự báo khoa học.</p></section>`
      : `<section class="panel chart-table-panel ziwei-result-panel"><div class="panel-heading"><div><p class="eyebrow">TỬ VI ĐẨU SỐ</p><h3>Chưa thể an lá số</h3></div><span class="chart-chip">THIẾU DỮ LIỆU</span></div><p>${esc(z.reason || "Cần bổ sung giờ sinh và thông tin phù hợp để tính lá số.")}</p></section>`;
    $("#chartResult").innerHTML =
      `<div class="chart-output-grid"><div class="panel chart-panel"><div class="panel-heading"><div><p class="eyebrow">WESTERN ASTROLOGY · TROPICAL</p><h3>Bản đồ sao Natal</h3></div><span class="chart-chip">ĐÃ TÍNH</span></div>${renderAstroWheel(w)}<div class="chart-legend"><span>Biểu tượng hành tinh tại kinh độ hoàng đạo</span><span>Các đường là góc chiếu chính</span></div></div><div class="panel chart-facts"><p class="eyebrow">ĐIỂM CHÍNH</p><div class="data-line"><span>Mặt Trời</span><strong>${esc(planets.find((x) => x.name === "Mặt Trời")?.sign || "—")}</strong></div><div class="data-line"><span>Mặt Trăng</span><strong>${esc(planets.find((x) => x.name === "Mặt Trăng")?.sign || "—")}</strong></div><div class="data-line"><span>Cung Mọc</span><strong>${esc(asc)}</strong></div><div class="data-line"><span>Thiên Đỉnh (MC)</span><strong>${esc(w.midheaven ? `${w.midheaven.sign} ${w.midheaven.degree}°` : "Chưa xác định")}</strong></div><div class="data-line"><span>Pha Mặt Trăng</span><strong>${esc(w.moonPhase || "—")}</strong></div><div class="data-line"><span>Hệ nhà</span><strong>${esc(w.houseSystem === "P" ? "Placidus (mặc định)" : (w.houseSystem || "Placidus"))}</strong></div></div></div><div class="panel chart-table-panel"><div class="panel-heading"><div><p class="eyebrow">PLANETARY POSITIONS</p><h3>Vị trí hành tinh</h3></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Thiên thể</th><th>Cung</th><th>Độ</th><th>Nhà</th><th>Chuyển động</th></tr></thead><tbody>${planetRows}</tbody></table></div><div class="aspect-house-grid"><div><h4>Góc chiếu nổi bật</h4><ul class="aspect-list">${aspects}</ul></div><div><h4>Đỉnh 12 nhà</h4><div class="house-chips">${houses || "<span>Chưa tính do thiếu giờ sinh</span>"}</div></div></div></div><div class="panel chart-table-panel"><div class="panel-heading"><div><p class="eyebrow">BAZI / FOUR PILLARS</p><h3>Bát tự – Tứ trụ</h3><p class="muted-note">Lịch tiết khí · Ngày âm: ${esc(b.lunarDate || "—")}</p></div></div>${baziTable}<p class="muted-note">Nhật chủ: <strong>${esc(b.dayMaster || "—")}</strong> · Các nạp âm / ngũ hành được lấy trực tiếp từ thư viện tính lịch.</p></div><div class="panel chart-table-panel"><div class="panel-heading"><div><p class="eyebrow">BAZI · DA YUN & LIU NIAN</p><h3>Đại vận và lưu niên</h3><p class="muted-note">${b.yun ? `Khởi vận ${esc(b.yun.startYearAge)} năm ${esc(b.yun.startMonthAge)} tháng ${esc(b.yun.startDayAge)} ngày · ${esc(b.yun.direction)} hành · bắt đầu ${esc(b.yun.startDate)}` : "Cần có giờ sinh đủ tin cậy và chọn Nam/Nữ để tính đại vận theo quy ước của lunar-python."}</p></div></div>${(b.luckCycles || []).length ? `<div class="luck-cycle-grid">${b.luckCycles.map((cycle) => `<article class="luck-cycle"><div class="luck-cycle-top"><strong>${esc(cycle.ganZhi)}</strong><span>${esc(cycle.startAge)}–${esc(cycle.endAge)} tuổi</span></div><p>${esc(cycle.startYear)}–${esc(cycle.endYear)}</p><div class="luck-years">${(cycle.annualYears || []).map((y) => `<span title="${esc(y.age)} tuổi">${esc(y.year)} · ${esc(y.ganZhi)}</span>`).join("")}</div></article>`).join("")}</div>` : '<p class="muted-note">Chưa đủ dữ liệu để tính Đại vận. Kiểm tra giới tính, giờ sinh và độ chính xác giờ sinh trong hồ sơ.</p>'}</div><div class="panel chart-table-panel"><div class="panel-heading"><div><p class="eyebrow">VEDIC ASTROLOGY</p><h3>Chiêm tinh Vedic – Lahiri</h3></div></div>${vedic}</div><div class="notice notice-info"><strong>Giới hạn và quy ước</strong><ul>${notes}</ul><p>Tử Vi được tính theo quy ước engine đã nêu. Những trường phái khác có thể cho kết quả khác; không dùng diễn giải thay thế tư vấn chuyên môn.</p></div>${ziweiPanel}<section class="panel chart-analysis-panel"><div class="panel-heading"><div><p class="eyebrow">AI CHART INTERPRETATION</p><h3>Luận giải chi tiết bản đồ sao</h3><p class="muted-note">Không chỉ liệt kê vị trí: AI sẽ đọc các cấu trúc nổi bật, 12 nhà, góc chiếu và đối chiếu các hệ thống đang có dữ liệu.</p></div><button class="button button-primary button-small" id="runChartAnalysis">Luận giải chi tiết ✦</button></div><div class="chart-analysis-consent"><label class="check-inline"><input type="checkbox" id="consentChartAnalysis" /> Tôi đồng ý gửi dữ liệu lá số đã tính (đã loại thông tin định danh) đến Gemini để luận giải.</label></div><div id="chartAnalysisResult" class="ai-result chart-analysis-result"><div class="empty-inline">Bấm “Luận giải chi tiết” để tạo phần phân tích cho chính dữ liệu bản đồ sao vừa tính.</div></div></section>`;
  }

  function renderDaily() {
    const date = $("#dailyDate").value || todayISO();
    const d = dailyFor(date);
    $("#dailyPageTheme").textContent = d.theme;
    $("#dailyPageDesc").textContent = d.desc;
    $("#weekdayTag").textContent = new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
    })
      .format(new Date(`${date}T12:00:00`))
      .toUpperCase();
    $("#dailyDoTitle").textContent = d.do;
    $("#dailyDoDesc").textContent = d.doDesc;
    $("#dailyAvoidTitle").textContent = d.avoid;
    $("#dailyAvoidDesc").textContent = d.avoidDesc;
    $("#dailyColorName").textContent = d.color;
    $("#dailyColorSwatch").style.background = d.hex;
    $("#dailyColorDesc").textContent = d.colorDesc;
    const stamp = $("#dailyDateStamp");
    if (stamp)
      stamp.textContent = fmtDate(date, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  }

  function renderJournals() {
    const filter = $("#journalFilter").value;
    const entries = [...state.journals]
      .sort(
        (a, b) =>
          (b.date || "").localeCompare(a.date || "") ||
          (b.createdAt || "").localeCompare(a.createdAt || ""),
      )
      .filter((j) => filter === "all" || j.mood === filter);
    $("#journalCount").textContent = `${state.journals.length} ghi chép`;
    $("#journalList").innerHTML = entries.length
      ? entries
          .map(
            (j) =>
              `<article class="journal-entry"><div class="entry-top"><span class="entry-date">${esc(fmtDate(j.date))}</span><span class="mood-label" data-mood="${esc(j.mood)}">${esc(j.mood)}</span></div><h4>${esc(j.title)}</h4>${j.body ? `<p>${esc(j.body)}</p>` : ""}${j.lesson ? `<div class="entry-lesson">Điều rút ra: ${esc(j.lesson)}</div>` : ""}<div class="entry-actions"><button type="button" data-delete-journal="${esc(j.id)}">Xóa ghi chép</button></div></article>`,
          )
          .join("")
      : '<div class="empty-state"><span>▤</span><h4>Chưa có ghi chép phù hợp</h4><p>Bắt đầu lưu lại những sự kiện và suy nghĩ đáng chú ý trong ngày.</p></div>';
  }

  function renderLibrary() {
    const local = state.library.map((x) => ({ ...x, sourceType: "local" }));
    const server = serverLibrary.map((x) => ({ ...x, sourceType: "server" }));
    const all = [...server, ...local];
    $("#libraryCount").textContent = `${all.length} tài liệu`;
    $("#libraryList").innerHTML = all.length
      ? all
          .map(
            (b) =>
              `<article class="library-entry"><div class="book-cover">${esc((b.title || "M").trim().charAt(0).toUpperCase())}</div><div class="book-copy"><h4>${esc(b.title)}</h4><p>${esc(b.author || "Chưa rõ tác giả")}${b.year ? ` · ${esc(b.year)}` : ""}</p><div class="book-meta"><span>${esc(b.tradition || "Khác")}</span><span>${esc(b.license || "Chưa xác minh")}</span><span>${b.sourceType === "server" ? "Đã lập chỉ mục" : "Metadata"}</span></div>${b.source_url || b.url ? `<a class="book-link" href="${esc(b.source_url || b.url)}" target="_blank" rel="noopener noreferrer">Mở nguồn ↗</a>` : ""}</div>${b.sourceType === "server" ? `<button class="delete-book" aria-label="Xóa tài liệu" data-delete-server-book="${esc(b.id)}">×</button>` : `<button class="delete-book" aria-label="Xóa tài liệu" data-delete-book="${esc(b.id)}">×</button>`}</article>`,
          )
          .join("")
      : '<div class="empty-state"><span>▥</span><h4>Thư viện đang trống</h4><p>Thêm metadata hoặc nạp tài liệu bạn có quyền sử dụng.</p></div>';
    renderDashboard();
  }

  function renderAll() {
    renderDashboard();
    renderChartProfile();
    renderJournals();
    renderLibrary();
    if ($("#page-daily").classList.contains("active")) renderDaily();
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (
      options.body &&
      !(options.body instanceof FormData) &&
      !headers.has("Content-Type")
    )
      headers.set("Content-Type", "application/json");
    const response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
    });
    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    if (response.status === 401) {
      openLogin();
      throw new Error(payload?.detail || "Cần đăng nhập lại.");
    }
    if (!response.ok)
      throw new Error(
        payload?.detail ||
          payload?.message ||
          `Yêu cầu thất bại (${response.status}).`,
      );
    return payload;
  }

  function openLogin() {
    $("#loginOverlay").hidden = false;
    $("#authEmail").focus();
  }

  function closeLogin() {
    $("#loginOverlay").hidden = true;
    $("#loginPassword").value = "";
    $("#loginError").textContent = "";
    $("#authEmail").value = "";
    $("#authName").value = "";
    setAuthMode("login");
  }

  async function checkAuthAndHealth() {
    try {
      const [auth, health] = await Promise.all([
        api("/api/auth/status"),
        api("/api/health"),
      ]);
      healthState = health;
      $("#aiStatusText").textContent = health.aiConfigured
        ? `Sẵn sàng · ${health.model}`
        : "Chưa cấu hình GEMINI_API_KEY";
      if (!auth.authenticated) {
        openLogin();
        return;
      }
      closeLogin();
      const remote = await api("/api/me/state");
      const data = remote.data || {};
      state = {
        profile: data.profile || null,
        journals: Array.isArray(data.journals) ? data.journals : [],
        library: Array.isArray(data.library) ? data.library : [],
        chart: data.chart || null,
        reports: Array.isArray(data.reports) ? data.reports : [],
        language: data.language || localStorage.getItem("menh-hoc-language") || "vi",
        createdAt: data.createdAt || new Date().toISOString(),
      };
      latestChart = state.chart;
      localStorage.setItem("menh-hoc-language", state.language || "vi");
      if ($("#appLanguage")) $("#appLanguage").value = state.language || "vi";
      if ($("#language")) $("#language").value = state.language || "vi";
      window.MenhHocI18n?.translate(document);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* server is authoritative */
      }
      renderAll();
      fillProfileForm();
      if (state.chart) {
        try {
          renderChartResult(state.chart);
        } catch (error) {
          console.warn("Could not restore chart:", error);
        }
      }
      await refreshServerLibrary();
    } catch (error) {
      $("#aiStatusText").textContent = "Không kết nối được API";
      showToast(`Backend chưa sẵn sàng: ${error.message}`);
    }
  }

  async function refreshWeeklyUpdates() {
    try {
      const result = await api("/api/library/updates");
      weeklyReferences = result.items || [];
      const status = $("#weeklySyncStatus");
      if (status) {
        const last = result.lastSync
          ? new Date(result.lastSync).toLocaleString("vi-VN")
          : "Chưa chạy lần nào";
        status.textContent = `${result.enabled ? "Tự động · " : "Lịch tự động chưa khả dụng · "}${result.schedule} · Lần đồng bộ gần nhất: ${last}`;
      }
      $("#weeklyUpdates").innerHTML = weeklyReferences.length
        ? weeklyReferences
            .map(
              (item) =>
                `<article class="weekly-reference"><div><strong>${esc(item.title)}</strong><p>${esc(item.author || "Chưa rõ tác giả")} · ${esc(item.year || "Chưa rõ năm")} · ${esc(item.tradition || "Khác")} · ${esc(item.source)}</p>${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">Mở nguồn ↗</a>` : ""}</div><span>${esc(item.license || "Chưa xác minh")}</span></article>`,
            )
            .join("")
        : '<p class="empty-inline">Chưa phát hiện metadata. Bấm “Cập nhật ngay” để chạy lần đầu.</p>';
    } catch (error) {
      console.info("Weekly discovery status unavailable:", error.message);
    }
  }

  async function refreshServerLibrary() {
    try {
      const result = await api("/api/library");
      serverLibrary = result.items || [];
      renderLibrary();
      await refreshWeeklyUpdates();
    } catch (error) {
      console.info("Knowledge base unavailable:", error.message);
    }
  }

  // Application language preference
  const languageSelector = $("#appLanguage");
  if (languageSelector) {
    languageSelector.value = getLanguage();
    languageSelector.addEventListener("change", () => {
      setLanguage(languageSelector.value);
      showToast(({vi:"Đã đổi ngôn ngữ.",en:"Language updated.",ja:"表示言語を変更しました。"})[getLanguage()]);
    });
  }
  window.MenhHocI18n?.translate(document);

  // Navigation
  $$(".nav-item[data-page]").forEach((btn) =>
    btn.addEventListener("click", () => showPage(btn.dataset.page)),
  );
  document.addEventListener("click", async (event) => {
    const goto = event.target.closest("[data-goto]");
    if (goto) showPage(goto.dataset.goto);

    const chartButton = event.target.closest("#runChartAnalysis");
    if (!chartButton) return;
    if (!state.profile) {
      showToast("Hãy lưu hồ sơ sinh trước.");
      showPage("profile");
      return;
    }
    if (!$("#consentChartAnalysis")?.checked) {
      showToast("Vui lòng xác nhận đồng ý gửi dữ liệu lá số tối thiểu hóa với Gemini.");
      return;
    }
    chartButton.disabled = true;
    chartButton.textContent = "Gemini đang phân tích...";
    $("#chartAnalysisResult").innerHTML = '<div class="loading-state"><span class="loading-spinner"></span><p>Đang đọc toàn bộ dữ liệu Tây phương, Bát tự, Tử Vi và Vedic...</p></div>';
    try {
      const result = await api("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          profile: state.profile,
          topic: "overview",
          journals: state.journals.slice(-20),
          includeKnowledge: true,
          aiConsent: true,
          language: getLanguage(),
        }),
      });
      setAiResult("#chartAnalysisResult", result.text, result);
    } catch (error) {
      $("#chartAnalysisResult").innerHTML = `<div class="notice notice-warn"><strong>Không thể tạo phần luận giải</strong><p>${esc(error.message)}</p></div>`;
    } finally {
      chartButton.disabled = false;
      chartButton.textContent = "Luận giải chi tiết ✦";
    }
  });
  $("#avatarButton").addEventListener("click", () => showPage("profile"));
  $("#mobileMenu").addEventListener("click", () =>
    $("#sidebar").classList.toggle("open"),
  );

  // Multi-user authentication
  let authMode = "login";
  function setAuthMode(mode) {
    authMode = mode;
    $("#authTitle").textContent =
      mode === "register" ? "Tạo tài khoản Mệnh Học" : "Đăng nhập Mệnh Học";
    $("#authDescription").textContent =
      mode === "register"
        ? "Tạo tài khoản riêng để lưu hồ sơ và nhật ký an toàn."
        : "Đăng nhập để truy cập hồ sơ, lá số và nhật ký riêng của bạn.";
    $("#authNameWrap").hidden = mode !== "register";
    $("#authName").required = mode === "register";
    $("#loginPassword").minLength = mode === "register" ? 10 : 1;
    $("#authPasswordHint").hidden = mode !== "register";
    $("#authSubmit").textContent =
      mode === "register" ? "Đăng ký" : "Đăng nhập";
    $("#authToggle").textContent =
      mode === "register"
        ? "Đã có tài khoản? Đăng nhập"
        : "Chưa có tài khoản? Đăng ký";
  }
  $("#authToggle").addEventListener("click", () => {
    setAuthMode(authMode === "login" ? "register" : "login");
    $("#loginError").textContent = "";
  });
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const btn = $("#authSubmit");
    btn.disabled = true;
    $("#loginError").textContent = "";
    const payload = {
      email: $("#authEmail").value.trim(),
      password: $("#loginPassword").value,
    };
    if (authMode === "register")
      payload.displayName = $("#authName").value.trim();
    try {
      await api(
        authMode === "register" ? "/api/auth/register" : "/api/auth/login",
        { method: "POST", body: JSON.stringify(payload) },
      );
      closeLogin();
      showToast(
        authMode === "register"
          ? "Tạo tài khoản thành công."
          : "Đăng nhập thành công.",
      );
      await checkAuthAndHealth();
    } catch (error) {
      $("#loginError").textContent = error.message;
    } finally {
      btn.disabled = false;
    }
  });

  $("#testGemini")?.addEventListener("click", async () => {
    const button = $("#testGemini");
    button.disabled = true;
    button.textContent = "Đang kiểm tra...";
    try {
      const result = await api("/api/ai/test", { method: "POST" });
      $("#aiStatusText").textContent = `Đã kết nối · ${result.model}`;
      showToast(`Gemini phản hồi: ${result.response}`);
    } catch (error) {
      $("#aiStatusText").textContent = `Lỗi kết nối: ${error.message}`;
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Gửi yêu cầu kiểm tra Gemini";
    }
  });

  $("#logoutButton")?.addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      state = blankState();
      latestChart = null;
      renderAll();
      openLogin();
      showToast("Đã đăng xuất.");
    } catch (error) {
      showToast(error.message);
    }
  });

  // Profile form
  function fillProfileForm() {
    const p = state.profile || {};
    [
      "displayName",
      "birthDate",
      "birthTime",
      "gender",
      "timeAccuracy",
      "birthPlace",
      "timezone",
      "language",
      "latitude",
      "longitude",
    ].forEach((key) => {
      const el = $(`#${key}`);
      if (el && !el.matches(":focus"))
        el.value =
          p[key] ??
          (key === "timezone"
            ? "Asia/Ho_Chi_Minh"
            : key === "timeAccuracy"
              ? "unknown"
              : key === "language"
                ? "vi"
                : "");
    });
    if (p.latitude != null && p.longitude != null)
      $("#geoStatus").textContent =
        `Đã lưu tọa độ: ${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`;
    else $("#geoStatus").textContent = "Chưa tìm tọa độ";
  }

  $("#lookupLocation").addEventListener("click", async () => {
    const query = $("#birthPlace").value.trim();
    if (query.length < 2) {
      showToast("Nhập thành phố và quốc gia trước.");
      return;
    }
    const button = $("#lookupLocation");
    button.disabled = true;
    button.textContent = "Đang tìm...";
    try {
      const result = await api(`/api/geocode?q=${encodeURIComponent(query)}`);
      const results = result.results || [];
      if (!results.length) {
        $("#geoStatus").textContent =
          "Không tìm thấy địa điểm. Hãy nhập tọa độ thủ công.";
        return;
      }
      if (results.length === 1) selectGeoResult(results[0]);
      else {
        $("#geoStatus").innerHTML =
          `<select id="geoChoice" class="geo-choice"><option value="">Chọn địa điểm phù hợp...</option>${results.map((r, i) => `<option value="${i}">${esc(r.name)} (${Number(r.latitude).toFixed(4)}, ${Number(r.longitude).toFixed(4)})</option>`).join("")}</select>`;
        $("#geoChoice").addEventListener("change", (e) => {
          const index = Number(e.target.value);
          if (e.target.value !== "") selectGeoResult(results[index]);
        });
      }
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Tìm tọa độ địa điểm";
    }
  });

  function selectGeoResult(r) {
    $("#latitude").value = r.latitude;
    $("#longitude").value = r.longitude;
    $("#timezone").value = r.timezone || "Asia/Ho_Chi_Minh";
    $("#birthPlace").value = r.name;
    $("#geoStatus").textContent = `Đã chọn: ${r.name} · ${r.timezone}`;
  }

  $("#profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const birthDate = $("#birthDate").value;
    const birthPlace = $("#birthPlace").value.trim();

    const latitude =
      $("#latitude").value === "" ? null : Number($("#latitude").value);

    const longitude =
      $("#longitude").value === "" ? null : Number($("#longitude").value);

    if (!birthDate || !birthPlace || latitude == null || longitude == null) {
      showToast("Vui lòng nhập ngày sinh, nơi sinh và tọa độ nơi sinh.");
      return;
    }

    if (new Date(`${birthDate}T12:00:00`) > new Date()) {
      showToast("Ngày sinh không thể nằm trong tương lai.");
      return;
    }

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      showToast(
        "Vĩ độ/kinh độ không hợp lệ. Vĩ độ phải từ -90 đến 90, kinh độ từ -180 đến 180.",
      );
      return;
    }

    state.profile = {
      displayName: $("#displayName").value.trim(),
      birthDate,
      birthTime: $("#birthTime").value || null,
      gender: $("#gender").value,
      timeAccuracy: $("#timeAccuracy").value,
      birthPlace,
      timezone: $("#timezone").value.trim(),
      language: getLanguage(),
      latitude,
      longitude,
      updatedAt: new Date().toISOString(),
    };

    state.chart = null;
    latestChart = null;

    const button = event.submitter;

    if (button) {
      button.disabled = true;
      button.textContent = "Đang lưu...";
    }

    try {
      await api("/api/me/state", {
        method: "PUT",
        body: JSON.stringify({ data: state }),
      });

      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();

      showToast("Đã lưu hồ sơ vào Neon PostgreSQL.");
      showPage("dashboard");
    } catch (error) {
      showToast("Không thể lưu hồ sơ: " + error.message);
      console.error("Profile save failed:", error);
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = "Lưu hồ sơ <span>→</span>";
      }
    }
  });

  $("#profileForm").addEventListener("reset", () =>
    setTimeout(fillProfileForm, 0),
  );

  // Chart calculation
  $("#calculateChart").addEventListener("click", async () => {
    if (!state.profile) {
      showToast("Hãy lưu hồ sơ sinh trước.");
      showPage("profile");
      return;
    }
    const button = $("#calculateChart");
    button.disabled = true;
    button.textContent = "Đang tính...";
    $("#chartResult").innerHTML =
      '<div class="loading-state"><span class="loading-spinner"></span><p>Đang tính vị trí thiên thể, nhà, góc chiếu và Tứ trụ...</p></div>';
    try {
      const result = await api("/api/chart", {
        method: "POST",
        body: JSON.stringify({
          profile: state.profile,
          houseSystem: "P",
          includeVedic: true,
        }),
      });
      renderChartResult(result);
      showToast("Đã tính xong bản đồ sao và Bát tự.");
    } catch (error) {
      $("#chartResult").innerHTML =
        `<div class="notice notice-warn"><strong>Không thể tính lá số</strong><p>${esc(error.message)}</p><p>Kiểm tra tọa độ, giờ sinh, múi giờ và backend.</p></div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = "Tính lá số <span>✦</span>";
    }
  });

  // Life analysis
  $("#runAnalysis").addEventListener("click", async () => {
    if (!$("#consentAnalysis").checked) {
      showToast(
        "Vui lòng xác nhận đồng ý chia sẻ dữ liệu lá số tối thiểu hóa với Gemini.",
      );
      return;
    }
    if (!state.profile) {
      showToast("Hãy lưu hồ sơ sinh trước.");
      showPage("profile");
      return;
    }
    const button = $("#runAnalysis");
    button.disabled = true;
    button.textContent = "Gemini đang phân tích...";
    $("#analysisResult").innerHTML =
      '<div class="loading-state"><span class="loading-spinner"></span><p>Đang tính dữ liệu lá số (nếu chưa có), truy xuất thư viện và yêu cầu Gemini luận giải...</p></div>';
    try {
      const result = await api("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          profile: state.profile,
          topic: $("#analysisTopic").value,
          journals: state.journals.slice(-20),
          includeKnowledge: $("#includeKnowledge").checked,
          aiConsent: true,
          language: getLanguage(),
        }),
      });
      setAiResult("#analysisResult", result.text, result);
      state.reports = [
        ...(state.reports || []),
        {
          id: uid(),
          type: "analysis",
          language: getLanguage(),
          topic: $("#analysisTopic").value,
          text: result.text,
          generatedAt: result.generatedAt || new Date().toISOString(),
          model: result.model,
        },
      ].slice(-100);
      persist(null);
      showToast("Đã hoàn thành và lưu báo cáo luận giải.");
    } catch (error) {
      $("#analysisResult").innerHTML =
        `<div class="notice notice-warn"><strong>Không thể tạo báo cáo</strong><p>${esc(error.message)}</p></div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = "Phân tích bằng Gemini <span>✦</span>";
    }
  });

  // Daily reflection + transits
  $("#dailyDate").value = todayISO();
  $("#dailyDate").addEventListener("change", renderDaily);
  $("#runDaily").addEventListener("click", async () => {
    if (!$("#consentDaily").checked) {
      showToast(
        "Vui lòng xác nhận đồng ý gửi dữ liệu transit và ghi chép liên quan đến Gemini.",
      );
      return;
    }
    if (!state.profile) {
      showToast("Hãy lưu hồ sơ sinh trước.");
      showPage("profile");
      return;
    }
    const button = $("#runDaily");
    button.disabled = true;
    button.textContent = "Đang phân tích...";
    $("#dailyAIResult").innerHTML =
      '<div class="loading-state"><span class="loading-spinner"></span><p>Đang tính transit của ngày được chọn...</p></div>';
    try {
      const result = await api("/api/daily", {
        method: "POST",
        body: JSON.stringify({
          profile: state.profile,
          targetDate: $("#dailyDate").value || todayISO(),
          journals: state.journals.slice(-20),
          aiConsent: true,
          language: getLanguage(),
        }),
      });
      setAiResult("#dailyAIResult", result.text, {
        ...result,
        date: result.transits?.date,
      });
      state.reports = [
        ...(state.reports || []),
        {
          id: uid(),
          type: "daily",
          language: getLanguage(),
          date: result.transits?.date || $("#dailyDate").value,
          text: result.text,
          generatedAt: new Date().toISOString(),
          model: result.model,
        },
      ].slice(-100);
      persist(null);
      if (result.transits?.natalTransitAspects?.length) {
        const top = result.transits.natalTransitAspects
          .slice(0, 4)
          .map(
            (x) =>
              `${esc(x.transit)} ${esc(x.aspect)} ${esc(x.natal)} (orb ${Number(x.orb).toFixed(1)}°)`,
          )
          .join(" · ");
        $("#dailyAIResult").insertAdjacentHTML(
          "beforeend",
          `<div class="transit-summary"><strong>Transit nổi bật đã tính:</strong> ${top}</div>`,
        );
      }
      showToast("Đã hoàn thành chiêm nghiệm theo transit.");
    } catch (error) {
      $("#dailyAIResult").innerHTML =
        `<div class="notice notice-warn"><strong>Không thể phân tích ngày</strong><p>${esc(error.message)}</p></div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = "Phân tích ngày này <span>✦</span>";
    }
  });

  // Journal CRUD + AI review
  $("#journalDate").value = todayISO();
  $("#journalForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#journalTitle").value.trim(),
      dateValue = $("#journalDate").value;
    if (!title || !dateValue) {
      showToast("Vui lòng nhập ngày và tiêu đề ghi chép.");
      return;
    }
    state.journals.push({
      id: uid(),
      date: dateValue,
      title,
      mood: $("#journalMood").value,
      body: $("#journalBody").value.trim(),
      lesson: $("#journalLesson").value.trim(),
      language: getLanguage(),
      createdAt: new Date().toISOString(),
    });
    if (persist("Đã lưu ghi chép.")) {
      $("#journalTitle").value = "";
      $("#journalBody").value = "";
      $("#journalLesson").value = "";
      $("#journalDate").value = todayISO();
    }
  });
  $("#journalFilter").addEventListener("change", renderJournals);
  $("#journalList").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-delete-journal]");
    if (!btn) return;
    const item = state.journals.find((j) => j.id === btn.dataset.deleteJournal);
    if (!item || !confirm(`Xóa ghi chép “${item.title}”?`)) return;
    state.journals = state.journals.filter((j) => j.id !== item.id);
    persist("Đã xóa ghi chép.");
  });
  $("#analyzeJournal").addEventListener("click", async () => {
    if (!$("#consentJournal").checked) {
      showToast("Vui lòng xác nhận đồng ý gửi nhật ký đến Gemini.");
      return;
    }
    if (state.journals.length < 3) {
      showToast("Cần ít nhất 3 ghi chép để tổng hợp có ý nghĩa.");
      return;
    }
    const button = $("#analyzeJournal");
    button.disabled = true;
    button.textContent = "Đang tổng hợp...";
    $("#journalAIResult").innerHTML =
      '<div class="loading-state"><span class="loading-spinner"></span><p>Đang tìm các chủ đề và mô thức trong ghi chép của bạn...</p></div>';
    try {
      const result = await api("/api/journal/analyze", {
        method: "POST",
        body: JSON.stringify({
          profile: state.profile,
          journals: state.journals.slice(-90),
          aiConsent: true,
          language: getLanguage(),
        }),
      });
      setAiResult("#journalAIResult", result.text, result);
      state.reports = [
        ...(state.reports || []),
        {
          id: uid(),
          type: "journal-review",
          language: getLanguage(),
          text: result.text,
          generatedAt: new Date().toISOString(),
          model: result.model,
        },
      ].slice(-100);
      persist(null);
    } catch (error) {
      $("#journalAIResult").innerHTML =
        `<div class="notice notice-warn"><strong>Không thể tổng hợp nhật ký</strong><p>${esc(error.message)}</p></div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Tổng hợp nhật ký bằng AI";
    }
  });

  // Local library metadata catalog
  $("#libraryForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("#bookTitle").value.trim();
    if (!title) {
      showToast("Vui lòng nhập tên tài liệu.");
      return;
    }
    const url = $("#bookUrl").value.trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol))
          throw new Error("scheme");
      } catch {
        showToast("URL nguồn không hợp lệ.");
        return;
      }
    }
    state.library.push({
      id: uid(),
      title,
      author: $("#bookAuthor").value.trim(),
      language: $("#bookLanguage").value,
      tradition: $("#bookTradition").value,
      year: $("#bookYear").value,
      license: $("#bookLicense").value,
      url,
      createdAt: new Date().toISOString(),
    });
    if (persist("Đã thêm metadata vào thư viện.")) $("#libraryForm").reset();
  });

  $("#libraryList").addEventListener("click", async (event) => {
    const localBtn = event.target.closest("[data-delete-book]");
    if (localBtn) {
      const item = state.library.find(
        (b) => b.id === localBtn.dataset.deleteBook,
      );
      if (!item || !confirm(`Xóa tài liệu “${item.title}” khỏi danh mục?`))
        return;
      state.library = state.library.filter((b) => b.id !== item.id);
      persist("Đã xóa metadata.");
      return;
    }
    const serverBtn = event.target.closest("[data-delete-server-book]");
    if (serverBtn) {
      if (
        !confirm(
          "Xóa tài liệu và các đoạn trích đã lập chỉ mục khỏi Knowledge Base?",
        )
      )
        return;
      try {
        await api(
          `/api/library/${encodeURIComponent(serverBtn.dataset.deleteServerBook)}`,
          { method: "DELETE" },
        );
        await refreshServerLibrary();
        showToast("Đã xóa tài liệu khỏi Knowledge Base.");
      } catch (error) {
        showToast(error.message);
      }
    }
  });

  $("#libraryUploadForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = $("#knowledgeFile").files?.[0];
    if (!file) {
      showToast("Chọn một tài liệu trước.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("title", $("#knowledgeTitle").value.trim());
    form.append("license_name", $("#knowledgeLicense").value);
    form.append("tradition", "Khác");
    form.append("language", state.profile?.language || "vi");
    form.append(
      "confirm_rights",
      $("#confirmRights").checked ? "true" : "false",
    );
    const button = $('button[type="submit"]', event.currentTarget);
    button.disabled = true;
    button.textContent = "Đang xử lý tài liệu...";
    try {
      const result = await api("/api/library/upload", {
        method: "POST",
        body: form,
      });
      showToast(`Đã lập chỉ mục ${result.chunks} đoạn tài liệu.`);
      $("#libraryUploadForm").reset();
      await refreshServerLibrary();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Tải lên và lập chỉ mục";
    }
  });

  $("#discoverBooks").addEventListener("click", async () => {
    const query = $("#discoverQuery").value.trim();
    if (query.length < 2) {
      showToast("Nhập từ khóa tìm kiếm.");
      return;
    }
    const button = $("#discoverBooks");
    button.disabled = true;
    button.textContent = "Đang tìm...";
    $("#discoverResults").innerHTML =
      '<div class="loading-state"><span class="loading-spinner"></span><p>Đang tra cứu metadata từ các nguồn thư mục...</p></div>';
    try {
      const result = await api("/api/library/discover", {
        method: "POST",
        body: JSON.stringify({ query, limit: 10 }),
      });
      $("#discoverResults").innerHTML = result.items.length
        ? result.items
            .map(
              (item, i) =>
                `<article class="discovery-item"><strong>${esc(item.title)}</strong><p>${esc(item.author || "Chưa rõ tác giả")} · ${esc(item.year || "Chưa rõ năm")} · ${esc(item.source)}</p><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Xem metadata ↗</a><button type="button" data-add-discovery="${i}">Thêm metadata</button></article>`,
            )
            .join("")
        : '<p class="empty-inline">Không tìm thấy kết quả phù hợp từ các nguồn đã truy vấn.</p>';
      $("#discoverResults").dataset.items = JSON.stringify(result.items || []);
      if (result.notice)
        $("#discoverResults").insertAdjacentHTML(
          "beforeend",
          `<p class="form-footnote">${esc(result.notice)}</p>`,
        );
    } catch (error) {
      $("#discoverResults").innerHTML =
        `<p class="error-text">${esc(error.message)}</p>`;
    } finally {
      button.disabled = false;
      button.textContent = "Tìm metadata mới";
    }
  });

  $("#discoverResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-discovery]");
    if (!button) return;
    let items = [];
    try {
      items = JSON.parse($("#discoverResults").dataset.items || "[]");
    } catch {
      /* ignore malformed UI state */
    }
    const item = items[Number(button.dataset.addDiscovery)];
    if (!item) return;
    if (
      state.library.some(
        (x) => x.title.toLowerCase() === item.title.toLowerCase(),
      )
    ) {
      showToast("Tài liệu đã có trong thư viện.");
      return;
    }
    state.library.push({
      id: uid(),
      title: item.title,
      author: item.author,
      tradition: "Khác",
      year: item.year,
      license: "Chưa xác minh",
      url: item.url,
      source: item.source,
      createdAt: new Date().toISOString(),
    });
    persist("Đã thêm metadata. Chưa tải toàn văn hoặc xác minh giấy phép.");
  });
  $("#runWeeklySync").addEventListener("click", async () => {
    const button = $("#runWeeklySync");
    button.disabled = true;
    button.textContent = "Đang đồng bộ...";
    $("#weeklyUpdates").innerHTML =
      '<div class="loading-state"><span class="loading-spinner"></span><p>Đang truy vấn metadata thư mục từ các nguồn...</p></div>';
    try {
      const result = await api("/api/library/updates/run", { method: "POST" });
      showToast(
        `Đã kiểm tra ${result.result.checked} truy vấn, tìm thấy ${result.result.found} mục, thêm mới ${result.result.new}.`,
      );
      await refreshWeeklyUpdates();
    } catch (error) {
      $("#weeklyUpdates").innerHTML =
        `<p class="error-text">${esc(error.message)}</p>`;
    } finally {
      button.disabled = false;
      button.textContent = "Cập nhật ngay";
    }
  });

  $("#refreshKnowledge").addEventListener("click", refreshServerLibrary);
  $("#backupKnowledge").addEventListener("click", async () => {
    const button = $("#backupKnowledge");
    button.disabled = true;
    button.textContent = "Đang tạo bản sao...";
    try {
      const response = await fetch("/api/library/backup", {
        credentials: "same-origin",
      });
      if (response.status === 401) {
        openLogin();
        throw new Error("Cần đăng nhập lại.");
      }
      if (!response.ok) {
        let detail = `Yêu cầu thất bại (${response.status})`;
        try {
          const payload = await response.json();
          detail = payload.detail || detail;
        } catch {
          /* keep fallback */
        }
        throw new Error(detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `menh-hoc-knowledge-base-${todayISO()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("Đã tạo bản sao Knowledge Base.");
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Sao lưu Knowledge Base (.zip)";
    }
  });

  // Backup / restore / reset
  $("#exportData").addEventListener("click", async () => {
    try {
      const payload = await api("/api/me/export");
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `menh-hoc-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("Đã xuất bản sao từ PostgreSQL.");
    } catch (error) {
      showToast(error.message);
    }
  });
  $("#importData").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.data || parsed;
      if (
        !imported ||
        typeof imported !== "object" ||
        !Array.isArray(imported.journals || []) ||
        !Array.isArray(imported.library || [])
      )
        throw new Error("Cấu trúc tệp không hợp lệ.");
      if (imported.profile && typeof imported.profile !== "object")
        throw new Error("Hồ sơ không hợp lệ.");
      if (
        !confirm(
          "Nhập bản sao lưu sẽ thay thế hồ sơ, nhật ký, metadata và lá số hiện tại trong tài khoản đang đăng nhập. Tiếp tục?",
        )
      )
        return;
      const next = {
        profile: imported.profile || null,
        journals: imported.journals || [],
        library: imported.library || [],
        chart: imported.chart || null,
        reports: Array.isArray(imported.reports) ? imported.reports : [],
        createdAt: imported.createdAt || new Date().toISOString(),
      };
      await api("/api/me/import", {
        method: "POST",
        body: JSON.stringify({ data: next }),
      });
      state = next;
      latestChart = state.chart;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* optional cache */
      }
      renderAll();
      fillProfileForm();
      if (state.chart) renderChartResult(state.chart);
      showToast("Đã nhập bản sao lưu vào tài khoản PostgreSQL.");
    } catch (error) {
      showToast(error.message || "Không thể đọc tệp sao lưu.");
    } finally {
      event.target.value = "";
    }
  });
  $("#clearData").addEventListener("click", () => {
    if (
      !confirm(
        "Bạn chắc chắn muốn xóa toàn bộ hồ sơ, nhật ký và metadata sách trên trình duyệt này? Tài liệu Knowledge Base đã tải lên máy chủ không bị xóa.",
      )
    )
      return;
    state = blankState();
    latestChart = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("menh-hoc-mvp-v1");
    } catch {
      /* ignore */
    }
    api("/api/me/state", {
      method: "PUT",
      body: JSON.stringify({ data: state }),
    })
      .then(() => showToast("Đã xóa dữ liệu trong tài khoản."))
      .catch((error) => showToast(error.message));
    renderAll();
    fillProfileForm();
    showPage("dashboard");
  });

  // Initial state
  $("#dailyDate").value = todayISO();
  $("#journalDate").value = todayISO();
  renderAll();
  fillProfileForm();
  if (state.chart) {
    try {
      renderChartResult(state.chart);
    } catch (error) {
      console.warn("Could not restore cached chart:", error);
    }
  }
  checkAuthAndHealth();
})();
