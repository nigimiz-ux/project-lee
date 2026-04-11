// ============================================================
// Project LEE — Google Drive Gallery Module
// drive-gallery.js
// 
// 사용법:
// 1. index.html에 <script src="drive-gallery.js"></script> 추가
// 2. Google Cloud Console에서 OAuth 2.0 클라이언트 ID 발급
// 3. 아래 CONFIG의 CLIENT_ID, API_KEY 교체
// 4. 기존 Google Photos 메뉴 클릭 시 renderDriveGallery() 호출
// ============================================================

const DRIVE_CONFIG = {
  CLIENT_ID: '299405203142-8cdiq5unru0ocif4qti948hsmm2ge83h.apps.googleusercontent.com',
  API_KEY: 'AIzaSyBLbhkWaq44NBPTHQKZyCwaEBOWYjNlcWU',
  DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  // drive.file = 이 앱이 만든 파일만 접근 (보안상 권장)
  // drive = 전체 드라이브 접근 (모든 사진 보기 원할 경우)
};

// 앱 전용 드라이브 폴더명
const APP_FOLDER_NAME = 'ProjectLEE_Gallery';

let driveState = {
  gapiReady: false,
  gisReady: false,
  tokenClient: null,
  tokenExpiresAt: 0,
  consentGranted: false,
  currentFolderId: null,
  rootFolderId: null,
  breadcrumb: [], // [{id, name}]
  files: [],
  lightboxIndex: null,
};

let driveSelection = new Set();
let draggedDriveFileId = null;
let driveLastSelectionIndex = null;
let driveDeleteMode = 'trash';
let driveShiftDragActive = false;
let driveShiftDragAnchorIndex = null;
let driveShiftDragChecked = true;
let driveHistoryListenerAttached = false;

// ============================================================
// 1. GAPI + GIS 초기화
// ============================================================
let driveInitPromise = null;

async function loadDriveGallery() {
  if (!driveInitPromise) {
    driveInitPromise = initDriveApis();
  }

  try {
    await driveInitPromise;
    renderDriveGallery();
  } catch (e) {
    console.error('[DriveGallery] 초기화 실패', e);
    showDriveToast('초기화 오류');
  }
}

async function initDriveApis() {
  await Promise.all([
    loadScriptOnce('https://apis.google.com/js/api.js', 'drive-gapi-script'),
    loadScriptOnce('https://accounts.google.com/gsi/client', 'drive-gis-script'),
  ]);

  await new Promise((resolve, reject) => {
    gapi.load('client', {
      callback: resolve,
      onerror: () => reject(new Error('gapi client load failed')),
    });
  });

  await gapi.client.init({
    apiKey: DRIVE_CONFIG.API_KEY,
    discoveryDocs: DRIVE_CONFIG.DISCOVERY_DOCS,
  });

  driveState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CONFIG.CLIENT_ID,
    scope: DRIVE_CONFIG.SCOPES,
    callback: () => {},
  });

  driveState.gapiReady = true;
  driveState.gisReady = true;
}

function loadScriptOnce(src, id) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`script load failed: ${src}`));
    document.head.appendChild(script);
  });
}

// ============================================================
// 2. 메인 렌더러 — 기존 앱 content 영역에 삽입
// ============================================================
function renderDriveGallery() {
  const container = document.getElementById('contentArea')
    || document.getElementById('main-content') 
    || document.querySelector('.content-area')
    || document.querySelector('main')
    || document.getElementById('app-content');

  if (!container) {
    console.error('[DriveGallery] 콘텐츠 영역을 찾을 수 없습니다. 컨테이너 ID를 확인하세요.');
    return;
  }

  container.innerHTML = getDriveGalleryHTML();
  attachDriveGalleryStyles();
  ensureDriveHistoryListener();

  if (!driveState.gapiReady || !driveState.gisReady) {
    loadDriveGallery();
    return;
  }

  if (hasValidDriveToken()) {
    initDriveSession();
    return;
  }

  trySilentDriveSignIn();
}

// ============================================================
// 3. HTML 템플릿 (앱 기존 다크 테마에 맞춤)
// ============================================================
function getDriveGalleryHTML() {
  return `
    <div id="drive-gallery-root">
      <!-- 헤더 -->
      <div class="dg-header">
        <div class="dg-title-row">
          <h2 class="dg-title">It's only JUN's matters</h2>
        </div>
        <div class="dg-toolbar" id="dg-toolbar" style="display:none">
          <div class="dg-toolbar-left">
            <button type="button" class="dg-btn dg-btn-up" id="dg-parent-folder-btn" style="display:none" onclick="goToParentDriveFolder()">
              ⬆ 상위 폴더로
            </button>
            <div class="dg-breadcrumb" id="dg-breadcrumb"></div>
          </div>
          <div class="dg-actions">
            <button class="dg-btn dg-btn-primary" id="dg-upload-btn" onclick="triggerDriveUpload()">
              ↑ 업로드
            </button>
            <button class="dg-btn" id="dg-new-folder-btn" onclick="createDriveFolder()">
              + 폴더
            </button>
            <button class="dg-btn" id="dg-select-all-btn" onclick="toggleSelectAllDriveFiles()">
              전체선택
            </button>
            <button class="dg-btn" id="dg-delete-mode-btn" onclick="toggleDriveDeleteMode()">
              삭제모드: 휴지통
            </button>
            <button class="dg-btn dg-btn-danger" id="dg-delete-selected-btn" onclick="deleteSelectedDriveFiles()" disabled>
              선택삭제(0)
            </button>
            <div class="dg-view-toggle">
              <button class="dg-view-btn active" id="dg-grid-btn" onclick="setDriveView('grid')">⊞</button>
              <button class="dg-view-btn" id="dg-list-btn" onclick="setDriveView('list')">≡</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 업로드 드롭존 (숨김 상태, 업로드 중 표시) -->
      <div id="dg-dropzone" class="dg-dropzone" style="display:none"
        ondragover="event.preventDefault(); this.classList.add('dg-drop-active')"
        ondragleave="this.classList.remove('dg-drop-active')"
        ondrop="handleDriveDrop(event)">
        <span class="dg-drop-icon">⬇</span>
        <p>드래그하여 업로드</p>
      </div>

      <!-- 숨김 파일 input -->
      <input type="file" id="dg-file-input" multiple
        style="display:none" onchange="handleDriveFileSelect(event)" />

      <!-- 콘텐츠 영역 -->
      <div id="dg-content" class="dg-content">
        <div class="dg-loading">
          <div class="dg-spinner"></div>
          <p>초기화 중...</p>
        </div>
      </div>

      <!-- 라이트박스 -->
      <div id="dg-lightbox" class="dg-lightbox" style="display:none" onclick="closeDriveLightbox()">
        <button class="dg-lb-close" onclick="closeDriveLightbox()">✕</button>
        <button class="dg-lb-prev" onclick="event.stopPropagation(); moveDriveLightbox(-1)">‹</button>
        <button class="dg-lb-next" onclick="event.stopPropagation(); moveDriveLightbox(1)">›</button>
        <div class="dg-lb-inner" onclick="event.stopPropagation()">
          <img id="dg-lb-img" src="" alt="" />
          <video id="dg-lb-video" controls style="display:none"></video>
          <div class="dg-lb-info">
            <span id="dg-lb-name"></span>
            <span id="dg-lb-size"></span>
          </div>
        </div>
      </div>

      <!-- 업로드 진행 토스트 -->
      <div id="dg-toast" class="dg-toast" style="display:none"></div>
    </div>
  `;
}

