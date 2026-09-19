const config = window.APP_CONFIG || {};

const demoItems = [
  {
    id: "demo-1",
    name: "무선 이어폰 케이스",
    category: "전자기기",
    color: "흰색",
    features: ["둥근 모서리", "충전 단자", "작은 흠집"],
    distinctiveFeatures: ["오른쪽 아래 작은 회색 자국"],
    location: "A-2",
    imageUrl: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-09-19T13:20:00+09:00",
    status: "보관 중",
  },
  {
    id: "demo-2",
    name: "검은색 반지갑",
    category: "지갑",
    color: "검정",
    features: ["가죽 재질", "카드 수납", "접이식"],
    distinctiveFeatures: ["표면에 사선 무늬"],
    location: "B-1",
    imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-09-18T16:45:00+09:00",
    status: "보관 중",
  },
  {
    id: "demo-3",
    name: "투명 장우산",
    category: "우산",
    color: "투명 / 흰색",
    features: ["긴 손잡이", "투명 비닐", "흰색 테두리"],
    distinctiveFeatures: ["손잡이에 파란 스티커"],
    location: "C-3",
    imageUrl: "https://images.unsplash.com/photo-1514474959185-1472d4c4e0d4?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-09-18T09:10:00+09:00",
    status: "보관 중",
  },
  {
    id: "demo-4",
    name: "실버 스마트워치",
    category: "전자기기",
    color: "은색 / 검정",
    features: ["사각 화면", "검정 밴드", "측면 버튼"],
    distinctiveFeatures: ["밴드 안쪽 흰색 표시"],
    location: "A-4",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
    createdAt: "2026-09-17T14:05:00+09:00",
    status: "보관 중",
  },
];

const elements = {
  grid: document.querySelector("#item-grid"),
  loading: document.querySelector("#loading"),
  empty: document.querySelector("#empty-state"),
  notice: document.querySelector("#connection-notice"),
  title: document.querySelector("#items-title"),
  total: document.querySelector("#total-count"),
  stored: document.querySelector("#stored-count"),
  recovered: document.querySelector("#recovered-count"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  itemModal: document.querySelector("#item-modal"),
  itemDetail: document.querySelector("#item-detail"),
  registerModal: document.querySelector("#register-modal"),
  registerForm: document.querySelector("#register-form"),
  registerSubmit: document.querySelector("#register-submit"),
  formMessage: document.querySelector("#form-message"),
  imageInput: document.querySelector("#item-image"),
  imagePreview: document.querySelector("#image-preview"),
  uploadPrompt: document.querySelector("#upload-prompt"),
  toast: document.querySelector("#toast"),
};

let currentItems = [];
let loadedItems = [];
let currentQuery = "";
let currentStatusFilter = "전체";
let toastTimer;

function isDemoMode() {
  return Boolean(config.DEMO_MODE) || (!config.SHEET_ID && !config.API_URL);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeImageUrl(value) {
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(value || ""))) {
    return String(value);
  }
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (_) {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "날짜 정보 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(date);
}

function normalizeItem(item) {
  const toArray = (value) => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [String(value)];
    } catch (_) {
      return String(value).split(",").map((part) => part.trim()).filter(Boolean);
    }
  };

  return {
    id: String(item.id || ""),
    name: item.name || "이름 미상",
    category: item.category || "기타",
    color: item.color || "색상 미상",
    features: toArray(item.features),
    distinctiveFeatures: toArray(item.distinctiveFeatures || item.distinctive_features),
    location: item.location || "확인 필요",
    imageUrl: item.imageUrl || item.image_url || item.imageData || "",
    createdAt: item.createdAt || item.created_at || "",
    status: ["회수 완료", "반환 완료"].includes(item.status) ? "회수 완료" : "보관 중",
    recoveredAt: item.recoveredAt || item.recovered_at || "",
    rowNumber: Number(item.rowNumber || item.row_number || 0),
  };
}

function parseAnalysisText(text = "") {
  const result = {};
  const knownKeys = ["name", "category", "color", "features", "distinctiveFeatures", "location", "note", "status", "recoveredAt"];

  String(text).split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z_]+)\s*:\s*["']?(.*?)["']?\s*$/);
    if (!match || !knownKeys.includes(match[1])) return;
    result[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  });

  return result;
}

