// ===============================
// Project LEE - Drive Explorer UI
// GAS Web App 연동 버전 (인증 팝업 없음)
// ===============================

// ✅ GAS 배포 후 여기에 URL 입력
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxnxmP-UrTOmUof6RrEZGGeQTjvroWcHsAo3lVluPbpRir3KCyPoF4IbYpxwwmyBCtX/exec';

// ===============================
// 상태
// ===============================
let driveState = {
  currentFolderId: 'root',
  folderStack: []
};

// ===============================
// GAS API 호출 헬퍼
// ===============================
async function gasCall(params) {
  const url = new URL(GAS_WEB_APP_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    redirect: 'follow',
    credentials: 'include'   // ✅ 구글 로그인 세션 쿠키 포함 → "나만" 설정에서도 인증 통과
  });

  if (!res.ok) throw new Error(`GAS 응답 오류: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function gasPost(body) {
  const res = await fetch(GAS_WEB_APP_URL, {
    method: 'POST',
    redirect: 'follow',
    credentials: 'include',  // ✅ 동일하게 세션 쿠키 포함
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });

  if (!res.ok) throw new Error(`GAS 응답 오류: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

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
  const contentArea = document.getElementById('contentArea');
  if (contentArea) {
    contentArea.innerHTML = '<div class="flex items-center justify-center w-full h-full"><i class="fa-solid fa-spinner fa-spin text-4xl text-slate-300"></i></div>';
  }

  // GAS URL 미설정 시 안내
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL === 'YOUR_GAS_WEB_APP_URL_HERE') {
    contentArea.innerHTML = `
      <div class="flex flex-col items-center justify-center w-full h-full bg-amber-50 p-8 animate-fade-in">
          <i class="fa-solid fa-gear text-6xl text-amber-400 mb-6"></i>
          <h3 class="text-2xl font-black text-amber-800 mb-2">GAS URL 설정 필요</h3>
          <p class="text-amber-700 text-center max-w-sm">drive-gallery.js 상단의<br><code class="bg-amber-100 px-2 py-0.5 rounded font-mono text-sm">GAS_WEB_APP_URL</code> 에<br>배포된 Web App URL을 입력해 주세요.</p>
      </div>`;
    return;
  }

  loadFiles('root');
}

// ===============================
// QUOTA HELPERS
// ===============================
function renderQuotaBar(quota) {
  if (!quota) return '';

  const { usedGB, totalGB, percent } = quota;
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
// FILE LOAD
// ✅ 파일목록+용량을 한 번의 GAS 호출로 처리 → 레이턴시 절반으로 단축
// ===============================
async function loadFiles(folderId = driveState.currentFolderId) {
  try {
    driveState.currentFolderId = folderId;

    const data = await gasCall({ action: 'listWithQuota', folderId });
    renderFiles(data.files || [], data.quota || null);
  } catch (e) {
    renderError(e);
  }
}

// ===============================
// DELETE
// ===============================
window.deleteItem = async function (event, fileId, fileName) {
  event.stopPropagation();

  const confirmed = confirm(`"${fileName}"\n\n정말 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`);
  if (!confirmed) return;

  try {
    await gasPost({ action: 'deleteItem', fileId });
    loadFiles();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
    console.error('Delete error:', e);
  }
};

// ===============================
// UPLOAD (직접 Drive API - 로그인 브라우저 세션 활용)
// ===============================
window.handleUploadWrapper = async function (input) {
  if (!input.files || input.files.length === 0) return;

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
};

async function uploadFile(file) {
  let token = sessionStorage.getItem('drive_access_token');
  const tokenExp = Number(sessionStorage.getItem('drive_token_exp') || 0);

  // ✅ 토큰 없거나 만료 → 인증 후 자동으로 업로드까지 완료 (return 없음)
  if (!token || tokenExp < Date.now()) {
    token = await requestUploadToken();
    if (!token) return; // 사용자가 인증 취소한 경우
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({
    name: file.name,
    parents: [driveState.currentFolderId]
  })], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || '업로드 실패');
  }

  loadFiles();
}

// ✅ 토큰 취득 후 토큰 값 직접 반환 → 인증 직후 바로 업로드 진행
let _uploadTokenClient = null;

