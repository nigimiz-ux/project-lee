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
      fields: 'files(id,name,thumbnailLink,mimeType,webViewLink,webContentLink)',
      q: "trashed = false", // 휴지통 파일 제외
      orderBy: "folder, modifiedTime desc"
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
  let filesHtml = '';
  if (!files || files.length === 0) {
    filesHtml = '<div style="padding:40px; text-align:center; color:#64748b; font-weight:bold; width: 100%;">파일이 없습니다.</div>';
  } else {
    filesHtml = files.map(f => {
      const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
      const iconOrThumb = isFolder 
        ? `<div style="width:100px; height:100px; display:flex; align-items:center; justify-content:center; background:#f1f5f9; border-radius:8px; margin-bottom:10px;"><i class="fa-solid fa-folder text-4xl text-amber-400"></i></div>`
        : `<img src="${f.thumbnailLink || 'https://via.placeholder.com/100?text=No+Thumb'}" style="width:100px; height:100px; object-fit:cover; border-radius:8px; margin-bottom:10px; background:#f1f5f9;" />`;
      
      const actionLink = f.webContentLink || f.webViewLink;
      const actionBtn = actionLink 
        ? `<a href="${actionLink}" target="_blank" style="margin-top:8px; padding:6px 12px; background:#e2e8f0; color:#475569; border-radius:6px; font-size:11px; font-weight:bold; text-decoration:none; display:inline-flex; align-items:center; gap:4px; transition:all 0.2s;" onmouseover="this.style.background='#cbd5e1'" onmouseout="this.style.background='#e2e8f0'"><i class="fa-solid ${f.webContentLink ? 'fa-download' : 'fa-eye'}"></i> ${f.webContentLink ? '다운로드' : '보기'}</a>` 
        : '';

      return `
        <div style="margin:10px; display:inline-flex; flex-direction:column; align-items:center; background:#fff; padding:16px; border-radius:16px; box-shadow:0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; transition: transform 0.2s; cursor:pointer;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          ${iconOrThumb}
          <p style="font-size:13px; color:#334155; font-weight:bold; width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center;" title="${f.name}">${f.name}</p>
          ${actionBtn}
        </div>
      `;
    }).join('');
  }

  document.getElementById('contentArea').innerHTML = `
    <div style="padding:24px; background:#f8fafc; height:100%; overflow-y:auto; display:flex; flex-direction:column;" class="custom-scrollbar animate-fade-in">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; margin-bottom:24px; background:white; padding:20px; border-radius:16px; box-shadow:0 2px 10px rgba(0,0,0,0.02); border:1px solid #f1f5f9;">
            <h2 style="font-size:1.5rem; font-weight:900; color:#1e293b; display:flex; align-items:center; gap:10px; margin:0;">
                <i class="fa-brands fa-google-drive text-blue-500"></i> My Drive Storage
            </h2>
            
            <div style="display:flex; gap:16px; flex-wrap:wrap;">
                <!-- Upload UI -->
                <div style="display:flex; align-items:center; gap:8px; background:#f8fafc; padding:8px 16px; border-radius:12px; border:1px solid #e2e8f0;">
                    <label for="driveUploadInput" style="cursor:pointer; display:flex; align-items:center; gap:6px; color:#475569; font-size:13px; font-weight:bold;">
                        <i class="fa-solid fa-paperclip"></i> 파일 선택
                    </label>
                    <input type="file" id="driveUploadInput" style="display:none;" onchange="document.getElementById('uploadFileName').textContent = this.files[0] ? this.files[0].name : '선택된 파일 없음'" />
                    <span id="uploadFileName" style="font-size:12px; color:#94a3b8; max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">선택된 파일 없음</span>
                    <button onclick="handleDriveUpload(event)" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                        <i class="fa-solid fa-cloud-arrow-up"></i> 업로드
                    </button>
                </div>

                <!-- Create Folder UI -->
                <div style="display:flex; align-items:center; gap:8px; background:#f8fafc; padding:8px 16px; border-radius:12px; border:1px solid #e2e8f0;">
                    <i class="fa-solid fa-folder-plus text-amber-500"></i>
                    <input type="text" id="driveFolderName" placeholder="새 폴더명" style="border:1px solid #cbd5e1; padding:6px 10px; border-radius:6px; font-size:13px; outline:none; width:120px;" />
                    <button onclick="handleCreateFolder(event)" style="background:#10b981; color:white; border:none; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:bold; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">
                        생성
                    </button>
                </div>
            </div>
        </div>

        <div style="display:flex; flex-wrap:wrap;">
          ${filesHtml}
        </div>
    </div>
  `;
}

// Handlers for HTML buttons
window.handleDriveUpload = async function(event) {
    const input = document.getElementById('driveUploadInput');
    if (!input.files || input.files.length === 0) {
        alert('업로드할 파일을 선택해주세요.');
        return;
    }
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 처리중...';
    btn.disabled = true;

    try {
        await uploadFile(input.files[0]);
        input.value = '';
        document.getElementById('uploadFileName').textContent = '선택된 파일 없음';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.handleCreateFolder = async function(event) {
    const input = document.getElementById('driveFolderName');
    const folderName = input.value.trim();
    if (!folderName) {
        alert('폴더명을 입력해주세요.');
        return;
    }
    
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 생성중...';
    btn.disabled = true;

    try {
        await createFolder(folderName);
        input.value = '';
    } catch (e) {
        alert('폴더 생성 실패: ' + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

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
// 7. FOLDER CREATION
// ===============================
async function createFolder(folderName) {
  const token = gapi.client.getToken().access_token;
  
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!res.ok) throw new Error('folder creation failed');
  console.log('✅ 폴더 생성 성공:', folderName);
  loadFiles(); // 갱신
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