// ============================================================
// 4. CSS 주입 (앱 기존 테마에 맞는 다크 스타일)
// ============================================================
function attachDriveGalleryStyles() {
  if (document.getElementById('drive-gallery-style')) return;
  const style = document.createElement('style');
  style.id = 'drive-gallery-style';
  style.textContent = `
    #drive-gallery-root {
      font-family: 'Courier New', monospace;
      color: #c8d6e5;
      padding: 0 8px;
      max-width: 1200px;
    }

    /* 헤더 */
    .dg-header { margin-bottom: 20px; }
    .dg-title-row {
      display: flex; align-items: center; justify-content: center;
      border-bottom: 1px solid #2a3a4a; padding-bottom: 12px; margin-bottom: 12px;
    }
    .dg-title {
      font-size: 14px; font-weight: bold; letter-spacing: 1px;
      color: #4fc3f7; margin: 0;
    }

    /* 툴바 */
    .dg-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      flex-wrap: wrap; gap: 8px;
    }
    .dg-toolbar-left {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      flex: 1; min-width: 0;
    }
    .dg-btn-up {
      flex-shrink: 0;
      border-color: #50e3c2 !important;
      color: #50e3c2 !important;
    }
    .dg-btn-up:hover {
      background: rgba(80, 227, 194, 0.12) !important;
      color: #7fffd4 !important;
    }
    .dg-breadcrumb {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; color: #7a9ab5;
    }
    .dg-bread-item {
      cursor: pointer; color: #4fc3f7; text-decoration: none;
    }
    .dg-bread-item:hover { text-decoration: underline; }
    .dg-bread-sep { color: #3a5a7a; }
    .dg-bread-current { color: #c8d6e5; cursor: default; }

    .dg-actions { display: flex; align-items: center; gap: 8px; }
    .dg-btn {
      font-family: 'Courier New', monospace; font-size: 11px;
      padding: 5px 12px; border-radius: 2px; cursor: pointer;
      border: 1px solid #2a4a6a; background: transparent;
      color: #7a9ab5; transition: all 0.2s; letter-spacing: 1px;
    }
    .dg-btn:hover { background: #1a2a3a; color: #4fc3f7; border-color: #4fc3f7; }
    .dg-btn-primary {
      background: #0d2137; border-color: #4fc3f7; color: #4fc3f7;
    }
    .dg-btn-primary:hover { background: #4fc3f7; color: #0a1929; }
    .dg-btn-danger { border-color: #e74c3c; color: #e74c3c; }
    .dg-btn-danger:hover { background: #e74c3c; color: white; }
    .dg-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      pointer-events: none;
    }

    .dg-view-toggle { display: flex; border: 1px solid #2a4a6a; border-radius: 2px; overflow: hidden; }
    .dg-view-btn {
      font-size: 13px; padding: 4px 10px; background: transparent;
      border: none; color: #7a9ab5; cursor: pointer; transition: all 0.2s;
    }
    .dg-view-btn.active { background: #1a2a3a; color: #4fc3f7; }

    /* 드롭존 */
    .dg-dropzone {
      border: 2px dashed #2a4a6a; border-radius: 4px;
      padding: 30px; text-align: center; margin-bottom: 16px;
      transition: all 0.2s; cursor: pointer;
    }
    .dg-drop-active { border-color: #4fc3f7; background: #0d2137; }
    .dg-drop-icon { font-size: 32px; color: #2a4a6a; display: block; margin-bottom: 8px; }

    /* 콘텐츠 */
    .dg-content { min-height: 200px; }
    .dg-loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 60px; color: #3a5a7a;
    }
    .dg-spinner {
      width: 24px; height: 24px; border: 2px solid #1a3a5a;
      border-top-color: #4fc3f7; border-radius: 50%;
      animation: dg-spin 0.8s linear infinite; margin-bottom: 12px;
    }
    @keyframes dg-spin { to { transform: rotate(360deg); } }

    .dg-empty {
      text-align: center; padding: 60px; color: #3a5a7a; font-size: 12px;
    }
    .dg-empty-icon { font-size: 40px; display: block; margin-bottom: 12px; }

    /* 로그인 */
    .dg-signin {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; padding: 60px; gap: 16px;
    }
    .dg-signin p { color: #7a9ab5; font-size: 12px; letter-spacing: 1px; text-align: center; }
    .dg-signin-btn {
      display: flex; align-items: center; gap: 10px;
      background: #0d2137; border: 1px solid #4fc3f7; color: #4fc3f7;
      font-family: 'Courier New', monospace; font-size: 12px;
      padding: 10px 24px; border-radius: 2px; cursor: pointer;
      letter-spacing: 2px; transition: all 0.2s;
    }
    .dg-signin-btn:hover { background: #4fc3f7; color: #0a1929; }

    /* 그리드 뷰 */
    .dg-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 8px;
    }
    .dg-cell {
      position: relative; background: #0d1f2e;
      border: 1px solid #1a3a5a; border-radius: 3px;
      overflow: hidden; cursor: pointer; transition: all 0.2s;
      aspect-ratio: 1;
    }
    .dg-cell:hover { border-color: #4fc3f7; transform: scale(1.02); }
    .dg-cell.selected {
      border-color: #4fc3f7;
      box-shadow: 0 0 0 1px #4fc3f7 inset;
    }
    .dg-cell.drop-target {
      border-color: #50e3c2;
      box-shadow: 0 0 0 2px #50e3c2 inset;
    }
    .dg-cell img, .dg-cell video {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }
    .dg-cell-overlay {
      position: absolute; bottom: 0; left: 0; right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      padding: 16px 6px 6px; opacity: 0; transition: opacity 0.2s;
    }
    .dg-cell:hover .dg-cell-overlay { opacity: 1; }
    .dg-cell-name {
      font-size: 9px; color: #c8d6e5; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; display: block;
    }
    .dg-cell-actions {
      position: absolute; top: 4px; right: 4px;
      display: flex; gap: 3px; opacity: 0; transition: opacity 0.2s;
    }
    .dg-cell:hover .dg-cell-actions { opacity: 1; }
    .dg-cell-check {
      position: absolute; top: 4px; left: 4px;
      width: 16px; height: 16px; z-index: 2; cursor: pointer;
      accent-color: #4fc3f7;
    }
    .dg-cell-btn {
      width: 20px; height: 20px; font-size: 9px;
      background: rgba(0,0,0,0.7); border: 1px solid #2a4a6a;
      color: #c8d6e5; border-radius: 2px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .dg-cell-btn:hover { background: #e74c3c; border-color: #e74c3c; }

    /* 폴더 셀 */
    .dg-folder-cell {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 6px; padding: 12px;
    }
    .dg-folder-icon { font-size: 36px; }
    .dg-folder-name {
      font-size: 10px; text-align: center; color: #c8d6e5;
      word-break: break-all; line-height: 1.3;
    }

    /* 비디오 셀 */
    .dg-video-cell {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 6px; background: #0a1929;
    }
    .dg-video-icon { font-size: 30px; color: #4fc3f7; }
    .dg-video-name {
      font-size: 9px; text-align: center; color: #7a9ab5;
      padding: 0 4px; word-break: break-all;
    }

    /* 일반 문서 셀 (PDF 등) */
    .dg-doc-cell {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 6px; background: #0a1929;
      width: 100%; height: 100%;
    }
    .dg-doc-icon { font-size: 36px; line-height: 1; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); }
    .dg-doc-name {
      font-size: 9px; text-align: center; color: #7a9ab5;
      padding: 0 6px; word-break: break-all; line-height: 1.25;
    }

    /* 리스트 뷰 */
    .dg-list { display: flex; flex-direction: column; gap: 2px; }
    .dg-list-row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; background: #0d1f2e;
      border: 1px solid #1a3a5a; border-radius: 2px;
      cursor: pointer; transition: all 0.2s;
    }
    .dg-list-row:hover { border-color: #4fc3f7; background: #0d2137; }
    .dg-list-row.selected {
      border-color: #4fc3f7;
      background: #0d2137;
    }
    .dg-list-row.drop-target {
      border-color: #50e3c2;
      background: #103244;
    }
    .dg-list-icon { font-size: 18px; flex-shrink: 0; width: 36px; height: 36px; text-align: center; display: flex; align-items: center; justify-content: center; background: #0a1929; border-radius: 2px; border: 1px solid #1a3a5a; }
    .dg-list-check { accent-color: #4fc3f7; }
    .dg-list-thumb {
      width: 36px; height: 36px; object-fit: cover;
      border-radius: 2px; flex-shrink: 0;
    }
    .dg-list-name { flex: 1; font-size: 11px; color: #c8d6e5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dg-list-size { font-size: 10px; color: #3a5a7a; flex-shrink: 0; width: 70px; text-align: right; }
    .dg-list-date { font-size: 10px; color: #3a5a7a; flex-shrink: 0; width: 90px; text-align: right; }
    .dg-list-del {
      font-size: 10px; padding: 3px 8px;
      background: transparent; border: 1px solid #3a2a2a;
      color: #7a4a4a; border-radius: 2px; cursor: pointer;
      transition: all 0.2s; flex-shrink: 0;
    }
    .dg-list-del:hover { background: #e74c3c; border-color: #e74c3c; color: white; }

    /* 라이트박스 */
    .dg-lightbox {
      position: fixed; inset: 0; z-index: 9999;
      background: rgba(0,0,0,0.92);
      display: flex; align-items: center; justify-content: center;
    }
    .dg-lb-inner {
      max-width: 90vw; max-height: 90vh;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
    }
    .dg-lb-inner img, .dg-lb-inner video {
      max-width: 85vw; max-height: 80vh; border-radius: 2px;
      border: 1px solid #2a4a6a;
    }
    .dg-lb-info {
      display: flex; gap: 16px; font-size: 11px; color: #7a9ab5;
    }
    .dg-lb-close {
      position: fixed; top: 20px; right: 24px;
      font-size: 20px; background: none; border: none;
      color: #7a9ab5; cursor: pointer; z-index: 10000;
    }
    .dg-lb-close:hover { color: white; }
    .dg-lb-prev, .dg-lb-next {
      position: fixed; top: 50%; transform: translateY(-50%);
      font-size: 36px; background: none; border: none;
      color: #4a6a8a; cursor: pointer; padding: 10px; z-index: 10000;
    }
    .dg-lb-prev { left: 10px; }
    .dg-lb-next { right: 10px; }
    .dg-lb-prev:hover, .dg-lb-next:hover { color: #4fc3f7; }

    /* 토스트 */
    .dg-toast {
      position: fixed; bottom: 24px; right: 24px;
      background: #0d2137; border: 1px solid #4fc3f7; color: #4fc3f7;
      font-family: 'Courier New', monospace; font-size: 11px;
      padding: 10px 18px; border-radius: 2px; z-index: 10001;
      animation: dg-fade-in 0.3s ease;
    }
    @keyframes dg-fade-in { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: none; } }

    /* 모바일 반응형 */
    @media (max-width: 600px) {
      .dg-grid { grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 5px; }
      .dg-toolbar { flex-direction: column; align-items: flex-start; }
      .dg-list-date, .dg-list-size { display: none; }
      .dg-lb-prev { left: 2px; }
      .dg-lb-next { right: 2px; }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// 5. 로그인 UI
// ============================================================
function showDriveSignIn() {
  document.getElementById('dg-content').innerHTML = `
    <div class="dg-signin">
      <p>▸ GOOGLE DRIVE 연동이 필요합니다</p>
      <button class="dg-signin-btn" onclick="signInDrive()">
        <img src="https://www.google.com/images/branding/product/2x/googleg_32dp.png" 
             style="width:16px;height:16px;" alt="G" />
        GOOGLE 로그인
      </button>
    </div>
  `;
}

async function signInDrive() {
  try {
    await ensureDriveAccessToken(true);
    initDriveSession();
  } catch (e) {
    console.error('[DriveGallery] 로그인 오류', e);
    showDriveToast('로그인 취소됨');
  }
}

async function trySilentDriveSignIn() {
  setDriveLoading(true, '세션 복구 중...');
  try {
    await ensureDriveAccessToken(false, { silent: true });
    await initDriveSession();
  } catch (e) {
    console.warn('[DriveGallery] silent login failed', e);
    showDriveSignIn();
  }
}

function hasValidDriveToken() {
  const token = gapi.client.getToken()?.access_token;
  if (!token) return false;
  if (!driveState.tokenExpiresAt) return true;
  return Date.now() < driveState.tokenExpiresAt - 30000;
}

async function ensureDriveAccessToken(forceConsent, options = {}) {
  if (hasValidDriveToken()) return;
  if (!driveState.tokenClient) throw new Error('GIS token client not initialized');

  const promptMode = options.silent
    ? 'none'
    : (forceConsent || !driveState.consentGranted ? 'consent' : '');

  const tokenResponse = await new Promise((resolve, reject) => {
    driveState.tokenClient.callback = (resp) => {
      if (resp?.error) {
        reject(resp);
        return;
      }
      resolve(resp);
    };
    const requestOptions = promptMode ? { prompt: promptMode } : {};
    driveState.tokenClient.requestAccessToken(requestOptions);
  });

  gapi.client.setToken({ access_token: tokenResponse.access_token });
  driveState.tokenExpiresAt = Date.now() + ((tokenResponse.expires_in || 3600) * 1000);
  driveState.consentGranted = true;
}

// ============================================================
// 6. 드라이브 세션 초기화 — 앱 전용 폴더 확보
// ============================================================
async function initDriveSession() {
  document.getElementById('dg-toolbar').style.display = 'flex';
  setDriveLoading(true);

  try {
    await ensureDriveAccessToken(false);
    // 앱 전용 폴더 찾거나 생성
    let res = await gapi.client.drive.files.list({
      q: `name='${APP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    let folderId;
    if (res.result.files.length > 0) {
      folderId = res.result.files[0].id;
    } else {
      // 없으면 생성
      let created = await gapi.client.drive.files.create({
        resource: {
          name: APP_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = created.result.id;
    }

    driveState.rootFolderId = folderId;
    driveState.currentFolderId = folderId;
    driveState.breadcrumb = [{ id: folderId, name: 'Gallery' }];

    replaceDriveGalleryHistory();
    await loadDriveFiles(folderId);
  } catch (e) {
    console.error('[DriveGallery]', e);
    showDriveToast('드라이브 연결 오류');
    setDriveLoading(false);
  }
}

// ============================================================
// 7. 파일 목록 로드
// ============================================================
async function loadDriveFiles(folderId) {
  setDriveLoading(true);
  try {
    await ensureDriveAccessToken(false);
    const res = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, size, createdTime, thumbnailLink, webContentLink, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 100,
    });

    driveState.files = res.result.files || [];
    driveState.currentFolderId = folderId;
    updateDriveBreadcrumb();
    renderDriveFiles();
  } catch (e) {
    console.error('[DriveGallery]', e);
    showDriveToast('파일 로드 오류');
  }
  setDriveLoading(false);
}

