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
let toastTimer;

function isDemoMode() {
  return config.DEMO_MODE || !config.API_URL;
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
    imageUrl: item.imageUrl || item.image_url || "",
    createdAt: item.createdAt || item.created_at || "",
    status: item.status || "보관 중",
  };
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
        <span class="item-status ${item.status === "반환 완료" ? "returned" : ""}">${escapeHtml(item.status)}</span>
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
      </div>
    </div>`;
  elements.itemModal.showModal();
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

    renderItems(items);
    elements.title.textContent = query ? `“${query}” 검색 결과` : "최근 등록된 물건";
    elements.total.textContent = items.length;
    elements.stored.textContent = items.filter((item) => (item.status || "보관 중") === "보관 중").length;
  } catch (error) {
    renderItems([]);
    showToast(error.message || "데이터를 불러오는 중 오류가 발생했습니다.");
  } finally {
    elements.loading.hidden = true;
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

document.querySelector("#show-all").addEventListener("click", () => {
  elements.searchInput.value = "";
  fetchItems();
});

document.querySelector("#reset-search").addEventListener("click", () => {
  elements.searchInput.value = "";
  fetchItems();
});

document.querySelector("#open-register").addEventListener("click", () => {
  if (isDemoMode()) {
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
  if (isDemoMode()) {
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
