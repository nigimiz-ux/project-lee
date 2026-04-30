// ===============================
// Project LEE - Drive Explorer UI
// ===============================

// 🔐 CONFIG
const DRIVE_CONFIG = {
  CLIENT_ID: '299405203142-8cdiq5unru0ocif4qti948hsmm2ge83h.apps.googleusercontent.com',
  API_KEY: 'AIzaSyBLbhkWaq44NBPTHQKZyCwaEBOWYjNlcWU',
  DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  SCOPES: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'
  // ✅ FIX 4: drive.file만으로는 기존 파일 조회 불가 → drive.readonly 추가
};

// 상태
let driveState = {
  tokenClient: null,
  tokenExpiresAt: 0,
  currentFolderId: 'root',
  folderStack: []
};

// ===============================
// ERROR HANDLER
// ===============================
function renderError(e) {
  const contentArea = document.getElementById('contentArea');
  if (contentArea) {
    const errorMsg = e instanceof Error ? e.message : (typeof e === 'object' ? JSON.stringify(e) : e);
    contentArea.innerHTML = `
      <div class="flex flex-col items-center justify-center w-full h-full bg-red-50 p-8 animate-fade-in">
          <i class="fa-solid fa-triangle-exclamation text-6xl text-red-500 mb-6 drop-shadow-md"></i>
          <h3 class="text-2xl font-black text-red-700 mb-2">드라이브 연결 에러 발생</h3>
          <p class="text-red-500 mb-8 text-center max-w-lg whitespace-pre-wrap break-words border border-red-200 bg-red-100 p-4 rounded-xl shadow-sm">${errorMsg}</p>
          <button onclick="initDrive()" class="px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg transition-all hover:-translate-y-1 flex items-center gap-2">
            <i class="fa-solid fa-rotate-right"></i> 다시 시도
          </button>
      </div>`;
  }
  console.error("Drive Error:", e);
}

// ===============================
// INIT
// ===============================
async function initDrive() {
  try {
    const contentArea = document.getElementById('contentArea');
    if (contentArea && contentArea.innerHTML.trim() === '') {
      contentArea.innerHTML = '<div class="flex items-center justify-center w-full h-full"><i class="fa-solid fa-spinner fa-spin text-4xl text-slate-300"></i></div>';
    }

    await loadScript('https://apis.google.com/js/api.js');
    await loadScript('https://accounts.google.com/gsi/client');

    await new Promise((res, rej) => gapi.load('client', { callback: res, onerror: rej }));

    await gapi.client.init({
      apiKey: DRIVE_CONFIG.API_KEY,
      discoveryDocs: DRIVE_CONFIG.DISCOVERY_DOCS,
    });

    driveState.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CONFIG.CLIENT_ID,
      scope: DRIVE_CONFIG.SCOPES,
      callback: (resp) => {
        if (resp.error) {
          renderError(resp.error);
          return;
        }
        gapi.client.setToken({ access_token: resp.access_token });
        driveState.tokenExpiresAt = Date.now() + resp.expires_in * 1000;
        loadFiles();
      }
    });

    loadFiles();
  } catch (e) {
    renderError(e);
  }
}

// ===============================
// AUTH
// ===============================
window.signInDrive = function () {
  driveState.tokenClient.requestAccessToken({ prompt: 'consent' });
}

function hasToken() {
  try {
    if (!gapi || !gapi.client || !gapi.client.getToken) return false;
    const t = gapi.client.getToken();
    return t && driveState.tokenExpiresAt > Date.now();
  } catch (e) {
    return false;
  }
}

// ===============================
// FILE LOAD (폴더 기반)
// ===============================
async function loadFiles(folderId = driveState.currentFolderId) {
  try {
    if (!hasToken()) {
      document.getElementById('contentArea').innerHTML = `
        <div class="flex flex-col items-center justify-center w-full h-full bg-slate-50 p-8 animate-fade-in">
            <i class="fa-brands fa-google-drive text-6xl text-blue-500 mb-6 drop-shadow-md"></i>
            <h3 class="text-2xl font-black text-slate-800 mb-2">Google Drive 권한 필요</h3>
            <p class="text-slate-500 mb-8 text-center max-w-sm">드라이브 탐색기를 사용하려면 먼저 연동을 진행해 주세요.</p>
            <button onclick="signInDrive()" class="px-8 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all hover:-translate-y-1 flex items-center gap-3">
                <img src="https://www.google.com/images/branding/product/2x/googleg_32dp.png" class="w-5 h-5 bg-white rounded-full p-0.5" alt="G"> 
                Drive 연동하기
            </button>
        </div>`;
      return;
    }

    driveState.currentFolderId = folderId;

    // ✅ FIX 1: 백틱 내부 이스케이프 제거 (파일이 .js로 저장될 때 \` 불필요)
    const q = `'${folderId}' in parents and trashed = false`;

    const res = await gapi.client.drive.files.list({
      pageSize: 50,
      fields: 'files(id,name,mimeType,thumbnailLink,webViewLink,iconLink)',
      orderBy: 'folder, modifiedTime desc',
      q
    });

    renderFiles(res.result.files);
  } catch (e) {
    renderError(e);
  }
}