// ============================================================
// 8. 파일 렌더링
// ============================================================
let currentView = 'grid';

function isDriveImageFile(file) {
  return !!(file.mimeType && file.mimeType.startsWith('image/'));
}

function isDriveVideoFile(file) {
  return !!(file.mimeType && file.mimeType.startsWith('video/'));
}

function isDriveLightboxPreviewable(file) {
  return isDriveImageFile(file) || isDriveVideoFile(file);
}

function getDriveFileIcon(mime) {
  const m = mime || '';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m === 'application/pdf') return '📕';
  if (m.includes('spreadsheet') || m.includes('excel')) return '📊';
  if (m.includes('presentation') || m.includes('powerpoint')) return '📽';
  if (m.includes('word') || m === 'application/msword') return '📝';
  if (m.includes('zip') || m.includes('compressed') || m === 'application/x-zip-compressed') return '🗜';
  return '📄';
}

function getDriveNonFolderFiles() {
  return driveState.files.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
}

function getDrivePreviewableMediaFiles() {
  return getDriveNonFolderFiles().filter(isDriveLightboxPreviewable);
}

function openDriveExternalFile(file) {
  if (!file) return;
  const url = file.webViewLink || file.webContentLink;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
  else showDriveToast('열 수 있는 링크가 없습니다');
}

