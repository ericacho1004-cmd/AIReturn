/**
 * 다시, 여기 - Google Apps Script backend
 *
 * Script Properties (프로젝트 설정 > 스크립트 속성):
 * - OPENAI_API_KEY  필수
 * - SPREADSHEET_ID  setupProject() 실행 시 자동 생성
 * - IMAGE_FOLDER_ID setupProject() 실행 시 자동 생성
 * - OPENAI_MODEL    선택, 기본값 gpt-5.6-luna
 */

const SHEET_NAME = "lost_items";
const HEADERS = [
  "id",
  "name",
  "category",
  "color",
  "features",
  "distinctive_features",
  "location",
  "image_url",
  "drive_file_id",
  "created_at",
  "status",
  "confidence",
  "note",
];

function doGet(event) {
  try {
    const action = String((event && event.parameter && event.parameter.action) || "list");

    if (action === "health") {
      return jsonResponse_({ ok: true, service: "smart-lost-found", timestamp: new Date().toISOString() });
    }

    if (action === "list") {
      const query = String((event && event.parameter && event.parameter.query) || "").trim();
      const limitValue = Number((event && event.parameter && event.parameter.limit) || 100);
      const limit = Math.max(1, Math.min(Number.isFinite(limitValue) ? limitValue : 100, 200));
      return jsonResponse_({ ok: true, items: listItems_(query, limit) });
    }

    return jsonResponse_({ ok: false, error: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: publicError_(error) });
  }
}

function doPost(event) {
  try {
    const body = parseRequestBody_(event);
    const action = String(body.action || "");

    if (action === "register") {
      const item = registerItem_(body);
      return jsonResponse_({ ok: true, item: item });
    }

    return jsonResponse_({ ok: false, error: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: publicError_(error) });
  }
}

/**
 * Apps Script 편집기에서 최초 1회 실행합니다.
 * 새 스프레드시트와 이미지 폴더를 만들고 ID를 Script Properties에 저장합니다.
 */
function setupProject() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  let folderId = properties.getProperty("IMAGE_FOLDER_ID");

  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create("다시, 여기 - 분실물 DB");
    spreadsheetId = spreadsheet.getId();
    properties.setProperty("SPREADSHEET_ID", spreadsheetId);
  }

  if (!folderId) {
    const folder = DriveApp.createFolder("다시, 여기 - 분실물 사진");
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    folderId = folder.getId();
    properties.setProperty("IMAGE_FOLDER_ID", folderId);
  }

  ensureSheet_();

  const result = {
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/" + spreadsheetId + "/edit",
    imageFolderUrl: "https://drive.google.com/drive/folders/" + folderId,
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function registerItem_(body) {
  const imageData = String(body.imageData || "");
  const location = cleanText_(body.location, 30);
  const note = cleanText_(body.note, 300);

  if (!location) throw new Error("보관 위치를 입력해 주세요.");
  if (!imageData) throw new Error("물건 사진이 필요합니다.");

  const analysis = analyzeImage_(imageData, note);
  const image = saveImage_(imageData, analysis.name);
  const now = new Date();
  const item = {
    id: Utilities.getUuid(),
    name: cleanText_(analysis.name, 80) || "이름 미상 물건",
    category: cleanText_(analysis.category, 50) || "기타",
    color: cleanText_(analysis.color, 50) || "색상 미상",
    features: normalizeStringArray_(analysis.features, 8, 80),
    distinctiveFeatures: normalizeStringArray_(analysis.distinctive_features, 8, 120),
    location: location,
    imageUrl: image.url,
    driveFileId: image.fileId,
    createdAt: now.toISOString(),
    status: "보관 중",
    confidence: normalizeConfidence_(analysis.confidence),
    note: note,
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = ensureSheet_();
    sheet.appendRow([
      item.id,
      safeCell_(item.name),
      safeCell_(item.category),
      safeCell_(item.color),
      JSON.stringify(item.features),
      JSON.stringify(item.distinctiveFeatures),
      safeCell_(item.location),
      item.imageUrl,
      item.driveFileId,
      now,
      item.status,
      item.confidence,
      safeCell_(item.note),
    ]);
  } finally {
    lock.releaseLock();
  }

  return item;
}

function analyzeImage_(imageData, note) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty("OPENAI_API_KEY");
  const model = properties.getProperty("OPENAI_MODEL") || "gpt-5.6-luna";
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  validateImageData_(imageData);
  const prompt = [
    "이 사진에서 분실물로 등록할 가장 중심적인 물건 하나를 분석하세요.",
    "사람, 배경, 수납함은 물건 정보에서 제외하세요.",
    "사진만으로 확실하지 않은 브랜드나 재질은 추측하지 마세요.",
    "검색에 도움이 되도록 일반적인 한국어 물건 이름과 짧고 관찰 가능한 특징을 작성하세요.",
    note ? "등록 참고 사항: " + note : "",
  ].filter(Boolean).join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", description: "한국어 물건 이름" },
      category: { type: "string", description: "간단한 한국어 분류" },
      color: { type: "string", description: "주요 색상" },
      features: { type: "array", items: { type: "string" }, description: "눈에 보이는 일반 특징" },
      distinctive_features: { type: "array", items: { type: "string" }, description: "다른 물건과 구별되는 특징" },
      confidence: { type: "number", description: "분석 확신도 0부터 1" },
    },
    required: ["name", "category", "color", "features", "distinctive_features", "confidence"],
  };

  const payload = {
    model: model,
    store: false,
    instructions: "당신은 분실물 사진을 사실에 근거해 분류하는 도우미입니다. 모든 텍스트 값은 한국어로 답하세요.",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageData, detail: "high" },
      ],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "lost_item_analysis",
        strict: true,
        schema: schema,
      },
      verbosity: "low",
    },
    max_output_tokens: 800,
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error("OpenAI API 응답을 해석하지 못했습니다.");
  }

  if (status < 200 || status >= 300) {
    const apiMessage = data && data.error && data.error.message;
    console.error("OpenAI API error " + status + ": " + (apiMessage || response.getContentText()));
    throw new Error("OpenAI 이미지 분석에 실패했습니다. 모델명과 API 결제 설정을 확인해 주세요.");
  }

  const outputText = extractOutputText_(data);
  if (!outputText) throw new Error("OpenAI API가 분석 결과를 반환하지 않았습니다.");

  try {
    return JSON.parse(outputText);
  } catch (error) {
    console.error("Invalid structured output: " + outputText);
    throw new Error("AI 분석 결과 형식이 올바르지 않습니다.");
  }
}

