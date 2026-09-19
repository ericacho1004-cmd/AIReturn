/**
 * 다시, 여기 - Google Apps Script backend
 *
 * Google Sheet의 기존 3열 형식을 그대로 사용합니다.
 * A: 등록 시간 / B: Base64 이미지 / C: 분석 텍스트
 *
 * Script Properties (프로젝트 설정 > 스크립트 속성):
 * - OPENAI_API_KEY  필수
 * - OPENAI_MODEL    선택, 기본값 gpt-5.6-luna
 * - SPREADSHEET_ID  선택, 기본값은 아래 DB
 * - SHEET_GID       선택, 기본값 0
 */

const DEFAULT_SPREADSHEET_ID = "1CTQwF0AhBEgA42sPALIjYo8Hex8q-sX2DAOEDmvLZ7Q";
const DEFAULT_SHEET_GID = 0;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
      return jsonResponse_({ ok: true, item: registerItem_(body) });
    }
    if (action === "claim") {
      return jsonResponse_(claimItem_(body));
    }
    return jsonResponse_({ ok: false, error: "지원하지 않는 요청입니다." });
  } catch (error) {
    console.error(error);
    return jsonResponse_({ ok: false, error: publicError_(error) });
  }
}

/**
 * Apps Script 편집기에서 최초 1회 실행해 DB 접근 권한을 승인합니다.
 * 기존 Google Sheet는 삭제하거나 변경하지 않습니다.
 */
function setupProject() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("SPREADSHEET_ID")) {
    properties.setProperty("SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID);
  }
  if (!properties.getProperty("SHEET_GID")) {
    properties.setProperty("SHEET_GID", String(DEFAULT_SHEET_GID));
  }

  const sheet = getDatabaseSheet_();
  const result = {
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/" + getSpreadsheetId_() + "/edit#gid=" + sheet.getSheetId(),
    sheetName: sheet.getName(),
    rows: sheet.getLastRow(),
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function registerItem_(body) {
  const imageData = String(body.imageData || "");
  const location = cleanText_(body.location, 30);
  const note = cleanText_(body.note, 300);

  if (!location) throw new Error("보관 위치를 입력해 주세요.");
  const parsedImage = validateImageData_(imageData);
  if (estimatedBase64Bytes_(parsedImage.base64) > MAX_IMAGE_BYTES) {
    throw new Error("이미지는 5MB 이하여야 합니다.");
  }

  const analysis = analyzeImage_(imageData, note);
  const now = new Date();
  const analysisText = formatAnalysisText_(analysis, location, note);

  let rowNumber;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getDatabaseSheet_();
    sheet.appendRow([now, imageData, analysisText]);
    rowNumber = sheet.getLastRow();
  } finally {
    lock.releaseLock();
  }

  return analysisToItem_(analysis, imageData, now, location, rowNumber - 1);
}

function claimItem_(body) {
  const requestedRowNumber = Number(body.rowNumber);
  if (!Number.isInteger(requestedRowNumber) || requestedRowNumber < 1) throw new Error("회수할 물건 정보가 올바르지 않습니다.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getDatabaseSheet_();
    const rowNumber = resolveClaimRowNumber_(sheet, requestedRowNumber, body.createdAt);

    const row = sheet.getRange(rowNumber, 1, 1, 3).getValues()[0];
    const analysisText = String(row[2] || "");
    const analysis = parseAnalysisText_(analysisText);
    if (!row[1] && !analysisText) throw new Error("회수할 물건을 찾지 못했습니다.");
    if (analysis.status === "회수 완료" || analysis.status === "반환 완료") {
      throw new Error("이미 회수 완료된 물건입니다.");
    }

    const recoveredAt = new Date();
    sheet.getRange(rowNumber, 3).setValue(upsertAnalysisFields_(analysisText, {
      status: "회수 완료",
      recoveredAt: recoveredAt.toISOString(),
    }));

    return { ok: true, status: "회수 완료", recoveredAt: recoveredAt.toISOString() };
  } finally {
    lock.releaseLock();
  }
}

function resolveClaimRowNumber_(sheet, requestedRowNumber, createdAtValue) {
  const lastRow = sheet.getLastRow();
  if (requestedRowNumber > lastRow) throw new Error("회수할 물건을 찾지 못했습니다.");

  const expectedTime = new Date(createdAtValue || "").getTime();
  if (!Number.isFinite(expectedTime)) return requestedRowNumber;

  const requestedDate = sheet.getRange(requestedRowNumber, 1).getValue();
  if (requestedDate instanceof Date && Math.abs(requestedDate.getTime() - expectedTime) < 2000) {
    return requestedRowNumber;
  }

  const dates = sheet.getRange(1, 1, lastRow, 1).getValues();
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index][0];
    if (date instanceof Date && Math.abs(date.getTime() - expectedTime) < 2000) return index + 1;
  }
  throw new Error("회수할 물건을 찾지 못했습니다. 목록을 새로고침해 주세요.");
}

function analyzeImage_(imageData, note) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty("OPENAI_API_KEY");
  const model = properties.getProperty("OPENAI_MODEL") || "gpt-5.6-luna";
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

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
      features: { type: "string", description: "사진에서 관찰되는 일반적인 특징" },
      distinctiveFeatures: { type: "string", description: "다른 물건과 구별되는 특징" },
    },
    required: ["name", "category", "color", "features", "distinctiveFeatures"],
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