function sheetDateToIso(cell) {
  if (!cell) return "";
  if (cell.f && /^\d{4}-\d{2}-\d{2}/.test(cell.f)) {
    return cell.f.replace(" ", "T") + "+09:00";
  }
  const match = String(cell.v || "").match(/^Date\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)$/);
  if (!match) return String(cell.v || "");
  const [, year, month, day, hour, minute, second] = match.map(Number);
  return new Date(year, month, day, hour, minute, second).toISOString();
}

function sheetRowToItem(row, index) {
  const cells = row && Array.isArray(row.c) ? row.c : [];
  const createdAt = sheetDateToIso(cells[0]);
  const imageData = cells[1] && cells[1].v ? String(cells[1].v) : "";
  const analysisText = cells[2] && cells[2].v ? String(cells[2].v) : "";
  const analysis = parseAnalysisText(analysisText);

  if (!imageData && !analysisText) return null;
  return normalizeItem({
    id: `sheet-${index}-${createdAt}`,
    name: analysis.name || "이름 미상 물건",
    category: analysis.category || "기타",
    color: analysis.color || "색상 미상",
    features: analysis.features ? [analysis.features] : [],
    distinctiveFeatures: analysis.distinctiveFeatures ? [analysis.distinctiveFeatures] : [],
    location: analysis.location || "미지정",
    imageData,
    createdAt,
    status: analysis.status || "보관 중",
    recoveredAt: analysis.recoveredAt || "",
    rowNumber: index + 1,
  });
}

function loadPublicSheetItems() {
  return new Promise((resolve, reject) => {
    if (!config.SHEET_ID) {
      reject(new Error("Google Sheet ID가 설정되지 않았습니다."));
      return;
    }

    const callbackName = `__loadLostItems_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => finish(new Error("Google Sheet 응답 시간이 초과되었습니다.")), 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    function finish(error, items = []) {
      cleanup();
      if (error) reject(error);
      else resolve(items);
    }

    window[callbackName] = (response) => {
      if (!response || response.status !== "ok" || !response.table) {
        finish(new Error("Google Sheet 데이터를 읽지 못했습니다."));
        return;
      }
      const items = (response.table.rows || [])
        .map(sheetRowToItem)
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      finish(null, items);
    };

    const params = new URLSearchParams({
      gid: String(config.SHEET_GID || "0"),
      headers: "0",
      _: String(Date.now()),
      tqx: `out:json;responseHandler:${callbackName}`,
    });
    script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(config.SHEET_ID)}/gviz/tq?${params}`;
    script.onerror = () => finish(new Error("Google Sheet 연결에 실패했습니다."));
    document.head.append(script);
  });
}

function itemMatches(item, query) {
  const text = [item.name, item.category, item.color, item.location, ...item.features, ...item.distinctiveFeatures]
    .join(" ")
    .toLocaleLowerCase("ko-KR");
  return query.toLocaleLowerCase("ko-KR").trim().split(/\s+/).every((word) => text.includes(word));
}