function openDriveItemByFile(file) {
  if (!file) return;
  if (isDriveLightboxPreviewable(file)) {
    const list = getDrivePreviewableMediaFiles();
    const idx = list.findIndex((f) => f.id === file.id);
    if (idx >= 0) openDriveLightbox(idx);
  } else {
    openDriveExternalFile(file);
  }
}

function appendDriveCellChrome(div, file) {
  div.insertAdjacentHTML(
    'beforeend',
    `
    <input class="dg-cell-check" type="checkbox" ${driveSelection.has(file.id) ? 'checked' : ''}
      onmousedown="event.stopPropagation(); startShiftDragSelection(event, '${file.id}', this.checked)"
      onclick="event.stopPropagation(); handleDriveSelectionChange(event, '${file.id}', this.checked)" />
    <div class="dg-cell-overlay">
      <span class="dg-cell-name">${escHtml(file.name)}</span>
    </div>
    <div class="dg-cell-actions">
      <button class="dg-cell-btn" title="삭제"
        onclick="event.stopPropagation(); deleteDriveFile('${file.id}', '${escHtml(file.name)}')">✕</button>
    </div>
  `
  );
}

function setDriveView(view) {
  currentView = view;
  document.getElementById('dg-grid-btn').classList.toggle('active', view === 'grid');
  document.getElementById('dg-list-btn').classList.toggle('active', view === 'list');
  renderDriveFiles();
}

