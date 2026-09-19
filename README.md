# 다시, 여기 — Smart Lost & Found

사진을 AI로 분석해 습득물을 자동 등록하고, 사용자가 특징을 검색해 보관 위치를 찾는 웹사이트입니다.

## 시스템 구조

```text
GitHub Pages (index.html, CSS, JavaScript)
                  ↓ HTTPS
Google Apps Script Web App
        ├── Google Sheets: 물건 정보
        ├── Google Drive: 물건 사진
        └── OpenAI Responses API: 사진 분석
```

OpenAI API 키와 Google 자격 증명은 GitHub에 올리지 않습니다. 비밀 값은 Apps Script의 Script Properties에만 저장합니다.

## 프로젝트 파일

```text
.
├── index.html                 # 검색·상세·공개 등록 화면
├── styles.css                 # 전체 디자인과 반응형 스타일
├── app.js                     # 검색, 렌더링, API 통신
├── config.js                  # Apps Script 공개 웹 앱 주소
├── .nojekyll                  # GitHub Pages 정적 배포 설정
└── google-apps-script/
    ├── Code.gs                # Sheets, Drive, OpenAI 백엔드
    └── appsscript.json        # Apps Script 설정
```

## 1. 웹사이트 먼저 확인하기

API 연결 전에는 `config.js`의 `DEMO_MODE`가 `true`이므로 예시 데이터가 표시됩니다.

VS Code에서 폴더를 열고 `index.html`을 브라우저에서 열거나 다음 명령으로 로컬 서버를 실행합니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## 2. Google Apps Script 만들기

1. [Google Apps Script](https://script.google.com/)에서 **새 프로젝트**를 만듭니다.
2. 기본 `Code.gs` 내용을 지우고 이 저장소의 `google-apps-script/Code.gs` 전체를 붙여 넣습니다.
3. 프로젝트 설정에서 `appsscript.json` 표시를 켠 뒤, 저장소의 같은 파일 내용으로 교체합니다.
4. 프로젝트 이름을 `다시, 여기 API`로 변경합니다.

## 3. 비밀 값 설정하기

Apps Script 왼쪽의 **프로젝트 설정 → 스크립트 속성**에 다음 값을 추가합니다.

| 속성 | 값 |
|---|---|
| `OPENAI_API_KEY` | OpenAI Platform에서 발급한 API 키 |
| `OPENAI_MODEL` | 선택 사항. 기본값은 `gpt-5.6-luna` |

API 키는 `config.js`나 GitHub 파일에 넣지 않습니다.

## 4. Sheets와 Drive 준비하기

Apps Script 편집기 상단 함수 목록에서 `setupProject`를 선택하고 **실행**합니다.

첫 실행 시 Google 권한 요청을 승인하면 다음 항목이 자동 생성됩니다.

- `다시, 여기 - 분실물 DB` 스프레드시트
- `lost_items` 시트와 컬럼 제목
- `다시, 여기 - 분실물 사진` Google Drive 폴더
- `SPREADSHEET_ID`, `IMAGE_FOLDER_ID` 스크립트 속성

실행 로그에 생성된 스프레드시트와 폴더 주소가 표시됩니다.

> 공개 웹사이트에 사진을 표시하려면 Drive 파일의 링크 공유가 허용되어야 합니다. 학교나 회사 Google Workspace에서 외부 공유가 차단되어 있다면 개인 Google 계정을 사용하거나 별도 이미지 저장소가 필요합니다.

## 5. Apps Script를 웹 앱으로 배포하기

1. Apps Script 오른쪽 위 **배포 → 새 배포**를 누릅니다.
2. 유형은 **웹 앱**을 선택합니다.
3. 실행 사용자는 **나**를 선택합니다.
4. 액세스 사용자는 **모든 사용자**를 선택합니다.
5. 배포 후 `/exec`로 끝나는 웹 앱 URL을 복사합니다.

브라우저에서 다음 주소를 열어 연결 상태를 확인합니다.

```text
복사한_URL?action=health
```

`{"ok":true,...}`가 표시되면 성공입니다.

## 6. 프런트엔드 연결하기

`config.js`를 다음과 같이 수정합니다.

```js
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/배포_ID/exec",
  DEMO_MODE: false,
};
```

로컬 페이지를 새로고침하면 Google Sheets의 실제 데이터가 표시됩니다. **습득물 등록**에서 누구나 사진과 위치를 입력하면 다음 과정이 실행됩니다.

```text
사진 업로드 → OpenAI 이미지 분석 → Drive 사진 저장 → Sheets 정보 저장 → 웹사이트 표시
```

## 7. GitHub Pages 배포하기

GitHub에서 빈 저장소를 만든 뒤 이 폴더의 파일을 올립니다. 저장소의 **Settings → Pages**에서 다음을 선택합니다.

- Source: `Deploy from a branch`
- Branch: `main`
- Folder: `/ (root)`

배포가 끝나면 `https://사용자명.github.io/저장소명/`에서 접속할 수 있습니다.

## 스프레드시트 컬럼

| 컬럼 | 내용 |
|---|---|
| `id` | 고유 ID |
| `name` | 물건 이름 |
| `category` | 물건 종류 |
| `color` | 색상 |
| `features` | 일반 특징 JSON 배열 |
| `distinctive_features` | 구별되는 특징 JSON 배열 |
| `location` | 보관 위치 |
| `image_url` | 공개 이미지 주소 |
| `drive_file_id` | Drive 파일 ID |
| `created_at` | 등록 시각 |
| `status` | `보관 중` 또는 `반환 완료` |
| `confidence` | AI 분석 확신도 |
| `note` | 등록 참고 사항 |

## 보안 주의사항

- `OPENAI_API_KEY`는 Script Properties에만 저장합니다.
- 등록 기능이 공개되어 있으므로 누구나 OpenAI API 호출을 발생시킬 수 있습니다.
- OpenAI API 사용량 제한과 결제 한도를 설정하는 것을 권장합니다.
- Apps Script를 수정한 뒤에는 **배포 관리 → 새 버전**으로 다시 배포해야 변경 사항이 반영됩니다.

## OpenAI API

백엔드는 OpenAI Responses API에 사진을 Base64 데이터 URL로 전달하고, Structured Outputs의 JSON Schema로 아래 값을 받습니다.

```json
{
  "name": "무선 마우스",
  "category": "컴퓨터 주변기기",
  "color": "검정",
  "features": ["스크롤 휠", "좌우 버튼"],
  "distinctive_features": ["표면의 작은 흠집"],
  "confidence": 0.92
}
```
# AI-