function renderItems(items) {
  currentItems = items.map(normalizeItem);
  elements.grid.innerHTML = "";
  elements.empty.hidden = currentItems.length > 0;
  elements.grid.hidden = currentItems.length === 0;

  currentItems.forEach((item) => {
    const imageUrl = safeImageUrl(item.imageUrl);
    const card = document.createElement("article");
    card.className = "item-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${item.name} 상세 정보 보기`);
    card.dataset.id = item.id;
    card.innerHTML = `
      <div class="item-image">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />` : ""}
        <span class="item-status ${item.status === "회수 완료" ? "returned" : ""}">${escapeHtml(item.status)}</span>
      </div>
      <div class="item-body">
        <span class="item-category">${escapeHtml(item.category)}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="feature-list">${item.features.slice(0, 2).map((feature) => `<span>${escapeHtml(feature)}</span>`).join("")}</div>
        <div class="item-meta">
          <span>${escapeHtml(formatDate(item.createdAt))}</span>
          <span class="item-location">${escapeHtml(item.location)}</span>
        </div>
      </div>`;
    card.addEventListener("click", () => openItemDetail(item));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openItemDetail(item);
      }
    });
    elements.grid.append(card);
  });
}

function openItemDetail(item) {
  const imageUrl = safeImageUrl(item.imageUrl);
  const tags = [...item.features, ...item.distinctiveFeatures];
  elements.itemDetail.innerHTML = `
    <div class="detail-layout">
      <div class="detail-image">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.name)}" />` : ""}</div>
      <div class="detail-content">
        <span class="item-category">${escapeHtml(item.category)}</span>
        <h2>${escapeHtml(item.name)}</h2>
        <p class="detail-color">${escapeHtml(item.color)}</p>
        <div class="detail-block"><small>눈에 띄는 특징</small><div class="detail-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "정보 없음"}</div></div>
        <div class="detail-block"><small>등록일</small><p>${escapeHtml(formatDate(item.createdAt))}</p></div>
        <div class="location-box"><span>보관 위치</span><strong>${escapeHtml(item.location)}</strong></div>
        ${item.status === "회수 완료" ? `
          <div class="recovered-box">
            <strong>회수 완료된 물건입니다</strong>
            <p>${item.recoveredAt ? `${escapeHtml(formatDate(item.recoveredAt))}에 주인이 찾아갔습니다.` : "주인이 찾아간 물건입니다."}</p>
          </div>` : `
          <form class="claim-form" id="claim-form">
            <h3>이 물건이 본인 물건인가요?</h3>
            <p>잘못 가져간 경우 연락할 수 있도록 전화번호를 비공개로 기록합니다.</p>
            <label for="claim-phone">가져가는 분의 전화번호</label>
            <input id="claim-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="010-1234-5678" maxlength="20" required />
            <label class="privacy-check"><input name="consent" type="checkbox" required /> 회수 확인을 위한 전화번호 저장에 동의합니다.</label>
            <p class="claim-message" id="claim-message" aria-live="polite"></p>
            <button class="claim-button" type="submit">내 물건 가져가기</button>
          </form>`}
      </div>
    </div>`;
  const claimForm = elements.itemDetail.querySelector("#claim-form");
  if (claimForm) claimForm.addEventListener("submit", (event) => claimItem(event, item));
  elements.itemModal.showModal();
}

function applyStatusFilter() {
  const visibleItems = currentStatusFilter === "전체"
    ? loadedItems
    : loadedItems.filter((item) => item.status === currentStatusFilter);
  renderItems(visibleItems);
  if (currentQuery) {
    elements.title.textContent = `“${currentQuery}” 검색 결과`;
  } else if (currentStatusFilter === "회수 완료") {
    elements.title.textContent = "회수된 분실물";
  } else if (currentStatusFilter === "보관 중") {
    elements.title.textContent = "현재 보관 중인 물건";
  } else {
    elements.title.textContent = "최근 등록된 물건";
  }
}

async function fetchItems(query = "") {
  elements.loading.hidden = false;
  elements.grid.hidden = true;
  elements.empty.hidden = true;

  try {
    let items;
    if (isDemoMode()) {
      elements.notice.hidden = false;
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      items = query ? demoItems.filter((item) => itemMatches(normalizeItem(item), query)) : demoItems;
    } else if (config.SHEET_ID) {
      elements.notice.hidden = true;
      const sheetItems = await loadPublicSheetItems();
      items = query ? sheetItems.filter((item) => itemMatches(item, query)) : sheetItems;
    } else {
      elements.notice.hidden = true;
      const url = new URL(config.API_URL);
      url.searchParams.set("action", "list");
      if (query) url.searchParams.set("query", query);
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "목록을 불러오지 못했습니다.");
      items = data.items || [];
    }

    currentQuery = query;
    loadedItems = items.map(normalizeItem);
    applyStatusFilter();
    elements.total.textContent = loadedItems.length;
    elements.stored.textContent = loadedItems.filter((item) => item.status === "보관 중").length;
    elements.recovered.textContent = loadedItems.filter((item) => item.status === "회수 완료").length;
  } catch (error) {
    renderItems([]);
    showToast(error.message || "데이터를 불러오는 중 오류가 발생했습니다.");
  } finally {
    elements.loading.hidden = true;
  }
}

async function claimItem(event, item) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.querySelector("#claim-message");
  const submit = form.querySelector("button[type=submit]");
  const phone = String(new FormData(form).get("phone") || "").trim();

  if (!config.API_URL) {
    message.textContent = "회수 기능을 사용하려면 config.js에 Apps Script 주소를 연결해 주세요.";
    return;
  }
  if (!/^\+?[0-9()\-\s]{9,20}$/.test(phone) || phone.replace(/\D/g, "").length < 9) {
    message.textContent = "연락 가능한 전화번호를 정확히 입력해 주세요.";
    return;
  }

  submit.disabled = true;
  submit.textContent = "회수 처리 중...";
  message.textContent = "";
  try {
    const response = await fetch(config.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "claim",
        rowNumber: item.rowNumber,
        createdAt: item.createdAt,
        phone,
      }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "회수 처리에 실패했습니다.");

    const recoveredAt = data.recoveredAt || new Date().toISOString();
    loadedItems = loadedItems.map((loadedItem) => loadedItem.id === item.id
      ? { ...loadedItem, status: "회수 완료", recoveredAt }
      : loadedItem);
    elements.stored.textContent = loadedItems.filter((loadedItem) => loadedItem.status === "보관 중").length;
    elements.recovered.textContent = loadedItems.filter((loadedItem) => loadedItem.status === "회수 완료").length;
    elements.itemModal.close();
    applyStatusFilter();
    showToast("회수 완료로 처리했습니다. 전화번호는 비공개로 보관됩니다.");
  } catch (error) {
    message.textContent = error.message || "회수 처리 중 오류가 발생했습니다.";
    submit.disabled = false;
    submit.textContent = "내 물건 가져가기";
  }
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 3200);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  fetchItems(query);
  document.querySelector("#recent").scrollIntoView({ behavior: "smooth" });
});

document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => {
    elements.searchInput.value = button.dataset.query;
    elements.searchForm.requestSubmit();
  });
});

document.querySelectorAll("[data-status-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    currentStatusFilter = button.dataset.statusFilter;
    document.querySelectorAll("[data-status-filter]").forEach((filterButton) => {
      const isActive = filterButton === button;
      filterButton.classList.toggle("active", isActive);
      filterButton.setAttribute("aria-pressed", String(isActive));
    });
    applyStatusFilter();
  });
});

document.querySelector("#show-all").addEventListener("click", () => {
  elements.searchInput.value = "";
  currentStatusFilter = "전체";
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    const isActive = button.dataset.statusFilter === "전체";
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  fetchItems();
});

document.querySelector("#reset-search").addEventListener("click", () => {
  elements.searchInput.value = "";
  fetchItems();
});

document.querySelector("#open-register").addEventListener("click", () => {
  if (!config.API_URL) {
    showToast("먼저 config.js에 Apps Script 주소를 연결해 주세요.");
  }
  elements.registerModal.showModal();
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.close}`).close());
});