function renderDriveFiles() {
  const files = driveState.files;
  const content = document.getElementById('dg-content');
  cleanupDriveSelection();
  updateDriveSelectionUI();

  if (files.length === 0) {
    content.innerHTML = `
      <div class="dg-empty">
        <span class="dg-empty-icon">◫</span>
        <p>파일이 없습니다</p>
        <p style="font-size:10px; margin-top:8px; color:#2a4a6a">↑ 업로드 버튼으로 파일을 추가하세요</p>
      </div>
    `;
    return;
  }

  const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const mediaFiles = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

  if (currentView === 'grid') {
    content.innerHTML = `<div class="dg-grid" id="dg-grid-container"></div>`;
    const grid = document.getElementById('dg-grid-container');

    folders.forEach(f => grid.appendChild(createFolderCell(f)));
    mediaFiles.forEach((f) => grid.appendChild(createMediaCell(f)));
  } else {
    content.innerHTML = `<div class="dg-list" id="dg-list-container"></div>`;
    const list = document.getElementById('dg-list-container');

    folders.forEach(f => list.appendChild(createListRow(f, true)));
    mediaFiles.forEach((f) => list.appendChild(createListRow(f, false)));
  }
}

function createFolderCell(file) {
  const div = document.createElement('div');
  div.className = `dg-cell dg-folder-cell ${driveSelection.has(file.id) ? 'selected' : ''}`;
  div.onclick = () => enterDriveFolder(file.id, file.name);
  div.onmouseenter = () => continueShiftDragSelection(file.id);
  div.ondragover = (e) => onDriveFolderDragOver(e, div);
  div.ondragleave = () => div.classList.remove('drop-target');
  div.ondrop = (e) => handleDriveFileDropToFolder(e, file.id, file.name, div);
  div.innerHTML = `
    <input class="dg-cell-check" type="checkbox" ${driveSelection.has(file.id) ? 'checked' : ''}
      onmousedown="event.stopPropagation(); startShiftDragSelection(event, '${file.id}', this.checked)"
      onclick="event.stopPropagation(); handleDriveSelectionChange(event, '${file.id}', this.checked)" />
    <span class="dg-folder-icon">📁</span>
    <span class="dg-folder-name">${escHtml(file.name)}</span>
  `;
  return div;
}

function createMediaCell(file) {
  const div = document.createElement('div');
  div.className = `dg-cell ${driveSelection.has(file.id) ? 'selected' : ''}`;
  div.onmouseenter = () => continueShiftDragSelection(file.id);
  div.draggable = true;
  div.ondragstart = () => handleDriveFileDragStart(file.id);
  div.ondragend = handleDriveFileDragEnd;

  const thumb = file.thumbnailLink;
  const isVideo = isDriveVideoFile(file);
  const isImage = isDriveImageFile(file);

  if (isVideo && !thumb) {
    div.innerHTML = `
      <div class="dg-video-cell" style="width:100%;height:100%">
        <span class="dg-video-icon">▶</span>
        <span class="dg-video-name">${escHtml(file.name)}</span>
      </div>
    `;
  } else if ((isImage || isVideo) && thumb) {
    const img = document.createElement('img');
    img.src = thumb;
    img.alt = file.name || '';
    img.loading = 'lazy';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    img.onerror = () => {
      const docWrap = document.createElement('div');
      docWrap.className = 'dg-doc-cell';
      docWrap.style.cssText = 'width:100%;height:100%';
      docWrap.innerHTML = `<span class="dg-doc-icon">${getDriveFileIcon(file.mimeType)}</span><span class="dg-doc-name">${escHtml(file.name)}</span>`;
      img.replaceWith(docWrap);
    };
    div.appendChild(img);
  } else {
    div.innerHTML = `
      <div class="dg-doc-cell" style="width:100%;height:100%">
        <span class="dg-doc-icon">${getDriveFileIcon(file.mimeType)}</span>
        <span class="dg-doc-name">${escHtml(file.name)}</span>
      </div>
    `;
  }

  appendDriveCellChrome(div, file);
  div.onclick = () => openDriveItemByFile(file);
  return div;
}

function createListRow(file, isFolder) {
  const div = document.createElement('div');
  div.className = `dg-list-row ${driveSelection.has(file.id) ? 'selected' : ''}`;
  div.onmouseenter = () => continueShiftDragSelection(file.id);

  const icon = isFolder ? '📁' : getDriveFileIcon(file.mimeType);
  const size = file.size ? formatBytes(parseInt(file.size)) : '—';
  const date = file.createdTime ? file.createdTime.substring(0, 10) : '';
  const thumb = file.thumbnailLink;
  const useThumb =
    !isFolder && thumb && (isDriveImageFile(file) || isDriveVideoFile(file));

  div.innerHTML = `
    <input class="dg-list-check" type="checkbox" ${driveSelection.has(file.id) ? 'checked' : ''}
      onmousedown="event.stopPropagation(); startShiftDragSelection(event, '${file.id}', this.checked)"
      onclick="event.stopPropagation(); handleDriveSelectionChange(event, '${file.id}', this.checked)" />
    ${
      useThumb
        ? `<img class="dg-list-thumb dg-list-thumb-img" src="${thumb}" alt="" loading="lazy" />`
        : `<span class="dg-list-icon">${icon}</span>`
    }
    <span class="dg-list-name">${escHtml(file.name)}</span>
    <span class="dg-list-size">${size}</span>
    <span class="dg-list-date">${date}</span>
    ${!isFolder ? `<button class="dg-list-del" 
      onclick="event.stopPropagation(); deleteDriveFile('${file.id}', '${escHtml(file.name)}')">삭제</button>` : ''}
  `;

  const thumbEl = div.querySelector('.dg-list-thumb-img');
  if (thumbEl) {
    thumbEl.addEventListener(
      'error',
      function onListThumbErr() {
        thumbEl.removeEventListener('error', onListThumbErr);
        const sp = document.createElement('span');
        sp.className = 'dg-list-icon';
        sp.textContent = getDriveFileIcon(file.mimeType);
        thumbEl.replaceWith(sp);
      },
      { once: true }
    );
  }

  if (isFolder) {
    div.onclick = () => enterDriveFolder(file.id, file.name);
    div.ondragover = (e) => onDriveFolderDragOver(e, div);
    div.ondragleave = () => div.classList.remove('drop-target');
    div.ondrop = (e) => handleDriveFileDropToFolder(e, file.id, file.name, div);
  } else {
    div.onclick = () => openDriveItemByFile(file);
    div.draggable = true;
    div.ondragstart = () => handleDriveFileDragStart(file.id);
    div.ondragend = handleDriveFileDragEnd;
  }

  return div;
}

