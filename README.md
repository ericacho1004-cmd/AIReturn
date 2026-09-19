# 다시, 여기 — Smart Lost & Found

Google Sheet에 저장된 Base64 사진과 AI 분석 결과를 읽어 분실물을 검색하고 보관 위치를 확인하는 GitHub Pages 웹사이트입니다.

## 현재 연결 구조

```text
웹사이트 목록 조회
GitHub Pages → 공개 Google Sheet (Visualization JSONP)

새 습득물 등록
GitHub Pages → Google Apps Script → OpenAI Responses API
                                      ↓
                          기존 Google Sheet에 3열로 저장
```

현재 DB:

```text
https://docs.google.com/spreadsheets/d/1CTQwF0AhBEgA42sPALIjYo8Hex8q-sX2DAOEDmvLZ7Q/edit?gid=0
```

## DB 형식

기존 시트 형식을 변경하지 않습니다. 헤더 없이 각 행을 다음처럼 사용합니다.

| 열 | 값 |
|---|---|
| A | 등록 시간 |
| B | `data:image/jpeg;base64,...` 형식 이미지 |
| C | AI 분석 텍스트 |

C열 예시:

```text
name: "스마트폰"
category: "전자기기"
color: "검은색"
features: "직사각형 터치스크린과 둥근 모서리"
distinctiveFeatures: "밝은색 케이스가 씌워져 있음"
location: "A-1"
note: "선택 입력 사항"
```

기존 행에 `location`이 없으면 웹사이트에는 `미지정`으로 표시됩니다.

## 프로젝트 파일

```text
.
├── index.html
├── styles.css
├── app.js
├── config.js
├── .nojekyll
└── google-apps-script/
    ├── Code.gs
    └── appsscript.json
```

## 1. 웹사이트 확인

`config.js`에 실제 Sheet ID와 GID가 이미 설정되어 있습니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 열면 시트에 있는 스마트폰 사진과 분석 내용이 표시됩니다.

검색은 이름, 카테고리, 색상, 특징, 보관 위치를 대상으로 동작합니다.

## 2. Google Apps Script 만들기

사진 조회만 할 때는 Apps Script가 필요하지 않습니다. 웹사이트에서 새 사진까지 등록하려면 다음 설정이 필요합니다.

1. [Google Apps Script](https://script.google.com/)에서 새 프로젝트를 만듭니다.
2. 기본 `Code.gs`를 저장소의 `google-apps-script/Code.gs` 내용으로 교체합니다.
3. 프로젝트 설정에서 `appsscript.json` 표시를 켜고 저장소의 같은 파일 내용으로 교체합니다.
4. 프로젝트 이름을 `다시, 여기 API`로 지정합니다.

## 3. OpenAI 키 설정

Apps Script의 **프로젝트 설정 → 스크립트 속성**에 다음 값을 추가합니다.

| 속성 | 값 |
|---|---|
| `OPENAI_API_KEY` | OpenAI Platform API 키 |
| `OPENAI_MODEL` | 선택 사항, 기본값 `gpt-5.6-luna` |
| `SPREADSHEET_ID` | 선택 사항, 코드에 현재 DB가 기본값으로 설정됨 |
| `SHEET_GID` | 선택 사항, 기본값 `0` |

API 키는 GitHub 파일에 넣지 않습니다.

## 4. 기존 Sheet 연결 승인

Apps Script 함수 목록에서 `setupProject`를 선택해 한 번 실행하고 Google Sheets 접근 권한을 승인합니다.

이 함수는 기존 데이터를 삭제하거나 열 구조를 바꾸지 않습니다. 현재 DB 접근 가능 여부와 행 개수만 확인합니다.

## 5. 웹 앱 배포

1. **배포 → 새 배포 → 웹 앱**을 선택합니다.
2. 실행 사용자는 **나**로 설정합니다.
3. 액세스 사용자는 **모든 사용자**로 설정합니다.
4. 배포 후 `/exec`로 끝나는 URL을 복사합니다.

다음 주소를 브라우저에서 열어 확인합니다.

```text
Apps_Script_URL?action=health
```

`{"ok":true,...}`가 나오면 연결된 것입니다.

## 6. 사진 등록 기능 연결

`config.js`의 `API_URL`에 배포 주소를 입력합니다.

```js
window.APP_CONFIG = {
  SHEET_ID: "1CTQwF0AhBEgA42sPALIjYo8Hex8q-sX2DAOEDmvLZ7Q",
  SHEET_GID: "0",
  API_URL: "https://script.google.com/macros/s/배포_ID/exec",
  DEMO_MODE: false,
};
```

이후 **습득물 등록**에서 사진과 위치를 입력하면 다음 과정이 실행됩니다.

```text
Base64 변환 → OpenAI 사진 분석 → A/B/C 3열 새 행 추가 → 웹사이트 새로고침
```

## 7. GitHub Pages 배포

```bash
git add .
git commit -m "feat: connect Google Sheet database"
git push -u origin main
```

GitHub 저장소의 **Settings → Pages**에서 다음을 설정합니다.

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

## 공개 설정 주의사항

- 현재 Sheet는 공개 조회가 가능해야 GitHub Pages에서 직접 읽을 수 있습니다.
- Base64는 암호화가 아니므로 공개 Sheet의 사진은 누구나 복원할 수 있습니다.
- 등록 API도 공개되므로 반복 요청으로 OpenAI 비용이 발생할 수 있습니다.
- OpenAI API 키는 반드시 Apps Script의 Script Properties에만 저장합니다.
- 프런트엔드와 백엔드는 이미지 크기를 5MB 이하로 제한합니다.