[elements.itemModal, elements.registerModal].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) dialog.close();
  });
});

elements.imageInput.addEventListener("change", async () => {
  const [file] = elements.imageInput.files;
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    elements.imageInput.value = "";
    elements.formMessage.textContent = "이미지는 5MB 이하만 등록할 수 있습니다.";
    return;
  }
  elements.imagePreview.src = await fileToDataUrl(file);
  elements.imagePreview.hidden = false;
  elements.uploadPrompt.hidden = true;
  elements.formMessage.textContent = "";
});

elements.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!config.API_URL) {
    elements.formMessage.textContent = "config.js에 Apps Script 주소를 연결한 뒤 등록할 수 있습니다.";
    return;
  }

  const [file] = elements.imageInput.files;
  if (!file) return;
  const formData = new FormData(elements.registerForm);
  elements.registerSubmit.disabled = true;
  elements.registerSubmit.querySelector("span").textContent = "AI가 사진을 분석하는 중...";
  elements.formMessage.textContent = "잠시만 기다려 주세요. 보통 10~30초 정도 걸립니다.";
  elements.formMessage.classList.remove("success");

  try {
    const payload = {
      action: "register",
      imageData: await fileToDataUrl(file),
      location: String(formData.get("location") || "").trim(),
      note: String(formData.get("note") || "").trim(),
    };
    const response = await fetch(config.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "등록에 실패했습니다.");

    elements.formMessage.textContent = `${data.item.name} 등록이 완료되었습니다.`;
    elements.formMessage.classList.add("success");
    showToast("새 습득물을 등록했습니다.");
    elements.registerForm.reset();
    elements.imagePreview.hidden = true;
    elements.uploadPrompt.hidden = false;
    await fetchItems();
    window.setTimeout(() => elements.registerModal.close(), 900);
  } catch (error) {
    elements.formMessage.textContent = error.message || "등록 중 오류가 발생했습니다.";
  } finally {
    elements.registerSubmit.disabled = false;
    elements.registerSubmit.querySelector("span").textContent = "AI로 분석하고 등록하기";
  }
});

fetchItems();