function getDriveOrderedSelectableFiles() {
  const folders = driveState.files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const mediaFiles = driveState.files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  return [...folders, ...mediaFiles];
}

function cleanupDriveSelection() {
  const fileIds = new Set(getDriveOrderedSelectableFiles().map(f => f.id));
  driveSelection = new Set([...driveSelection].filter(id => fileIds.has(id)));
  if (driveLastSelectionIndex !== null) {
    const maxIdx = getDriveOrderedSelectableFiles().length - 1;
    if (driveLastSelectionIndex > maxIdx) driveLastSelectionIndex = null;
  }
}

function toggleDriveFileSelection(fileId, checked) {
  if (checked) driveSelection.add(fileId);
  else driveSelection.delete(fileId);
  updateDriveSelectionUI();
  renderDriveFiles();
}

function handleDriveSelectionChange(event, fileId, checked) {
  const ordered = getDriveOrderedSelectableFiles();
  const currentIndex = ordered.findIndex(f => f.id === fileId);
  if (currentIndex < 0) return;

  if (event && event.shiftKey && driveLastSelectionIndex !== null) {
    applyDriveSelectionRange(driveLastSelectionIndex, currentIndex, checked);
  } else {
    if (checked) driveSelection.add(fileId);
    else driveSelection.delete(fileId);
  }

  driveLastSelectionIndex = currentIndex;
  updateDriveSelectionUI();
  renderDriveFiles();
}

function applyDriveSelectionRange(startIndex, endIndex, checked) {
  const ordered = getDriveOrderedSelectableFiles();
  const [start, end] = endIndex > startIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  for (let i = start; i <= end; i++) {
    const targetId = ordered[i]?.id;
    if (!targetId) continue;
    if (checked) driveSelection.add(targetId);
    else driveSelection.delete(targetId);
  }
}

function startShiftDragSelection(event, fileId, checked) {
  if (!event.shiftKey || event.button !== 0) return;
  const ordered = getDriveOrderedSelectableFiles();
  const idx = ordered.findIndex(f => f.id === fileId);
  if (idx < 0) return;
  driveShiftDragActive = true;
  driveShiftDragAnchorIndex = driveLastSelectionIndex !== null ? driveLastSelectionIndex : idx;
  driveShiftDragChecked = checked;
}

function continueShiftDragSelection(fileId) {
  if (!driveShiftDragActive || driveShiftDragAnchorIndex === null) return;
  const ordered = getDriveOrderedSelectableFiles();
  const hoverIndex = ordered.findIndex(f => f.id === fileId);
  if (hoverIndex < 0) return;
  applyDriveSelectionRange(driveShiftDragAnchorIndex, hoverIndex, driveShiftDragChecked);
  driveLastSelectionIndex = hoverIndex;
  updateDriveSelectionUI();
  renderDriveFiles();
}

function stopShiftDragSelection() {
  driveShiftDragActive = false;
  driveShiftDragAnchorIndex = null;
}

function toggleSelectAllDriveFiles() {
  const selectableFiles = getDriveOrderedSelectableFiles();
  if (selectableFiles.length === 0) return;
  const allSelected = selectableFiles.every(f => driveSelection.has(f.id));
  if (allSelected) {
    driveSelection.clear();
    driveLastSelectionIndex = null;
  } else {
    selectableFiles.forEach(f => driveSelection.add(f.id));
  }
  updateDriveSelectionUI();
  renderDriveFiles();
}

function updateDriveSelectionUI() {
  const selectableFiles = getDriveOrderedSelectableFiles();
  const selectedCount = driveSelection.size;
  const deleteBtn = document.getElementById('dg-delete-selected-btn');
  const selectAllBtn = document.getElementById('dg-select-all-btn');
  const deleteModeBtn = document.getElementById('dg-delete-mode-btn');
  if (deleteBtn) {
    deleteBtn.disabled = selectedCount === 0;
    deleteBtn.textContent = `선택삭제(${selectedCount})`;
  }
  if (selectAllBtn) {
    const allSelected = selectableFiles.length > 0 && selectableFiles.every(f => driveSelection.has(f.id));
    selectAllBtn.textContent = allSelected ? '선택해제' : '전체선택';
  }
  if (deleteModeBtn) {
    deleteModeBtn.textContent = `삭제모드: ${driveDeleteMode === 'trash' ? '휴지통' : '영구삭제'}`;
  }
}

// ============================================================
// 9. 폴더 탐색 & History API (뒤로가기 / PWA 물리 버튼)
// ============================================================
function cloneDriveBreadcrumb() {
  return driveState.breadcrumb.map((b) => ({ id: b.id, name: b.name }));
}

function driveGalleryHash(folderId) {
  return `drive:${folderId}`;
}

function ensureDriveHistoryListener() {
  if (driveHistoryListenerAttached) return;
  driveHistoryListenerAttached = true;
  window.addEventListener('popstate', onDriveGalleryPopState);
}

function replaceDriveGalleryHistory() {
  ensureDriveHistoryListener();
  const id = driveState.currentFolderId || driveState.rootFolderId;
  if (!id) return;
  const url = new URL(window.location.href);
  url.hash = driveGalleryHash(id);
  history.replaceState(
    {
      driveGallery: true,
      breadcrumb: cloneDriveBreadcrumb(),
      folderId: id,
    },
    '',
    url.toString()
  );
}

