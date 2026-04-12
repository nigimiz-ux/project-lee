// ============================================================
// Kanban & Vault - SortableJS 기반 (모바일 터치 완전 지원)
// ============================================================
// 변경 사항 요약:
//   - HTML5 draggable / ondragstart / allowDrop / dropTask 제거
//   - SortableJS CDN 사용 → PC 마우스 + 모바일 터치 모두 지원
//   - Firebase 저장 로직 100% 유지
//   - initKanban() 호출 후 자동으로 Sortable 인스턴스 생성
// ============================================================
//
// ★ index.html <head> 또는 </body> 직전에 아래 한 줄을 추가하세요:
//   <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>
// ============================================================

// --- 전역 변수 (기존 유지) ---
// currentUser, db, boardData, currentEditKey 는 기존 코드 그대로 사용

// ---- 칸반 초기화 (SortableJS 버전) ----
function initKanban() {
  if (!currentUser) {
    document.getElementById('col-todo').innerHTML =
      '<p class="text-xs text-rose-500 text-center mt-5 font-bold">로그인해 주세요!</p>';
    return;
  }

  db.ref(`users/${currentUser.uid}/tasks`).on('value', (snapshot) => {
    const todoCol  = document.getElementById('col-todo');
    const doingCol = document.getElementById('col-doing');
    const doneCol  = document.getElementById('col-done');
    if (!todoCol) return;

    todoCol.innerHTML  = '';
    doingCol.innerHTML = '';
    doneCol.innerHTML  = '';

    boardData = snapshot.val() || {};

    Object.keys(boardData).forEach(key => {
      const task = boardData[key];

      // ★ draggable / ondragstart 제거 → data-key 만 남김
      const card = document.createElement('div');
      card.className =
        'kanban-card bg-white p-4 rounded-xl shadow-sm border border-slate-100 ' +
        'cursor-grab active:cursor-grabbing hover:shadow-md transition relative group';
      card.dataset.key = key;                       // SortableJS가 이 값을 사용
      card.style.cssText = 'touch-action:none; -webkit-touch-callout:none;';
      card.setAttribute('oncontextmenu', 'return false;');

      card.innerHTML = `
        <p class="text-sm font-bold text-slate-800 break-words mb-2 leading-tight pointer-events-none">
          ${task.text}
        </p>
        ${(task.partner || task.equipment || task.notes)
          ? '<p class="text-[10px] text-indigo-500 mb-2 font-bold pointer-events-none"><i class="fa-solid fa-message mr-1"></i>상세 내용</p>'
          : ''}
        <div class="flex justify-between items-center text-[10px] text-slate-400 font-medium mt-3 pt-2 border-t border-slate-50">
          <span class="pointer-events-none"><i class="fa-regular fa-clock"></i> ${task.date}</span>
          <div class="flex gap-2">
            <button onclick="openModal('${key}')"
              class="bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 w-6 h-6 rounded-md transition relative z-10">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button onclick="deleteTask('${key}')"
              class="bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-500 w-6 h-6 rounded-md transition relative z-10">
              <i class="fa-solid fa-trash text-xs"></i>
            </button>
          </div>
        </div>`;

      if      (task.status === 'todo')  todoCol.appendChild(card);
      else if (task.status === 'doing') doingCol.appendChild(card);
      else if (task.status === 'done')  doneCol.appendChild(card);
    });

    // ---- SortableJS 인스턴스 생성 ----
    // (Firebase 리얼타임 리스너가 컬럼을 다시 그릴 때마다 재생성)
    _initSortable(todoCol,  'todo');
    _initSortable(doingCol, 'doing');
    _initSortable(doneCol,  'done');
  });
}

// ---- SortableJS 내부 헬퍼 ----
function _initSortable(colEl, status) {
  // 기존 인스턴스가 있으면 파괴 후 재생성
  if (colEl._sortableInstance) {
    colEl._sortableInstance.destroy();
  }

  colEl._sortableInstance = Sortable.create(colEl, {
    group: 'kanban',          // 같은 group이면 컬럼 간 이동 가능
    animation: 150,           // 드래그 애니메이션 (ms)
    ghostClass: 'opacity-30', // Tailwind 유틸리티 그대로 사용
    chosenClass: 'ring-2 ring-indigo-400 scale-105',
    dragClass: 'shadow-xl',

    // 터치 디바이스 설정
    forceFallback: false,     // SortableJS 기본 터치 감지 사용
    fallbackOnBody: true,     // 터치 드래그 중 body에 ghost 붙임
    scroll: true,             // 드래그 중 자동 스크롤
    scrollSensitivity: 60,
    scrollSpeed: 10,
    delayOnTouchOnly: true,   // 터치에서만 딜레이 적용 (실수 드래그 방지)
    delay: 150,               // 150ms 길게 누르면 드래그 시작

    // 드래그 완료 시 Firebase 업데이트
    onEnd(evt) {
      const taskKey   = evt.item.dataset.key;
      const toColEl   = evt.to;

      // 컬럼 엘리먼트의 id로 새 status 결정
      const colIdMap  = {
        'col-todo':  'todo',
        'col-doing': 'doing',
        'col-done':  'done'
      };
      const newStatus = colIdMap[toColEl.id];

      if (taskKey && newStatus && currentUser) {
        db.ref(`users/${currentUser.uid}/tasks/${taskKey}`)
          .update({ status: newStatus });
      }
    }
  });
}

