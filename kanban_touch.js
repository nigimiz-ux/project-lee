// ============================================================
// Kanban & Vault - 하이브리드 (PC 드래그 + 모바일 좌우 버튼)
// ============================================================

function initKanban() {
  if (!currentUser) {
    document.getElementById('col-todo').innerHTML =
      '<p class="text-xs text-rose-500 text-center mt-5 font-bold">로그인해 주세요!</p>';
    return;
  }

  db.ref(`users/${currentUser.uid}/tasks`).on('value', (snapshot) => {
    const todoCol = document.getElementById('col-todo');
    const doingCol = document.getElementById('col-doing');
    const doneCol = document.getElementById('col-done');
    if (!todoCol) return;

    todoCol.innerHTML = '';
    doingCol.innerHTML = '';
    doneCol.innerHTML = '';

    boardData = snapshot.val() || {};

    Object.keys(boardData).forEach(key => {
      const task = boardData[key];
      const card = document.createElement('div');

      card.className =
        'kanban-card bg-white p-4 rounded-xl shadow-sm border border-slate-100 ' +
        'cursor-grab active:cursor-grabbing hover:shadow-md transition relative group';
      card.dataset.key = key;
      card.setAttribute('oncontextmenu', 'return false;');

      // 1. 상세 내용 배지 (오류 났던 부분을 안전하게 분리)
      let detailHTML = '';
      if (task.partner || task.equipment || task.notes) {
        detailHTML = '<p class="text-[10px] text-indigo-500 mb-2 font-bold pointer-events-none"><i class="fa-solid fa-message mr-1"></i>상세 내용</p>';
      }

      // 2. 좌우 이동 버튼 로직 (계획엔 < 없음, 완료엔 > 없음)
      const leftBtn = task.status !== 'todo'
        ? `<button onclick="moveTask('${key}', '${task.status}', 'left')" class="hover:bg-slate-200 text-slate-500 w-5 h-5 rounded transition z-10 relative flex items-center justify-center"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>`
        : ``;

      const rightBtn = task.status !== 'done'
        ? `<button onclick="moveTask('${key}', '${task.status}', 'right')" class="hover:bg-slate-200 text-slate-500 w-5 h-5 rounded transition z-10 relative flex items-center justify-center"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>`
        : ``;

      // 3. 카드 HTML 조립
      card.innerHTML = `
        <p class="text-sm font-bold text-slate-800 break-words mb-2 leading-tight pointer-events-none">
          ${task.text}
        </p>
        ${detailHTML}
        <div class="flex justify-between items-center text-[10px] text-slate-400 font-medium mt-3 pt-2 border-t border-slate-50">
          <div class="flex items-center gap-2">
            <div class="flex gap-1 bg-slate-50 p-0.5 rounded-lg border border-slate-100">
              ${leftBtn}
              ${rightBtn}
            </div>
            <span class="pointer-events-none ml-1"><i class="fa-regular fa-clock"></i> ${task.date}</span>
          </div>
          <div class="flex gap-1">
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

      if (task.status === 'todo') todoCol.appendChild(card);
      else if (task.status === 'doing') doingCol.appendChild(card);
      else if (task.status === 'done') doneCol.appendChild(card);
    });

    _initSortable(todoCol, 'todo');
    _initSortable(doingCol, 'doing');
    _initSortable(doneCol, 'done');
  });
}

// ---- 신규 추가: 모바일용 좌우 이동 함수 ----
function moveTask(key, currentStatus, direction) {
  const statusFlow = ['todo', 'doing', 'done'];
  const currentIndex = statusFlow.indexOf(currentStatus);
  let newIndex = direction === 'right' ? currentIndex + 1 : currentIndex - 1;

  if (newIndex >= 0 && newIndex < statusFlow.length && currentUser) {
    db.ref(`users/${currentUser.uid}/tasks/${key}`).update({ status: statusFlow[newIndex] });
  }
}

// ---- PC용 드래그 앤 드롭 (유지) ----
function _initSortable(colEl, status) {
  if (colEl._sortableInstance) {
    colEl._sortableInstance.destroy();
  }
  colEl._sortableInstance = Sortable.create(colEl, {
    group: 'kanban',
    animation: 150,
    ghostClass: 'opacity-30',
    chosenClass: 'ring-2 ring-indigo-400 scale-105',
    dragClass: 'shadow-xl',
    forceFallback: false,
    fallbackOnBody: true,
    scroll: true,
    scrollSensitivity: 60,
    scrollSpeed: 10,
    delayOnTouchOnly: true,
    delay: 150,
    onEnd(evt) {
      const taskKey = evt.item.dataset.key;
      const toColEl = evt.to;
      const colIdMap = { 'col-todo': 'todo', 'col-doing': 'doing', 'col-done': 'done' };
      const newStatus = colIdMap[toColEl.id];
      if (taskKey && newStatus && currentUser) {
        db.ref(`users/${currentUser.uid}/tasks/${taskKey}`).update({ status: newStatus });
      }
    }
  });
}

// ============================================================
// 기존 기능들 (금고, 모달 등)
// ============================================================

function initVault() {
  if (!currentUser) {
    document.getElementById('vaultTableBody').innerHTML = '<tr><td colspan="4" class="p-8 text-center text-rose-500 font-bold"><i class="fa-solid fa-lock mr-2"></i>권한이 없습니다.</td></tr>';
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
      'todo': '<span class="bg-rose-500/20 text-rose-400 px-2 py-1 rounded-md text-xs font-bold">계획</span>',
      'doing': '<span class="bg-amber-500/20 text-amber-400 px-2 py-1 rounded-md text-xs font-bold">진행 중</span>',
      'done': '<span class="bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md text-xs font-bold">완료</span>'
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
  document.getElementById('modalTitle').innerText = task.text;
  document.getElementById('modalPartner').value = task.partner || '';
  document.getElementById('modalEquipment').value = task.equipment || '';
  document.getElementById('modalNotes').value = task.notes || '';
  const modal = document.getElementById('taskModal');
  const modalBox = document.getElementById('taskModalBox');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modalBox.classList.remove('scale-95');
    modalBox.classList.add('scale-100');
  }, 10);
}

function closeModal() {
  const modal = document.getElementById('taskModal');
  const modalBox = document.getElementById('taskModalBox');
  modal.classList.add('opacity-0');
  modalBox.classList.remove('scale-100');
  modalBox.classList.add('scale-95');
  setTimeout(() => { modal.classList.add('hidden'); currentEditKey = null; }, 300);
}

function saveTaskDetails() {
  if (!currentEditKey || !currentUser) return;
  db.ref(`users/${currentUser.uid}/tasks/${currentEditKey}`).update({
    partner: document.getElementById('modalPartner').value,
    equipment: document.getElementById('modalEquipment').value,
    notes: document.getElementById('modalNotes').value
  }).then(() => closeModal());
}

function addNewTask() {
  if (!currentUser) return;
  const taskText = prompt("어떤 업무를 계획 중이신가요?");
  if (!taskText || taskText.trim() === "") return;
  db.ref(`users/${currentUser.uid}/tasks`).push({
    text: taskText,
    status: 'todo',
    date: new Date().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  });
}

function deleteTask(taskKey) {
  if (confirm("삭제하시겠습니까?"))
    db.ref(`users/${currentUser.uid}/tasks/${taskKey}`).remove();
}