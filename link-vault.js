/**
 * Link Vault (알고리즘 컷아웃 보관함)
 * 단일 모듈 파일 — link-vault.js
 * 사용법: LinkVault.load() 를 호출하면 #contentArea 에 렌더링됩니다.
 * 전제: window.db (Firestore 인스턴스) 가 전역에 초기화되어 있어야 합니다.
 */

const LinkVault = (() => {
  /* ─────────────────────────────────────────
   * 1. 스타일 주입
   * ───────────────────────────────────────── */
  const injectStyles = () => {
    if (document.getElementById("lv-styles")) return;
    const style = document.createElement("style");
    style.id = "lv-styles";
    style.textContent = `
      /* ── 폰트 ── */
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;700;800&display=swap');

      /* ── 루트 변수 ── */
      #lv-root {
        --lv-bg:        #0d0f14;
        --lv-surface:   #141720;
        --lv-border:    #1e2330;
        --lv-border-hi: #2e3550;
        --lv-accent:    #4f7cff;
        --lv-accent-dim:#1e2e5c;
        --lv-green:     #2ddf8a;
        --lv-green-dim: #0e3322;
        --lv-text:      #c8cedd;
        --lv-text-dim:  #5a6278;
        --lv-text-hi:   #edf0f7;
        --lv-youtube:   #ff4e4e;
        --lv-radius:    10px;
        --lv-font-ui:   'Syne', sans-serif;
        --lv-font-mono: 'JetBrains Mono', monospace;
        font-family: var(--lv-font-ui);
        color: var(--lv-text);
        background: var(--lv-bg);
        min-height: 100%;
        padding: 32px 24px 60px;
        box-sizing: border-box;
      }

      /* ── 헤더 ── */
      #lv-root .lv-header {
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 32px;
      }
      #lv-root .lv-header h1 {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--lv-text-hi);
        letter-spacing: -0.03em;
        margin: 0;
      }
      #lv-root .lv-header span {
        font-size: 0.72rem;
        font-family: var(--lv-font-mono);
        color: var(--lv-text-dim);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      /* ── 입력 카드 ── */
      #lv-root .lv-input-card {
        background: var(--lv-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-radius);
        padding: 20px;
        margin-bottom: 28px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: border-color 0.2s;
      }
      #lv-root .lv-input-card:focus-within {
        border-color: var(--lv-border-hi);
      }

      #lv-root .lv-input-row {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      #lv-root .lv-input {
        flex: 1;
        background: var(--lv-bg);
        border: 1px solid var(--lv-border);
        border-radius: 6px;
        color: var(--lv-text-hi);
        font-family: var(--lv-font-mono);
        font-size: 0.82rem;
        padding: 10px 14px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      #lv-root .lv-input::placeholder {
        color: var(--lv-text-dim);
      }
      #lv-root .lv-input:focus {
        border-color: var(--lv-accent);
        box-shadow: 0 0 0 3px var(--lv-accent-dim);
      }
      #lv-root #lv-url-input {
        font-size: 0.85rem;
      }

      /* ── 저장 버튼 ── */
      #lv-root .lv-save-btn {
        flex-shrink: 0;
        background: var(--lv-accent);
        color: #fff;
        border: none;
        border-radius: 6px;
        font-family: var(--lv-font-ui);
        font-weight: 700;
        font-size: 0.82rem;
        letter-spacing: 0.04em;
        padding: 10px 20px;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
      }
      #lv-root .lv-save-btn:hover {
        background: #3a67f5;
        box-shadow: 0 4px 16px rgba(79,124,255,0.35);
      }
      #lv-root .lv-save-btn:active {
        transform: scale(0.97);
      }
      #lv-root .lv-save-btn:disabled {
        background: var(--lv-border-hi);
        cursor: not-allowed;
        box-shadow: none;
      }

      /* ── 섹션 레이블 ── */
      #lv-root .lv-section-label {
        font-family: var(--lv-font-mono);
        font-size: 0.68rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--lv-text-dim);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #lv-root .lv-section-label::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--lv-border);
      }

      /* ── 리스트 ── */
      #lv-root .lv-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* ── 아이템 ── */
      #lv-root .lv-item {
        background: var(--lv-surface);
        border: 1px solid var(--lv-border);
        border-radius: var(--lv-radius);
        padding: 14px 16px;
        display: flex;
        align-items: center;
        gap: 14px;
        animation: lv-fadein 0.25s ease;
        transition: border-color 0.2s, background 0.2s;
      }
      #lv-root .lv-item:hover {
        border-color: var(--lv-border-hi);
        background: #181c26;
      }

      @keyframes lv-fadein {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* 아이콘 */
      #lv-root .lv-icon {
        font-size: 1.2rem;
        flex-shrink: 0;
        line-height: 1;
      }

      /* 본문 */
      #lv-root .lv-item-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      #lv-root .lv-item-url {
        font-family: var(--lv-font-mono);
        font-size: 0.78rem;
        color: var(--lv-accent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-decoration: none;
      }
      #lv-root .lv-item-url:hover {
        text-decoration: underline;
        color: #7fa5ff;
      }
      #lv-root .lv-item-memo {
        font-size: 0.78rem;
        color: var(--lv-text-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #lv-root .lv-item-date {
        font-family: var(--lv-font-mono);
        font-size: 0.65rem;
        color: var(--lv-text-dim);
        opacity: 0.6;
      }

      /* 완료 버튼 */
      #lv-root .lv-done-btn {
        flex-shrink: 0;
        background: transparent;
        border: 1px solid var(--lv-green-dim);
        border-radius: 6px;
        color: var(--lv-green);
        font-family: var(--lv-font-ui);
        font-weight: 700;
        font-size: 0.73rem;
        letter-spacing: 0.03em;
        padding: 7px 12px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, transform 0.1s;
        white-space: nowrap;
      }
      #lv-root .lv-done-btn:hover {
        background: var(--lv-green-dim);
        border-color: var(--lv-green);
      }
      #lv-root .lv-done-btn:active {
        transform: scale(0.95);
      }

      /* 빈 상태 */
      #lv-root .lv-empty {
        text-align: center;
        padding: 48px 0;
        color: var(--lv-text-dim);
        font-size: 0.85rem;
        font-family: var(--lv-font-mono);
        letter-spacing: 0.04em;
      }
      #lv-root .lv-empty-icon {
        font-size: 2.4rem;
        display: block;
        margin-bottom: 12px;
        opacity: 0.4;
      }

      /* 로딩 */
      #lv-root .lv-loading {
        text-align: center;
        padding: 36px 0;
        color: var(--lv-text-dim);
        font-family: var(--lv-font-mono);
        font-size: 0.78rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }
      #lv-root .lv-spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 2px solid var(--lv-border-hi);
        border-top-color: var(--lv-accent);
        border-radius: 50%;
        animation: lv-spin 0.7s linear infinite;
        vertical-align: middle;
        margin-right: 8px;
      }
      @keyframes lv-spin {
        to { transform: rotate(360deg); }
      }

      /* 에러 토스트 */
      #lv-toast {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%) translateY(80px);
        background: #2a1a1a;
        border: 1px solid #5c2020;
        color: #ff7070;
        font-family: var(--lv-font-mono);
        font-size: 0.8rem;
        padding: 10px 20px;
        border-radius: 6px;
        z-index: 9999;
        transition: transform 0.25s ease, opacity 0.25s ease;
        opacity: 0;
        pointer-events: none;
        white-space: nowrap;
      }
      #lv-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
  };

  /* ─────────────────────────────────────────
   * 2. 유틸
   * ───────────────────────────────────────── */
  const isYoutube = (url) =>
    /youtube\.com|youtu\.be/.test(url);

  const formatDate = (ts) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString("ko-KR", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  let toastTimer = null;
  const showToast = (msg) => {
    let el = document.getElementById("lv-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "lv-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  };

  /* ─────────────────────────────────────────
   * 3. Firestore CRUD
   * ───────────────────────────────────────── */
  const getCollection = () => window.db.collection("linkVault");

  const fetchItems = async () => {
    const snap = await getCollection()
      .where("isArchived", "==", false)
      .orderBy("createdAt", "desc")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  };

  const addItem = async (url, memo) => {
    const type = isYoutube(url) ? "youtube" : "web";
    await getCollection().add({
      url: url.trim(),
      memo: memo.trim(),
      type,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      isArchived: false,
    });
  };

  const archiveItem = async (id) => {
    await getCollection().doc(id).update({ isArchived: true });
  };

  /* ─────────────────────────────────────────
   * 4. 렌더링
   * ───────────────────────────────────────── */
  const renderItem = (item) => {
    const icon = item.type === "youtube" ? "📺" : "📄";
    const div = document.createElement("div");
    div.className = "lv-item";
    div.dataset.id = item.id;

    div.innerHTML = `
      <span class="lv-icon">${icon}</span>
      <div class="lv-item-body">
        <a class="lv-item-url" href="${item.url}" target="_blank" rel="noopener noreferrer"
           title="${item.url}">${item.url}</a>
        ${item.memo ? `<span class="lv-item-memo">${item.memo}</span>` : ""}
        <span class="lv-item-date">${formatDate(item.createdAt)}</span>
      </div>
      <button class="lv-done-btn" data-id="${item.id}">✓ 완료</button>
    `;

    div.querySelector(".lv-done-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "…";
      try {
        await archiveItem(item.id);
        div.style.transition = "opacity 0.3s, transform 0.3s";
        div.style.opacity = "0";
        div.style.transform = "translateX(16px)";
        setTimeout(() => div.remove(), 310);
        // 빈 상태 체크
        setTimeout(() => {
          const list = document.getElementById("lv-list");
          if (list && list.children.length === 0) renderEmpty(list);
        }, 350);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "✓ 완료";
        showToast("오류: " + err.message);
      }
    });

    return div;
  };

  const renderEmpty = (container) => {
    container.innerHTML = `
      <div class="lv-empty">
        <span class="lv-empty-icon">🗂️</span>
        저장된 링크가 없습니다.
      </div>`;
  };

  /* ─────────────────────────────────────────
   * 5. 메인 HTML 조립 & 이벤트 바인딩
   * ───────────────────────────────────────── */
  const buildUI = async () => {
    injectStyles();

    const target = document.getElementById("contentArea") || document.body;
    target.innerHTML = "";

    const root = document.createElement("div");
    root.id = "lv-root";
    root.innerHTML = `
      <div class="lv-header">
        <h1>Link Vault</h1>
        <span>알고리즘 컷아웃 보관함</span>
      </div>

      <div class="lv-input-card">
        <div class="lv-input-row">
          <input id="lv-url-input"  class="lv-input" type="url"
                 placeholder="https://  —  URL을 붙여넣으세요" />
        </div>
        <div class="lv-input-row">
          <input id="lv-memo-input" class="lv-input" type="text"
                 placeholder="한 줄 메모 (선택사항)" />
          <button id="lv-save-btn" class="lv-save-btn">저장</button>
        </div>
      </div>

      <div class="lv-section-label">저장된 링크</div>
      <div id="lv-list" class="lv-list">
        <div class="lv-loading">
          <span class="lv-spinner"></span>불러오는 중
        </div>
      </div>
    `;

    target.appendChild(root);

    /* 저장 버튼 */
    const saveBtn = root.querySelector("#lv-save-btn");
    const urlInput = root.querySelector("#lv-url-input");
    const memoInput = root.querySelector("#lv-memo-input");
    const listEl = root.querySelector("#lv-list");

    const handleSave = async () => {
      const url = urlInput.value.trim();
      if (!url) { showToast("⚠️  URL을 입력하세요."); urlInput.focus(); return; }
      saveBtn.disabled = true;
      saveBtn.textContent = "저장 중…";
      try {
        await addItem(url, memoInput.value);
        urlInput.value = "";
        memoInput.value = "";
        await refreshList(listEl);
      } catch (err) {
        showToast("저장 실패: " + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "저장";
      }
    };

    saveBtn.addEventListener("click", handleSave);

    /* Enter 키 지원 */
    [urlInput, memoInput].forEach((el) =>
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") handleSave(); })
    );

    /* 초기 리스트 로드 */
    await refreshList(listEl);
  };

  const refreshList = async (listEl) => {
    listEl.innerHTML = `<div class="lv-loading"><span class="lv-spinner"></span>불러오는 중</div>`;
    try {
      const items = await fetchItems();
      listEl.innerHTML = "";
      if (items.length === 0) { renderEmpty(listEl); return; }
      items.forEach((item) => listEl.appendChild(renderItem(item)));
    } catch (err) {
      listEl.innerHTML = "";
      showToast("불러오기 실패: " + err.message);
    }
  };

  /* ─────────────────────────────────────────
   * 6. 공개 API
   * ───────────────────────────────────────── */
  return {
    load: buildUI,
  };
})();
window.LinkVault = LinkVault;