function requestUploadToken() {
  return new Promise((resolve) => {
    const UPLOAD_CLIENT_ID = '447245019645-3jouqsueg0foed18d8iosmrtpcocbt1c.apps.googleusercontent.com';

    if (!UPLOAD_CLIENT_ID || UPLOAD_CLIENT_ID === 'YOUR_OAUTH_CLIENT_ID_HERE') {
      alert('업로드 기능을 사용하려면 drive-gallery.js의 UPLOAD_CLIENT_ID를 설정해 주세요.');
      resolve(null);
      return;
    }

    const initAndRequest = () => {
      if (!_uploadTokenClient) {
        _uploadTokenClient = google.accounts.oauth2.initTokenClient({
          client_id: UPLOAD_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (resp) => {
            if (resp.error) { console.error(resp.error); resolve(null); return; }
            // ✅ sessionStorage 저장 + 토큰 값 직접 반환
            sessionStorage.setItem('drive_access_token', resp.access_token);
            sessionStorage.setItem('drive_token_exp', String(Date.now() + resp.expires_in * 1000));
            resolve(resp.access_token);
          }
        });
      }
      // prompt: '' → 이미 동의한 경우 팝업 없이 조용히 토큰 갱신
      _uploadTokenClient.requestAccessToken({ prompt: '' });
    };

    if (typeof google === 'undefined') {
      loadScript('https://accounts.google.com/gsi/client').then(initAndRequest);
    } else {
      initAndRequest();
    }
  });
}

// ===============================
// CREATE FOLDER (via GAS POST)
// ===============================
window.promptCreateFolder = async function () {
  const name = prompt("새 폴더 이름을 입력하세요:", "새 폴더");
  if (!name || !name.trim()) return;

  try {
    await gasPost({
      action: 'createFolder',
      name: name.trim(),
      parentId: driveState.currentFolderId
    });
    loadFiles();
  } catch (e) {
    alert('폴더 생성 실패: ' + e.message);
    console.error(e);
  }
};

// ===============================
// RENDER
// ===============================
function renderFiles(files, quota) {
  const breadcrumb = renderBreadcrumb();
  const isRoot = driveState.folderStack.length === 0;

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

  const quotaBar = renderQuotaBar(quota);

  const list = files.map(f => {
    const isFolder = f.mimeType === 'application/vnd.google-apps.folder';

    const thumb = isFolder
      ? `<i class="fa-solid fa-folder text-5xl text-amber-400 mb-3 group-hover:text-amber-500 transition-colors drop-shadow-sm"></i>`
      : `<img src="${f.thumbnailLink || f.iconLink || 'https://via.placeholder.com/80?text=No+Thumb'}" class="w-16 h-16 object-cover rounded-2xl mb-3 shadow-sm group-hover:shadow-md transition-shadow bg-slate-100">`;

    const clickAction = isFolder
      ? `onclick="enterFolder('${f.id}','${f.name.replace(/'/g, "\\'")}')"`
      : `onclick="openDriveFile('${f.webViewLink}')"`;

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

      <!-- 상단 헤더 -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 shrink-0">
          <div class="flex items-center gap-3 overflow-hidden">
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
            ${quotaBar}
            <div class="flex items-center gap-3">
              <label for="driveUploadInput" id="uploadLabelBtn" class="cursor-pointer bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2 hover:scale-105 shrink-0 m-0">
                  <i class="fa-solid fa-cloud-arrow-up"></i> 파일 업로드
              </label>
              <input type="file" id="driveUploadInput" class="hidden" onchange="handleUploadWrapper(this)" />

              <button onclick="promptCreateFolder()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all flex items-center gap-2 hover:scale-105 shrink-0 m-0 border-none">
                  <i class="fa-solid fa-folder-plus"></i> 새 폴더
              </button>
            </div>
          </div>
      </div>

      <!-- 파일 그리드 -->
      <div class="flex flex-wrap gap-4 items-start content-start flex-1">
        ${files.length > 0
          ? list
          : '<div class="w-full py-20 flex flex-col items-center justify-center text-slate-400 font-bold"><i class="fa-solid fa-folder-open text-5xl mb-4 opacity-50 block"></i>이 폴더는 비어 있습니다.</div>'
        }
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
    html += ` <i class="fa-solid fa-chevron-right text-[10px] text-slate-300 mx-2"></i>
      <span class="cursor-pointer hover:text-indigo-600 transition-colors truncate max-w-[120px] inline-block align-bottom" onclick="goToIndex(${i})">${f.name}</span>`;
  });

  return `<div class="text-xs font-bold text-slate-500 flex items-center whitespace-nowrap overflow-x-auto custom-scrollbar pb-1">${html}</div>`;
}

// ===============================
// NAVIGATION
// ===============================
window.enterFolder = function (id, name) {
  driveState.folderStack.push({ id, name });
  loadFiles(id);
};

window.goRoot = function () {
  driveState.folderStack = [];
  loadFiles('root');
};

window.goToIndex = function (index) {
  driveState.folderStack = driveState.folderStack.slice(0, index + 1);
  const folder = driveState.folderStack[index];
  loadFiles(folder.id);
};

window.goBack = function () {
  if (driveState.folderStack.length === 0) return;
  driveState.folderStack.pop();

  if (driveState.folderStack.length === 0) {
    loadFiles('root');
  } else {
    const parent = driveState.folderStack[driveState.folderStack.length - 1];
    loadFiles(parent.id);
  }
};

// ===============================
// FILE ACTION
// ===============================
window.openDriveFile = function (url) {
  if (url && url !== 'undefined') window.open(url, '_blank');
};

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