// ============================================================
// 아래 함수들은 기존 코드와 완전히 동일 (변경 없음)
// ============================================================

function initVault() {
  if (!currentUser) {
    document.getElementById('vaultTableBody').innerHTML =
      '<tr><td colspan="4" class="p-8 text-center text-rose-500 font-bold">' +
      '<i class="fa-solid fa-lock mr-2"></i>권한이 없습니다.</td></tr>';
    return;
  }
  db.ref(`users/${currentUser.uid}/tasks`).once('value').then((snapshot) => {
    const tbody = document.getElementById('vaultTableBody');
    if (!tbody) return;
    boardData = snapshot.val() || {};
    if (Object.keys(boardData).length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500">데이터가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    const statusHTML = {
      'todo':  '<span class="bg-rose-500/20 text-rose-400 px-2 py-1 rounded-md text-xs font-bold">계획</span>',
      'doing': '<span class="bg-amber-500/20 text-amber-400 px-2 py-1 rounded-md text-xs font-bold">진행 중</span>',
      'done':  '<span class="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md text-xs font-bold">완료</span>'
    };
    Object.keys(boardData).forEach(key => {
      const task = boardData[key];
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-700/50 transition";
      tr.innerHTML =
        `<td class="p-4 font-bold text-slate-200">${task.text}</td>` +
        `<td class="p-4">${statusHTML[task.status] || task.status}</td>` +
        `<td class="p-4 text-slate-400 font-mono text-xs">${task.date}</td>` +
        `<td class="p-4 text-slate-300 text-xs">${task.partner || '-'}</td>`;
      tbody.appendChild(tr);
    });
  });
}

function exportToCSV() {
  if (!currentUser || Object.keys(boardData).length === 0) return alert("데이터가 없습니다.");
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF업무명,상태,생성일,협력업체,기자재,메모\n";
  Object.keys(boardData).forEach(key => {
    const t = boardData[key];
    const escapeCSV = (str) => '"' + String(str || "").replace(/"/g, '""') + '"';
    csvContent +=
      `${escapeCSV(t.text)},` +
      `${t.status === 'todo' ? '계획' : (t.status === 'doing' ? '진행중' : '완료')},` +
      `${escapeCSV(t.date)},${escapeCSV(t.partner)},${escapeCSV(t.equipment)},${escapeCSV(t.notes)}\n`;
  });
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `ProjectLEE_DB_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function openModal(key) {
  currentEditKey = key;
  const task = boardData[key];
  document.getElementById('modalTitle').innerText   = task.text;
  document.getElementById('modalPartner').value     = task.partner   || '';
  document.getElementById('modalEquipment').value   = task.equipment || '';
  document.getElementById('modalNotes').value       = task.notes     || '';
  const modal    = document.getElementById('taskModal');
  const modalBox = document.getElementById('taskModalBox');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modalBox.classList.remove('scale-95');
    modalBox.classList.add('scale-100');
  }, 10);
}

function closeModal() {
  const modal    = document.getElementById('taskModal');
  const modalBox = document.getElementById('taskModalBox');
  modal.classList.add('opacity-0');
  modalBox.classList.remove('scale-100');
  modalBox.classList.add('scale-95');
  setTimeout(() => { modal.classList.add('hidden'); currentEditKey = null; }, 300);
}

function saveTaskDetails() {
  if (!currentEditKey || !currentUser) return;
  db.ref(`users/${currentUser.uid}/tasks/${currentEditKey}`).update({
    partner:   document.getElementById('modalPartner').value,
    equipment: document.getElementById('modalEquipment').value,
    notes:     document.getElementById('modalNotes').value
  }).then(() => closeModal());
}

function addNewTask() {
  if (!currentUser) return;
  const taskText = prompt("어떤 업무를 계획 중이신가요?");
  if (!taskText || taskText.trim() === "") return;
  db.ref(`users/${currentUser.uid}/tasks`).push({
    text:   taskText,
    status: 'todo',
    date:   new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  });
}

function deleteTask(taskKey) {
  if (confirm("삭제하시겠습니까?"))
    db.ref(`users/${currentUser.uid}/tasks/${taskKey}`).remove();
}

// ★ 아래 함수들은 SortableJS로 대체되었으므로 더 이상 사용하지 않습니다.
// dragTask / allowDrop / dropTask → 삭제해도 무방합니다.