// ===============================
// UI (Explorer)
// ===============================
function renderFiles(files) {
  const breadcrumb = renderBreadcrumb();

  const list = files.map(f => {
    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';

    // ✅ FIX 2: < div, < img 등 태그 내 불필요한 공백 제거
    const thumb = isFolder
      ? `<div class="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-2xl mb-3 shadow-inner group-hover:bg-amber-200 transition-colors"><i class="fa-solid fa-folder text-4xl text-amber-500"></i></div>`
      : `<img src="${f.thumbnailLink || f.iconLink || 'https://via.placeholder.com/80?text=No+Thumb'}" class="w-16 h-16 object-cover rounded-2xl mb-3 shadow-sm group-hover:shadow-md transition-shadow bg-slate-100">`;

    const clickAction = isFolder
      ? `onclick="enterFolder('${f.id}','${f.name.replace(/'/g, "\\'")}')"`
      : `onclick="openDriveFile('${f.webViewLink}')"`;

    return `
      <div class="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-indigo-200 transition-all duration-300 cursor-pointer w-32 group hover:-translate-y-1" ${clickAction}>
        ${thumb}
        <div class="text-xs font-bold text-slate-700 w-full truncate text-center group-hover:text-indigo-600 transition-colors" title="${f.name}">${f.name}</div>
      </div>
    `;
  }).join('');

  document.getElementById('contentArea').innerHTML = `
    <div class="p-6 bg-slate-50 h-full overflow-y-auto custom-scrollbar animate-fade-in flex flex-col">
      
      <!-- 상단 헤더 영역 -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 shrink-0">
          <div class="flex items-center gap-4 overflow-hidden">
              <div class="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                  <i class="fa-brands fa-google-drive text-2xl text-blue-500"></i>
              </div>
              <div class="overflow-hidden">
                  <h2 class="text-xl font-black text-slate-800 mb-1">Drive Explorer</h2>
                  ${breadcrumb}
              </div>
          </div>
          
          <div class="flex items-center gap-3 shrink-0">
              <!-- 파일 업로드 버튼 -->
              <label for="driveUploadInput" id="uploadLabelBtn" class="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2 hover:scale-105 shrink-0 m-0">
                  <i class="fa-solid fa-cloud-arrow-up"></i> 파일 업로드
              </label>
              <input type="file" id="driveUploadInput" class="hidden" onchange="handleUploadWrapper(this)" />
              
              <!-- 새 폴더 버튼 -->
              <button onclick="promptCreateFolder()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2 hover:scale-105 shrink-0 m-0 border-none">
                  <i class="fa-solid fa-folder-plus"></i> 새 폴더
              </button>
          </div>
      </div>

      <!-- 탐색기 뷰 -->
      <div class="flex flex-wrap gap-4 items-start content-start flex-1">
        ${files.length > 0 ? list : '<div class="w-full py-20 flex flex-col items-center justify-center text-slate-400 font-bold"><i class="fa-solid fa-folder-open text-5xl mb-4 opacity-50 block"></i>이 폴더는 비어 있습니다.</div>'}
      </div>
    </div>
  `;
}

// ===============================
// BREADCRUMB
// ===============================
function renderBreadcrumb() {
  let html = `<span class="cursor-pointer hover:text-indigo-600 transition-colors" onclick="goRoot()"><i class="fa-solid fa-house text-[10px] mr-1"></i>My Drive</span>`;

  driveState.folderStack.forEach((f, i) => {
    html += ` <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 mx-2"></i> <span class="cursor-pointer hover:text-indigo-600 transition-colors truncate max-w-[120px] inline-block align-bottom" onclick="goToIndex(${i})">${f.name}</span>`;
  });

  return `<div class="text-xs font-bold text-slate-500 flex items-center whitespace-nowrap overflow-x-auto custom-scrollbar pb-1">${html}</div>`;
}

// ===============================
// NAVIGATION
// ===============================
window.enterFolder = function (id, name) {
  driveState.folderStack.push({ id, name });
  loadFiles(id);
}

window.goRoot = function () {
  driveState.folderStack = [];
  loadFiles('root');
}

window.goToIndex = function (index) {
  driveState.folderStack = driveState.folderStack.slice(0, index + 1);
  const folder = driveState.folderStack[index];
  loadFiles(folder.id);
}

// ===============================
// FILE ACTION
// ===============================
window.openDriveFile = function (url) {
  if (url && url !== 'undefined') {
    window.open(url, '_blank');
  }
}

// ===============================
// UPLOAD & FOLDER WRAPPERS
// ===============================
window.handleUploadWrapper = async function (input) {
  if (input.files && input.files.length > 0) {
    const file = input.files[0];

    const label = document.getElementById('uploadLabelBtn');
    const originalHtml = label.innerHTML;
    label.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 업로드 중...';
    label.style.pointerEvents = 'none';

    try {
      await uploadFile(file);
    } catch (e) {
      alert('업로드 실패: ' + e.message);
      console.error(e);
    } finally {
      input.value = '';
      label.innerHTML = originalHtml;
      label.style.pointerEvents = 'auto';
    }
  }
}

window.promptCreateFolder = async function () {
  const name = prompt("새 폴더 이름을 입력하세요:", "새 폴더");
  if (name && name.trim()) {
    try {
      await createFolder(name.trim());
    } catch (e) {
      alert('폴더 생성 실패: ' + e.message);
      console.error(e);
    }
  }
};

// ===============================
// UPLOAD (API)
// ===============================
async function uploadFile(file) {
  const token = gapi.client.getToken().access_token;

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: file.name,
    parents: [driveState.currentFolderId]
  })], { type: 'application/json' }));

  form.append('file', file);

  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  loadFiles();
}

// ===============================
// FOLDER CREATE (API)
// ===============================
async function createFolder(name) {
  const token = gapi.client.getToken().access_token;

  await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [driveState.currentFolderId]
    })
  });

  loadFiles();
}

// ===============================
// UTIL
// ===============================
function loadScript(src) {
  return new Promise((res, rej) => {
    // ✅ FIX 3: querySelector 내 백틱 이스케이프 제거
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(s);
  });
}

// ===============================
// START
// ===============================
window.DriveGallery = {
  load: initDrive
};