// ===============================
// Project LEE - Stable Drive Layer
// ===============================

// 🔐 CONFIG
const DRIVE_CONFIG = {
  CLIENT_ID: '299405203142-8cdiq5unru0ocif4qti948hsmm2ge83h.apps.googleusercontent.com',
  API_KEY: 'AIzaSyBLbhkWaq44NBPTHQKZyCwaEBOWYjNlcWU',
  DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  SCOPES: 'https://www.googleapis.com/auth/drive.file'
};

// 상태
let driveState = {
  tokenClient: null,
  tokenExpiresAt: 0,
};

// ===============================
// 무한 로딩 철거 유틸
// ===============================
function removeLoadingScreens() {
  ['splashScreen', 'loadingRings'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  
  if (typeof forceClearAll === 'function') {
    forceClearAll();
  }
  
  // 만약 mainApp이 숨겨져 있다면 복구
  const mainApp = document.getElementById('mainApp');
  if (mainApp) {
      mainApp.classList.remove('hidden');
      mainApp.style.opacity = '1';
      mainApp.style.display = 'flex';
  }
}

// ===============================
// 1. INIT (안정화 버전)
// ===============================
async function initDrive() {
  try {
    await loadScript('https://apis.google.com/js/api.js');
    await loadScript('https://accounts.google.com/gsi/client');

    await new Promise((res, rej) => {
      gapi.load('client', { callback: res, onerror: rej });
    });

    await gapi.client.init({
      apiKey: DRIVE_CONFIG.API_KEY,
      discoveryDocs: DRIVE_CONFIG.DISCOVERY_DOCS,
    });

    // ✅ 핵심: popup OAuth
    driveState.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CONFIG.CLIENT_ID,
      scope: DRIVE_CONFIG.SCOPES,
      callback: (resp) => {
        if (resp.error) {
          console.error('Token Error', resp);
          removeLoadingScreens();
          return;
        }

        gapi.client.setToken({ access_token: resp.access_token });
        driveState.tokenExpiresAt = Date.now() + resp.expires_in * 1000;

        console.log('✅ Drive 로그인 성공');
        loadFiles(); // 토큰 발급 후 파일 로드
      }
    });

    // 팝업 지뢰 제거: 초기화 시점에는 절대 자동 로그인(requestAccessToken)을 호출하지 않음.
    // 연동 완료 및 가림막 무조건 철거
    removeLoadingScreens();
    loadFiles(); // 토큰이 없으면 로그인 UI 표시, 있으면 리스트 렌더링
  } catch (e) {
    console.error('Drive API Init Error:', e);
    removeLoadingScreens();
  }
}

// ===============================
// 2. LOGIN (단순화)
// ===============================
function signInDrive() {
  // 팝업 지뢰 제거: 오직 이 버튼 클릭 시에만 requestAccessToken 호출 (COOP 방어)
  if (driveState.tokenClient) {
    driveState.tokenClient.requestAccessToken({ prompt: 'consent' });
  }
}

// ===============================
// 3. TOKEN CHECK
// ===============================
function hasToken() {
  const token = gapi.client.getToken();
  return token && driveState.tokenExpiresAt > Date.now();
}

// ===============================
// 4. FILE LIST
// ===============================
async function loadFiles() {
  if (!hasToken()) {
    // [연동]: 기존 showLogin() 삭제 후 index.html의 로그인 UI와 맞물리게 연결
    const contentArea = document.getElementById('contentArea');
    if (contentArea) {
      contentArea.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:#f8fafc;animation: fadeIn 0.5s ease;">
            <i class="fa-brands fa-google-drive" style="font-size:3rem;color:#4285F4;margin-bottom:1.2rem;"></i>
            <p style="color:#1e293b;font-weight:bold;font-size:1.2rem;margin-bottom:1.5rem;">Google Drive 접근 권한이 필요합니다.</p>
            <button onclick="signInDrive()" style="background:#1e293b;color:white;padding:14px 28px;border-radius:12px;font-weight:bold;font-size:1rem;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.15);transition:all 0.2s;">
                <img src="https://www.google.com/images/branding/product/2x/googleg_32dp.png" style="width:20px;height:20px;" alt="G"> Drive 연동하기
            </button>
        </div>
      `;
    }
    return;
  }

  try {
    const res = await gapi.client.drive.files.list({
      pageSize: 50,
      fields: 'files(id,name,thumbnailLink)',
      q: "trashed = false" // 휴지통 파일 제외
    });

    renderFiles(res.result.files);
  } catch (e) {
    console.error('File load error', e);
  }
}

// ===============================
// 5. UI
// ===============================
// showLogin() 은 삭제됨 (loadFiles 내부에 자연스럽게 통합됨)

function renderFiles(files) {
  if (!files || files.length === 0) {
    document.getElementById('contentArea').innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-weight:bold;">파일이 없습니다.</div>';
    return;
  }

  const html = files.map(f => `
    <div style="margin:10px; display:inline-flex; flex-direction:column; align-items:center; background:#fff; padding:12px; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
      <img src="${f.thumbnailLink || 'https://via.placeholder.com/100?text=No+Thumb'}" style="width:100px; height:100px; object-fit:cover; border-radius:8px; margin-bottom:10px; background:#f1f5f9;" />
      <p style="font-size:12px; color:#334155; font-weight:bold; width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center;">${f.name}</p>
    </div>
  `).join('');

  document.getElementById('contentArea').innerHTML = `
    <div style="padding:24px; background:#f8fafc; height:100%; overflow-y:auto;" class="custom-scrollbar">
        <h2 style="font-size:1.5rem; font-weight:900; margin-bottom:20px; color:#1e293b; display:flex; align-items:center; gap:10px;">
            <i class="fa-brands fa-google-drive text-blue-500"></i> My Drive Storage
        </h2>
        <div style="display:flex; flex-wrap:wrap;">
          ${html}
        </div>
    </div>
  `;
}

// ===============================
// 6. UPLOAD (Queue 적용)
// ===============================
let uploadQueue = [];

async function uploadFile(file) {
  uploadQueue.push(file);
  processQueue();
}

async function processQueue() {
  if (processQueue.running) return;
  processQueue.running = true;

  while (uploadQueue.length) {
    const file = uploadQueue[0];

    try {
      await uploadToDrive(file);
      uploadQueue.shift();
      console.log('업로드 성공:', file.name);
      loadFiles(); // 업로드 성공 후 리스트 갱신
    } catch (e) {
      console.error('업로드 실패 → 재시도 대기', e);
      await sleep(2000);
    }
  }

  processQueue.running = false;
}

// 실제 업로드
async function uploadToDrive(file) {
  const token = gapi.client.getToken().access_token;

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: file.name
  })], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form
    }
  );

  if (!res.ok) throw new Error('upload failed');
}

// ===============================
// UTIL
// ===============================
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector('script[src="' + src + '"]')) {
      res();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ===============================
// START (index.html 연동)
// ===============================
// index.html에서 window.DriveGallery.load()로 호출되도록 연동
window.DriveGallery = {
  load: function() {
    initDrive();
  }
};
