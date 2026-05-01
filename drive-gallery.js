// ===============================
// Project LEE - Drive Explorer UI
// ===============================

// 🔐 CONFIG
const DRIVE_CONFIG = {
  CLIENT_ID: '299405203142-8cdiq5unru0ocif4qti948hsmm2ge83h.apps.googleusercontent.com',
  API_KEY: 'AIzaSyBLbhkWaq44NBPTHQKZyCwaEBOWYjNlcWU',
  DISCOVERY_DOCS: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
  SCOPES: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive'
  // ✅ drive.readonly: 기존 파일 조회 / drive: 파일 삭제 권한 포함
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
// QUOTA HELPER
// ===============================
function bytesToGB(bytes) {
  return (Number(bytes) / (1024 ** 3)).toFixed(2);
}

async function fetchQuota() {
  try {
    const res = await gapi.client.drive.about.get({ fields: 'storageQuota' });
    const q = res.result.storageQuota;
    const used = Number(q.usage || 0);
    const total = Number(q.limit || 0);

    if (total === 0) {
      // G Suite unlimited 계정 등 limit 없는 경우
      return { usedGB: bytesToGB(used), totalGB: null, percent: 0 };
    }

    const percent = Math.min(Math.round((used / total) * 100), 100);
    return { usedGB: bytesToGB(used), totalGB: bytesToGB(total), percent };
  } catch (e) {
    console.warn('Quota fetch failed:', e);
    return null;
  }
}

function renderQuotaBar(quota) {
  if (!quota) return '';

  const { usedGB, totalGB, percent } = quota;

  // 사용량에 따라 색상 변화
  let barColor = 'bg-blue-500';
  if (percent >= 90) barColor = 'bg-red-500';
  else if (percent >= 70) barColor = 'bg-amber-500';

  const label = totalGB
    ? `${usedGB} GB / ${totalGB} GB 사용 (${percent}%)`
    : `${usedGB} GB 사용 중`;

  return `
    <div class="flex flex-col gap-1.5 min-w-[160px]">
      <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <i class="fa-solid fa-hard-drive text-slate-400"></i>
        <span>${label}</span>
      </div>
      ${totalGB ? `
      <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
        <div class="${barColor} h-2 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
      </div>` : ''}
    </div>
  `;
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

    const q = `'${folderId}' in parents and trashed = false`;

    // 파일 목록과 용량을 병렬로 요청
    const [res, quota] = await Promise.all([
      gapi.client.drive.files.list({
        pageSize: 50,
        fields: 'files(id,name,mimeType,thumbnailLink,webViewLink,iconLink)',
        orderBy: 'folder, modifiedTime desc',
        q
      }),
      fetchQuota()
    ]);

    renderFiles(res.result.files, quota);
  } catch (e) {
    renderError(e);
  }
}

// ===============================
// DELETE FILE/FOLDER
// ===============================
window.deleteItem = async function (event, fileId, fileName) {
  // ✅ 이벤트 버블링 방지: 폴더 진입 / 파일 열기 이벤트 차단
  event.stopPropagation();

  const confirmed = confirm(`"${fileName}"\n\n정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
  if (!confirmed) return;

  try {
    await gapi.client.drive.files.delete({ fileId });
    loadFiles();
  } catch (e) {
    alert('삭제 실패: ' + (e.result?.error?.message || e.message || '알 수 없는 오류'));
    console.error('Delete error:', e);
  }
}

// ===============================
// UI (Explorer)
// ===============================
function renderFiles(files, quota) {
  const breadcrumb = renderBreadcrumb();
  const isRoot = driveState.folderStack.length === 0;

  // ✅ [1] 뒤로 가기 버튼 (루트일 때는 숨김)
  const backButton = isRoot ? '' : `
    <button
      onclick="goBack()"
      class="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all hover:-translate-x-0.5 border border-slate-200 shrink-0"
      title="상위 폴더로 이동"
    >
      <i class="fa-solid fa-arrow-left"></i>
      <span class="hidden sm:inline">뒤로</span>
    </button>
  `;

  // ✅ [2] 용량 계기판
  const quotaBar = renderQuotaBar(quota);

  const list = files.map(f => {
    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';

    const thumb = isFolder
      ? `<div class="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-2xl mb-3 shadow-inner group-hover:bg-amber-200 transition-colors"><i class="fa-solid fa-folder text-4xl text-amber-500"></i></div>`
      : `<img src="${f.thumbnailLink || f.iconLink || 'https://via.placeholder.com/80?text=No+Thumb'}" class="w-16 h-16 object-cover rounded-2xl mb-3 shadow-sm group-hover:shadow-md transition-shadow bg-slate-100">`;

    const clickAction = isFolder
      ? `onclick="enterFolder('${f.id}','${f.name.replace(/'/g, "\\'")}')"`
      : `onclick="openDriveFile('${f.webViewLink}')"`;

    // ✅ [3] 삭제 버튼 (카드 우측 상단)
    const escapedName = f.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const deleteBtn = `
      <button
        onclick="deleteItem(event, '${f.id}', '${escapedName}')"
        class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
        title="삭제"
      >
        <i class="fa-solid fa-trash text-xs"></i>
      </button>
    `;

    return `
      <div class="relative flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-indigo-200 transition-all duration-300 cursor-pointer w-32 group hover:-translate-y-1" ${clickAction}>
        ${deleteBtn}
        ${thumb}
        <div class="text-xs font-bold text-slate-700 w-full truncate text-center group-hover:text-indigo-600 transition-colors" title="${f.name}">${f.name}</div>
      </div>
    `;
  }).join('');

  document.getElementById('contentArea').innerHTML = `
    <div class="p-6 bg-slate-50 h-full overflow-y-auto custom-scrollbar animate-fade-in flex flex-col">
      
      <!-- 상단 헤더 영역 -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 shrink-0">
          <div class="flex items-center gap-3 overflow-hidden">

              <!-- ✅ 뒤로 가기 버튼 -->
              ${backButton}

              <div class="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                  <i class="fa-brands fa-google-drive text-2xl text-blue-500"></i>
              </div>
              <div class="overflow-hidden">
                  <h2 class="text-xl font-black text-slate-800 mb-1">Drive Explorer</h2>
                  ${breadcrumb}
              </div>
          </div>
          
          <div class="flex flex-col items-end gap-3 shrink-0">
            <!-- ✅ 용량 계기판 -->
            ${quotaBar}

            <div class="flex items-center gap-3">
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

// ✅ [1] 뒤로 가기: folderStack에서 마지막 항목 pop 후 이전 폴더로 이동
window.goBack = function () {
  if (driveState.folderStack.length === 0) return;
  driveState.folderStack.pop();

  if (driveState.folderStack.length === 0) {
    loadFiles('root');
  } else {
    const parent = driveState.folderStack[driveState.folderStack.length - 1];
    loadFiles(parent.id);
  }
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