function pushDriveFolderHistory() {
  ensureDriveHistoryListener();
  const last = driveState.breadcrumb[driveState.breadcrumb.length - 1];
  if (!last?.id) return;
  const url = new URL(window.location.href);
  url.hash = driveGalleryHash(last.id);
  history.pushState(
    {
      driveGallery: true,
      breadcrumb: cloneDriveBreadcrumb(),
      folderId: last.id,
    },
    '',
    url.toString()
  );
}

function onDriveGalleryPopState(event) {
  const root = document.getElementById('drive-gallery-root');
  if (!root) return;
  const st = event.state;
  if (st && st.driveGallery && Array.isArray(st.breadcrumb) && st.breadcrumb.length) {
    driveState.breadcrumb = st.breadcrumb.map((b) => ({
      id: b.id,
      name: b.name,
    }));
    const fid = st.folderId || st.breadcrumb[st.breadcrumb.length - 1].id;
    loadDriveFiles(fid, { fromHistory: true }).catch((e) => console.error('[DriveGallery] popstate', e));
  }
}

function goToParentDriveFolder() {
  if (driveState.breadcrumb.length <= 1) return;
  history.back();
}

function enterDriveFolder(id, name) {
  driveState.breadcrumb.push({ id, name });
  pushDriveFolderHistory();
  loadDriveFiles(id);
}

function updateDriveBreadcrumb() {
  const bc = document.getElementById('dg-breadcrumb');
  bc.innerHTML = driveState.breadcrumb.map((item, i) => {
    const isLast = i === driveState.breadcrumb.length - 1;
    if (isLast) return `<span class="dg-bread-current">${escHtml(item.name)}</span>`;
    return `<span class="dg-bread-item" onclick="navigateDriveBreadcrumb(${i})">${escHtml(item.name)}</span>
            <span class="dg-bread-sep"> / </span>`;
  }).join('');

  const parentBtn = document.getElementById('dg-parent-folder-btn');
  if (parentBtn) {
    parentBtn.style.display = driveState.breadcrumb.length > 1 ? 'inline-flex' : 'none';
  }
}

function navigateDriveBreadcrumb(index) {
  driveState.breadcrumb = driveState.breadcrumb.slice(0, index + 1);
  pushDriveFolderHistory();
  const target = driveState.breadcrumb[index];
  loadDriveFiles(target.id);
}

function handleDriveFileDragStart(fileId) {
  draggedDriveFileId = fileId;
}

function handleDriveFileDragEnd() {
  draggedDriveFileId = null;
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
}

function onDriveFolderDragOver(event, targetEl) {
  if (!draggedDriveFileId) return;
  event.preventDefault();
  targetEl.classList.add('drop-target');
}

async function handleDriveFileDropToFolder(event, folderId, folderName, targetEl) {
  event.preventDefault();
  targetEl.classList.remove('drop-target');
  if (!draggedDriveFileId) return;
  const fileId = draggedDriveFileId;
  draggedDriveFileId = null;
  if (fileId === folderId) return;

  try {
    await ensureDriveAccessToken(false);
    const meta = await gapi.client.drive.files.get({
      fileId,
      fields: 'id, parents, name',
    });
    const parents = meta.result.parents || [];
    if (parents.includes(folderId)) {
      showDriveToast('이미 해당 폴더에 있습니다');
      setTimeout(hideDriveToast, 1600);
      return;
    }
    await gapi.client.drive.files.update({
      fileId,
      addParents: folderId,
      removeParents: parents.join(','),
      fields: 'id, parents',
    });
    driveSelection.delete(fileId);
    await loadDriveFiles(driveState.currentFolderId);
    showDriveToast(`✓ "${folderName}" 폴더로 이동 완료`);
    setTimeout(hideDriveToast, 2000);
  } catch (e) {
    console.error('[DriveGallery] 파일 이동 오류', e);
    showDriveToast('폴더 이동 오류');
  }
}

// ============================================================
// 10. 파일 업로드
// ============================================================
function triggerDriveUpload() {
  document.getElementById('dg-file-input').click();
}

async function handleDriveFileSelect(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  await uploadDriveFiles(files);
  event.target.value = ''; // reset
}

function handleDriveDrop(event) {
  event.preventDefault();
  document.getElementById('dg-dropzone').classList.remove('dg-drop-active');
  const files = Array.from(event.dataTransfer.files);
  if (files.length) uploadDriveFiles(files);
}

async function uploadDriveFiles(files) {
  const total = files.length;
  showDriveToast(`0 / ${total} 업로드 중...`);
  await ensureDriveAccessToken(false);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    showDriveToast(`${i + 1} / ${total} — ${file.name}`);
    try {
      await uploadSingleDriveFile(file);
    } catch (e) {
      console.error('[DriveGallery] 업로드 오류:', e);
      showDriveToast(`오류: ${file.name}`);
      await sleep(1500);
    }
  }

  showDriveToast(`✓ ${total}개 업로드 완료`);
  setTimeout(() => hideDriveToast(), 2500);
  await loadDriveFiles(driveState.currentFolderId);
}

function uploadSingleDriveFile(file) {
  return new Promise((resolve, reject) => {
    const metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      parents: [driveState.currentFolderId],
    };

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    const token = gapi.client.getToken()?.access_token;
    if (!token) {
      reject('missing access token');
      return;
    }
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.onload = () => xhr.status === 200 ? resolve(JSON.parse(xhr.responseText)) : reject(xhr.responseText);
    xhr.onerror = () => reject('network error');
    xhr.send(formData);
  });
}

// ============================================================
// 11. 파일 삭제
// ============================================================
async function deleteDriveFile(fileId, fileName) {
  const modeLabel = driveDeleteMode === 'trash' ? '휴지통으로 이동' : '영구 삭제';
  if (!confirm(`"${fileName}" 을(를) ${modeLabel} 하시겠습니까?`)) return;
  try {
    await executeDriveDelete(fileId);
    driveState.files = driveState.files.filter(f => f.id !== fileId);
    driveSelection.delete(fileId);
    renderDriveFiles();
    showDriveToast(`✓ ${modeLabel} 완료`);
    setTimeout(hideDriveToast, 2000);
  } catch (e) {
    showDriveToast('삭제 오류');
  }
}