function extractOutputText_(response) {
  if (response.output_text) return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (let i = 0; i < output.length; i += 1) {
    const content = Array.isArray(output[i].content) ? output[i].content : [];
    for (let j = 0; j < content.length; j += 1) {
      if (content[j].type === "output_text" && content[j].text) return content[j].text;
    }
  }
  return "";
}

function saveImage_(imageData, itemName) {
  const parsed = validateImageData_(imageData);
  const properties = PropertiesService.getScriptProperties();
  const folderId = properties.getProperty("IMAGE_FOLDER_ID");
  if (!folderId) throw new Error("IMAGE_FOLDER_ID가 없습니다. setupProject()를 먼저 실행해 주세요.");

  const bytes = Utilities.base64Decode(parsed.base64);
  if (bytes.length > 5 * 1024 * 1024) throw new Error("이미지는 5MB 이하여야 합니다.");

  const extension = parsed.subtype === "jpeg" ? "jpg" : parsed.subtype;
  const filename = new Date().toISOString().replace(/[:.]/g, "-") + "_" + filenameSafe_(itemName) + "." + extension;
  const blob = Utilities.newBlob(bytes, parsed.mimeType, filename);
  const file = DriveApp.getFolderById(folderId).createFile(blob);

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    file.setTrashed(true);
    throw new Error("Google Workspace 정책 때문에 이미지를 공개할 수 없습니다. Drive 외부 공유 설정을 확인해 주세요.");
  }

  return {
    fileId: file.getId(),
    url: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1200",
  };
}

function validateImageData_(imageData) {
  const match = String(imageData).match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("JPG, PNG 또는 WEBP 이미지만 사용할 수 있습니다.");
  const subtype = match[1] === "jpg" ? "jpeg" : match[1];
  return { subtype: subtype, mimeType: "image/" + subtype, base64: match[2] };
}

function listItems_(query, limit) {
  const sheet = ensureSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const normalizedQuery = normalizeSearch_(query);
  return rows
    .map(rowToItem_)
    .filter(function(item) {
      if (!normalizedQuery) return true;
      const searchable = normalizeSearch_([
        item.name,
        item.category,
        item.color,
        item.location,
        item.features.join(" "),
        item.distinctiveFeatures.join(" "),
      ].join(" "));
      return normalizedQuery.split(/\s+/).every(function(word) { return searchable.indexOf(word) !== -1; });
    })
    .sort(function(a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); })
    .slice(0, limit);
}

function rowToItem_(row) {
  const createdAt = row[9] instanceof Date ? row[9].toISOString() : String(row[9] || "");
  return {
    id: String(row[0] || ""),
    name: String(row[1] || ""),
    category: String(row[2] || ""),
    color: String(row[3] || ""),
    features: parseArrayCell_(row[4]),
    distinctiveFeatures: parseArrayCell_(row[5]),
    location: String(row[6] || ""),
    imageUrl: String(row[7] || ""),
    createdAt: createdAt,
    status: String(row[10] || "보관 중"),
  };
}

function ensureSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID가 없습니다. setupProject()를 먼저 실행해 주세요.");
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  const currentHeaders = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (currentHeaders.join("|") !== HEADERS.join("|")) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold").setBackground("#153e35").setFontColor("#ffffff");
    sheet.autoResizeColumns(1, HEADERS.length);
  }
  return sheet;
}

function parseRequestBody_(event) {
  if (!event || !event.postData || !event.postData.contents) throw new Error("요청 본문이 없습니다.");
  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error("요청 JSON 형식이 올바르지 않습니다.");
  }
}

function normalizeStringArray_(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(function(item) { return cleanText_(item, maxLength); }).filter(Boolean);
}

function normalizeConfidence_(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Math.max(0, Math.min(1, number));
}

function parseArrayCell_(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return String(value || "").split(",").map(function(item) { return item.trim(); }).filter(Boolean);
  }
}

function cleanText_(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeCell_(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function normalizeSearch_(value) {
  return String(value || "").toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").replace(/\s+/g, " ").trim();
}

function filenameSafe_(value) {
  return cleanText_(value, 30).replace(/[^0-9a-zA-Z가-힣_-]/g, "_") || "item";
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function publicError_(error) {
  const message = error && error.message ? error.message : "서버 오류가 발생했습니다.";
  const safeMessages = [
    "입력", "필요", "설정", "없", "올바르지", "실패", "확인", "이미지", "사진", "지원하지", "찾을 수", "정책",
  ];
  return safeMessages.some(function(fragment) { return message.indexOf(fragment) !== -1; })
    ? message
    : "서버 처리 중 오류가 발생했습니다.";
}