function formatAnalysisText_(analysis, location, note) {
  const lines = [
    "name: \"" + oneLine_(analysis.name, 80) + "\"",
    "category: \"" + oneLine_(analysis.category, 50) + "\"",
    "color: \"" + oneLine_(analysis.color, 50) + "\"",
    "features: \"" + oneLine_(analysis.features, 300) + "\"",
    "distinctiveFeatures: \"" + oneLine_(analysis.distinctiveFeatures, 300) + "\"",
    "location: \"" + oneLine_(location, 30) + "\"",
  ];
  if (note) lines.push("note: \"" + oneLine_(note, 300) + "\"");
  return lines.join("\n");
}

function listItems_(query, limit) {
  const sheet = getDatabaseSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];

  const normalizedQuery = normalizeSearch_(query);
  return sheet.getRange(1, 1, lastRow, 3).getValues()
    .map(function(row, index) { return rowToItem_(row, index); })
    .filter(function(item) {
      if (!item) return false;
      if (!normalizedQuery) return true;
      const searchable = normalizeSearch_([
        item.name, item.category, item.color, item.location,
        item.features.join(" "), item.distinctiveFeatures.join(" "),
      ].join(" "));
      return normalizedQuery.split(/\s+/).every(function(word) { return searchable.indexOf(word) !== -1; });
    })
    .sort(function(a, b) { return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); })
    .slice(0, limit);
}

function rowToItem_(row, index) {
  const createdAt = row[0] instanceof Date ? row[0] : new Date(row[0]);
  const imageData = String(row[1] || "");
  const analysisText = String(row[2] || "");
  if (!imageData && !analysisText) return null;
  const analysis = parseAnalysisText_(analysisText);
  return analysisToItem_(analysis, imageData, createdAt, analysis.location || "미지정", index);
}

function analysisToItem_(analysis, imageData, createdAt, location, index) {
  const date = createdAt instanceof Date && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
  return {
    id: "sheet-" + (typeof index === "number" ? index : Utilities.getUuid()),
    name: cleanText_(analysis.name, 80) || "이름 미상 물건",
    category: cleanText_(analysis.category, 50) || "기타",
    color: cleanText_(analysis.color, 50) || "색상 미상",
    features: analysis.features ? [cleanText_(analysis.features, 300)] : [],
    distinctiveFeatures: analysis.distinctiveFeatures ? [cleanText_(analysis.distinctiveFeatures, 300)] : [],
    location: cleanText_(location, 30) || "미지정",
    imageData: imageData,
    imageUrl: imageData,
    createdAt: date.toISOString(),
    status: ["회수 완료", "반환 완료"].indexOf(analysis.status) !== -1 ? "회수 완료" : "보관 중",
    recoveredAt: cleanText_(analysis.recoveredAt, 40),
    rowNumber: typeof index === "number" ? index + 1 : 0,
  };
}

function upsertAnalysisFields_(analysisText, fields) {
  const keys = Object.keys(fields);
  const keptLines = String(analysisText || "").split(/\r?\n/).filter(function(line) {
    const match = line.match(/^([A-Za-z_]+)\s*:/);
    return !match || keys.indexOf(match[1]) === -1;
  });
  keys.forEach(function(key) {
    keptLines.push(key + ': "' + oneLine_(fields[key], 80) + '"');
  });
  return keptLines.filter(Boolean).join("\n");
}

function parseAnalysisText_(text) {
  const result = {};
  String(text || "").split(/\r?\n/).forEach(function(line) {
    const match = line.match(/^([A-Za-z_]+)\s*:\s*["']?(.*?)["']?\s*$/);
    if (!match) return;
    result[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  });
  return result;
}

function getDatabaseSheet_() {
  const spreadsheet = SpreadsheetApp.openById(getSpreadsheetId_());
  const properties = PropertiesService.getScriptProperties();
  const gid = Number(properties.getProperty("SHEET_GID") || DEFAULT_SHEET_GID);
  const sheet = spreadsheet.getSheetById(gid);
  if (!sheet) throw new Error("SHEET_GID에 해당하는 시트를 찾지 못했습니다.");
  return sheet;
}

function getSpreadsheetId_() {
  return PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID") || DEFAULT_SPREADSHEET_ID;
}

function validateImageData_(imageData) {
  const match = String(imageData || "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("JPG, PNG 또는 WEBP 이미지만 사용할 수 있습니다.");
  return { subtype: match[1], base64: match[2] };
}

function estimatedBase64Bytes_(base64) {
  const padding = String(base64).endsWith("==") ? 2 : String(base64).endsWith("=") ? 1 : 0;
  return Math.floor(String(base64).length * 3 / 4) - padding;
}

function parseRequestBody_(event) {
  if (!event || !event.postData || !event.postData.contents) throw new Error("요청 본문이 없습니다.");
  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw new Error("요청 JSON 형식이 올바르지 않습니다.");
  }
}

function oneLine_(value, maxLength) {
  return cleanText_(value, maxLength).replace(/["']/g, "");
}

function cleanText_(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeSearch_(value) {
  return String(value || "").toLowerCase().replace(/[^0-9a-z가-힣\s]/g, " ").replace(/\s+/g, " ").trim();
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function publicError_(error) {
  const message = error && error.message ? error.message : "서버 오류가 발생했습니다.";
  const safeMessages = ["입력", "필요", "설정", "없", "올바르지", "실패", "확인", "이미지", "사진", "회수", "지원하지", "찾지"];
  return safeMessages.some(function(fragment) { return message.indexOf(fragment) !== -1; })
    ? message
    : "서버 처리 중 오류가 발생했습니다.";
}