async function deleteSelectedDriveFiles() {
  const ids = [...driveSelection];
  if (ids.length === 0) return;
  const modeLabel = driveDeleteMode === 'trash' ? '휴지통으로 이동' : '영구 삭제';
  if (!confirmDriveBulkDeleteWithPreview(ids, modeLabel)) return;

  let successCount = 0;
  showDriveToast(`선택 ${modeLabel} 진행 중... (0/${ids.length})`);
  try {
    await ensureDriveAccessToken(false);
    for (let i = 0; i < ids.length; i++) {
      const fileId = ids[i];
      try {
        await executeDriveDelete(fileId);
        successCount++;
      } catch (e) {
        console.error('[DriveGallery] 선택 삭제 오류', fileId, e);
      }
      showDriveToast(`선택 ${modeLabel} 진행 중... (${i + 1}/${ids.length})`);
    }
    driveSelection.clear();
    driveLastSelectionIndex = null;
    await loadDriveFiles(driveState.currentFolderId);
    showDriveToast(`✓ ${successCount}/${ids.length} ${modeLabel} 완료`);
    setTimeout(hideDriveToast, 2200);
  } catch (e) {
    console.error('[DriveGallery] 선택 삭제 전체 오류', e);
    showDriveToast('선택 삭제 오류');
  }
}

function confirmDriveBulkDeleteWithPreview(ids, modeLabel) {
  const byId = new Map((driveState.files || []).map(f => [f.id, f.name || '(이름 없음)']));
  const names = ids.map(id => byId.get(id) || `(알 수 없는 항목: ${id.slice(0, 8)}...)`);
  const previewMax = 20;
  const preview = names.slice(0, previewMax).map((n, i) => `${i + 1}. ${n}`).join('\n');
  const remain = names.length - Math.min(names.length, previewMax);
  const remainLine = remain > 0 ? `\n... 외 ${remain}개` : '';
  const msg = `아래 ${ids.length}개 항목을 ${modeLabel} 합니다.\n\n${preview}${remainLine}\n\n계속 진행하시겠습니까?`;
  return confirm(msg);
}

function toggleDriveDeleteMode() {
  driveDeleteMode = driveDeleteMode === 'trash' ? 'permanent' : 'trash';
  updateDriveSelectionUI();
  showDriveToast(`삭제모드: ${driveDeleteMode === 'trash' ? '휴지통' : '영구삭제'}`);
  setTimeout(hideDriveToast, 1400);
}

async function executeDriveDelete(fileId) {
  await ensureDriveAccessToken(false);
  if (driveDeleteMode === 'trash') {
    await gapi.client.drive.files.update({
      fileId,
      resource: { trashed: true },
      fields: 'id, trashed',
    });
    return;
  }
  await gapi.client.drive.files.delete({ fileId });
}

// ============================================================
// 12. 폴더 생성
// ============================================================
async function createDriveFolder() {
  const name = prompt('폴더 이름:');
  if (!name) return;
  try {
    await ensureDriveAccessToken(false);
    await gapi.client.drive.files.create({
      resource: {
        name: name.trim(),
        mimeType: 'application/vnd.google-apps.folder',
        parents: [driveState.currentFolderId],
      },
      fields: 'id',
    });
    showDriveToast(`✓ "${name}" 폴더 생성`);
    setTimeout(hideDriveToast, 2000);
    await loadDriveFiles(driveState.currentFolderId);
  } catch (e) {
    showDriveToast('폴더 생성 오류');
  }
}

// ============================================================
// 13. 라이트박스
// ============================================================
function openDriveLightbox(index) {
  const mediaFiles = getDrivePreviewableMediaFiles();
  if (!mediaFiles.length || index < 0 || index >= mediaFiles.length) return;

  driveState.lightboxIndex = index;
  const file = mediaFiles[index];
  const lb = document.getElementById('dg-lightbox');
  const img = document.getElementById('dg-lb-img');
  const video = document.getElementById('dg-lb-video');

  const isVideo = isDriveVideoFile(file);

  if (isVideo) {
    img.style.display = 'none';
    video.style.display = 'block';
    video.src = file.webContentLink || file.webViewLink;
  } else {
    video.style.display = 'none';
    img.style.display = 'block';
    img.src = file.webContentLink
      ? file.webContentLink.replace('&export=download', '')
      : (file.thumbnailLink || '');
    img.alt = file.name;
  }

  document.getElementById('dg-lb-name').textContent = file.name;
  document.getElementById('dg-lb-size').textContent = file.size ? formatBytes(parseInt(file.size)) : '';
  lb.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeDriveLightbox() {
  document.getElementById('dg-lightbox').style.display = 'none';
  document.getElementById('dg-lb-video').pause?.();
  document.body.style.overflow = '';
}

function moveDriveLightbox(dir) {
  const mediaFiles = getDrivePreviewableMediaFiles();
  let next = driveState.lightboxIndex + dir;
  if (next < 0) next = mediaFiles.length - 1;
  if (next >= mediaFiles.length) next = 0;
  openDriveLightbox(next);
}

// 키보드 단축키
document.addEventListener('keydown', (e) => {
  if (document.getElementById('dg-lightbox')?.style.display !== 'none') {
    if (e.key === 'Escape') closeDriveLightbox();
    if (e.key === 'ArrowLeft') moveDriveLightbox(-1);
    if (e.key === 'ArrowRight') moveDriveLightbox(1);
  }
});
document.addEventListener('mouseup', stopShiftDragSelection);

// ============================================================
// 유틸
// ============================================================
function setDriveLoading(on, message = '로딩 중...') {
  if (on) {
    document.getElementById('dg-content').innerHTML = `
      <div class="dg-loading"><div class="dg-spinner"></div><p>${escHtml(message)}</p></div>
    `;
  }
}

function showDriveToast(msg) {
  const t = document.getElementById('dg-toast');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
}

function hideDriveToast() {
  const t = document.getElementById('dg-toast');
  if (t) t.style.display = 'none';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// 외부 노출 (기존 앱 메뉴 클릭 시 호출)
// ============================================================
window.DriveGallery = { load: loadDriveGallery, render: renderDriveGallery };
