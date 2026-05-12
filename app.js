// つけ回し管理アプリ (iPad / Safari 想定)
// 個人利用専用 / localStorage 永続化

(() => {
  const STORAGE_KEY = "tsuke-mawashi-v1";

  const defaultState = () => ({
    settings: {
      baseTime: 50,
      rotations: 3,
      setPrice: 5000,
      drinkPrice: 1000,
    },
    girls: [],
    tables: [],
    selectedTableId: null,
    nextGirlId: 1,
    nextTableId: 1,
    nextTableNumber: 1,
  });

  let state = load();
  let pulseHandle = null;
  let dupTimeout = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function fmtTime(seconds) {
    const sign = seconds < 0 ? "-" : "";
    seconds = Math.abs(Math.floor(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return sign + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function fmtClock(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function rotationDurationSec() {
    return Math.round((state.settings.baseTime * 60) / state.settings.rotations);
  }

  // ===== Models =====
  function addGirl(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    state.girls.push({ id: uid("g"), name: trimmed });
    save();
    render();
  }
  function removeGirl(id) {
    state.girls = state.girls.filter((g) => g.id !== id);
    save();
    render();
  }

  function addTable() {
    const number = state.nextTableNumber++;
    const baseSec = state.settings.baseTime * 60;
    const perRot = Math.round(baseSec / state.settings.rotations);
    const rotations = [];
    let offset = 0;
    for (let i = 0; i < state.settings.rotations; i++) {
      rotations.push({
        girlId: null,
        plannedDuration: perRot,
        actualDuration: null,
        plannedStartOffset: offset,
      });
      offset += perRot;
    }
    const id = uid("t");
    state.tables.push({
      id,
      number,
      customerName: "",
      arrivedAt: Date.now(),
      baseTime: state.settings.baseTime,
      rotations,
      drinks: [],
      closed: false,
      currentIndex: 0,
    });
    state.selectedTableId = id;
    save();
    render();
  }

  function selectTable(id) {
    state.selectedTableId = id;
    save();
    render();
  }

  function deleteTable(id) {
    if (!confirm("この卓を削除します。よろしいですか？")) return;
    state.tables = state.tables.filter((t) => t.id !== id);
    if (state.selectedTableId === id) state.selectedTableId = null;
    save();
    render();
  }

  function getTable(id) {
    return state.tables.find((t) => t.id === id);
  }
  function getGirl(id) {
    return state.girls.find((g) => g.id === id);
  }

  // 同じお客様（卓）に同じ女の子を二回つけようとしているかチェック
  function isDuplicateAssignment(table, girlId, rotationIndex) {
    if (!girlId) return false;
    return table.rotations.some((r, i) => i !== rotationIndex && r.girlId === girlId);
  }

  function assignGirl(tableId, rotationIndex, girlId) {
    const t = getTable(tableId);
    if (!t) return;
    if (girlId && isDuplicateAssignment(t, girlId, rotationIndex)) {
      flashDuplicate(girlId);
      return false;
    }
    t.rotations[rotationIndex].girlId = girlId;
    save();
    render();
    return true;
  }

  function flashDuplicate(girlId) {
    document.querySelectorAll(`[data-girl-id="${girlId}"]`).forEach((el) => {
      el.classList.add("duplicate");
    });
    clearTimeout(dupTimeout);
    dupTimeout = setTimeout(() => {
      document.querySelectorAll(".girl-item.duplicate").forEach((el) =>
        el.classList.remove("duplicate")
      );
    }, 700);
  }

  // 回転終了。delaySec が正なら次回転に時間プラス＆総時間延長
  function endRotation(tableId, rotationIndex, delaySec) {
    const t = getTable(tableId);
    if (!t) return;
    const r = t.rotations[rotationIndex];
    const planned = r.plannedDuration;
    r.actualDuration = planned + (delaySec || 0);
    if (delaySec > 0 && rotationIndex + 1 < t.rotations.length) {
      t.rotations[rotationIndex + 1].plannedDuration += delaySec;
    }
    recomputeOffsets(t);
    t.currentIndex = Math.min(rotationIndex + 1, t.rotations.length);
    save();
    render();
  }

  function recomputeOffsets(t) {
    let offset = 0;
    for (let i = 0; i < t.rotations.length; i++) {
      t.rotations[i].plannedStartOffset = offset;
      const dur = t.rotations[i].actualDuration ?? t.rotations[i].plannedDuration;
      offset += dur;
    }
  }

  function totalSessionSec(t) {
    return t.rotations.reduce(
      (acc, r) => acc + (r.actualDuration ?? r.plannedDuration),
      0
    );
  }

  function elapsedSec(t) {
    return Math.floor((Date.now() - t.arrivedAt) / 1000);
  }

  function addDrink(tableId, girlId) {
    const t = getTable(tableId);
    if (!t) return;
    t.drinks.push({ girlId, at: Date.now() });
    save();
    render();
  }
  function removeDrink(tableId, girlId) {
    const t = getTable(tableId);
    if (!t) return;
    const idx = [...t.drinks].reverse().findIndex((d) => d.girlId === girlId);
    if (idx >= 0) {
      const realIdx = t.drinks.length - 1 - idx;
      t.drinks.splice(realIdx, 1);
      save();
      render();
    }
  }

  function totalGirlDrinks(girlId) {
    let n = 0;
    for (const t of state.tables) for (const d of t.drinks) if (d.girlId === girlId) n++;
    return n;
  }

  function billFor(t) {
    const set = state.settings.setPrice;
    const drinks = t.drinks.length * state.settings.drinkPrice;
    return { set, drinks, total: set + drinks };
  }

  // ===== Rendering =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function render() {
    renderTop();
    renderGirls();
    renderTables();
    renderDetail();
    $("#emptyHint").style.display = state.tables.length === 0 ? "block" : "none";
  }

  function renderTop() {
    $("#baseTime").value = String(state.settings.baseTime);
    $("#perRotation").textContent = fmtTime(rotationDurationSec());
  }

  function renderGirls() {
    const ul = $("#girlList");
    ul.innerHTML = "";
    const selectedTable = state.selectedTableId ? getTable(state.selectedTableId) : null;
    const assignedAtSelected = new Set(
      selectedTable ? selectedTable.rotations.map((r) => r.girlId).filter(Boolean) : []
    );

    for (const g of state.girls) {
      const li = document.createElement("li");
      li.className = "girl-item";
      li.dataset.girlId = g.id;
      if (assignedAtSelected.has(g.id)) li.classList.add("assigned");

      const drinks = totalGirlDrinks(g.id);
      li.innerHTML = `
        <button class="del" data-act="delete" aria-label="削除">×</button>
        <span class="name">${escapeHtml(g.name)}</span>
        <span class="drinks">🍹 ${drinks}</span>
      `;
      li.addEventListener("click", (e) => {
        if (e.target.dataset.act === "delete") {
          if (confirm(`「${g.name}」を削除しますか？`)) removeGirl(g.id);
          return;
        }
        if (selectedTable) {
          addDrink(selectedTable.id, g.id);
        } else {
          alert("先に卓を選択してください");
        }
      });
      ul.appendChild(li);
    }
  }

  function renderTables() {
    const grid = $("#tables");
    grid.innerHTML = "";
    for (const t of state.tables) {
      const div = document.createElement("div");
      div.className = "table-card";
      if (state.selectedTableId === t.id) div.classList.add("selected");

      const total = totalSessionSec(t);
      const el = elapsedSec(t);
      const rem = total - el;
      const isActive = !t.closed && el < total;
      const isOver = !t.closed && rem < 0;
      if (isActive) div.classList.add("active");
      if (isOver) div.classList.add("overtime");

      const currentRot = getCurrentRotation(t);
      const currentGirl = currentRot ? getGirl(currentRot.girlId) : null;
      const assigned = t.rotations
        .map((r, i) => {
          const g = getGirl(r.girlId);
          return g ? `${i + 1}.${g.name}` : `${i + 1}.--`;
        })
        .join(" / ");

      const timerText = t.closed ? "閉店" : fmtTime(rem);
      div.innerHTML = `
        <div class="num">卓 ${t.number}</div>
        <div class="cust">${escapeHtml(t.customerName || "お客様")}</div>
        <div class="timer">${timerText}</div>
        <div class="girls"><span class="now-girl">${currentGirl ? escapeHtml(currentGirl.name) : ""}</span><br>${escapeHtml(assigned)}</div>
      `;
      div.addEventListener("click", () => selectTable(t.id));
      grid.appendChild(div);
    }
  }

  function getCurrentRotation(t) {
    for (const r of t.rotations) {
      if (r.actualDuration == null) return r;
    }
    return null;
  }

  function renderDetail() {
    const panel = $("#detailPanel");
    if (!state.selectedTableId) {
      panel.classList.add("hidden");
      return;
    }
    const t = getTable(state.selectedTableId);
    if (!t) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    $("#detailTitle").textContent = `卓 ${t.number}`;
    $("#customerName").value = t.customerName || "";

    const total = totalSessionSec(t);
    const el = elapsedSec(t);
    const rem = total - el;
    $("#elapsed").textContent = fmtTime(el);
    $("#remaining").textContent = fmtTime(rem);
    $("#endAt").textContent = fmtClock(t.arrivedAt + total * 1000);

    // rotations
    const rot = $("#rotations");
    rot.innerHTML = "";
    t.rotations.forEach((r, i) => {
      const div = document.createElement("div");
      div.className = "rotation";
      const isCurrent = r.actualDuration == null && t.rotations.slice(0, i).every((x) => x.actualDuration != null);
      const isDone = r.actualDuration != null;
      const isLate = isDone && r.actualDuration > r.plannedDuration;
      if (isCurrent) div.classList.add("current");
      if (isDone) div.classList.add("done");
      if (isLate) div.classList.add("late");

      const g = getGirl(r.girlId);
      const startOffset = r.plannedStartOffset;
      const dur = r.actualDuration ?? r.plannedDuration;
      const startClock = fmtClock(t.arrivedAt + startOffset * 1000);
      const endClock = fmtClock(t.arrivedAt + (startOffset + dur) * 1000);

      div.innerHTML = `
        <div class="head">
          <span>回転 ${i + 1}${isCurrent ? "（進行中）" : isDone ? "（終了）" : ""}</span>
          <span>${fmtTime(dur)}</span>
        </div>
        <div class="girl-pick">
          <div class="pick ${g ? "set" : ""}" data-act="pick" data-idx="${i}">
            ${g ? escapeHtml(g.name) : "＋ 女の子を選択"}
          </div>
        </div>
        <div class="span">${startClock} → ${endClock}${isLate ? `（+${fmtTime(r.actualDuration - r.plannedDuration)} 遅延）` : ""}</div>
        ${isCurrent ? `
          <div class="actions">
            <button data-act="end" data-idx="${i}" class="end">時間通り終了</button>
            <button data-act="late" data-idx="${i}" data-min="1">+1分遅延で終了</button>
            <button data-act="late" data-idx="${i}" data-min="2">+2分</button>
            <button data-act="late" data-idx="${i}" data-min="5">+5分</button>
            <button data-act="late-custom" data-idx="${i}">+遅延入力</button>
          </div>
        ` : ""}
      `;

      div.addEventListener("click", (e) => {
        const act = e.target.dataset.act;
        const idx = parseInt(e.target.dataset.idx, 10);
        if (act === "pick") openGirlPicker(t.id, idx);
        else if (act === "end") endRotation(t.id, idx, 0);
        else if (act === "late") {
          const min = parseInt(e.target.dataset.min, 10);
          endRotation(t.id, idx, min * 60);
        } else if (act === "late-custom") {
          const v = prompt("遅延分数を入力（分単位、小数可）", "1");
          const n = parseFloat(v);
          if (!isNaN(n) && n >= 0) endRotation(t.id, idx, Math.round(n * 60));
        }
      });
      rot.appendChild(div);
    });

    // drinks summary (per assigned girl)
    const ds = $("#drinkSummary");
    ds.innerHTML = "";
    const assignedGirlIds = Array.from(new Set(t.rotations.map((r) => r.girlId).filter(Boolean)));
    if (assignedGirlIds.length === 0 && t.drinks.length === 0) {
      ds.innerHTML = `<div class="hint">女の子をつけてから、左側の女の子をタップでドリンク追加</div>`;
    }
    for (const gid of assignedGirlIds) {
      const g = getGirl(gid);
      if (!g) continue;
      const cnt = t.drinks.filter((d) => d.girlId === gid).length;
      const row = document.createElement("div");
      row.className = "drink-row";
      row.innerHTML = `
        <span>${escapeHtml(g.name)}</span>
        <span>
          <button class="icon-btn" data-act="dec" data-gid="${gid}">－</button>
          <span class="count">${cnt}</span>
          <button class="icon-btn" data-act="inc" data-gid="${gid}">＋</button>
        </span>
      `;
      row.addEventListener("click", (e) => {
        const act = e.target.dataset.act;
        const gid = e.target.dataset.gid;
        if (act === "inc") addDrink(t.id, gid);
        else if (act === "dec") removeDrink(t.id, gid);
      });
      ds.appendChild(row);
    }
    // unassigned drinks (drinks for girls no longer assigned)
    const unassignedDrinks = t.drinks.filter((d) => !assignedGirlIds.includes(d.girlId));
    if (unassignedDrinks.length > 0) {
      const byGirl = {};
      for (const d of unassignedDrinks) byGirl[d.girlId] = (byGirl[d.girlId] || 0) + 1;
      for (const gid of Object.keys(byGirl)) {
        const g = getGirl(gid);
        if (!g) continue;
        const row = document.createElement("div");
        row.className = "drink-row";
        row.style.opacity = "0.7";
        row.innerHTML = `<span>${escapeHtml(g.name)}（未配置）</span><span class="count">${byGirl[gid]}</span>`;
        ds.appendChild(row);
      }
    }

    // bill
    const b = billFor(t);
    $("#bill").innerHTML = `
      <div class="line"><span>セット料金（${t.baseTime}分基準）</span><span>¥${b.set.toLocaleString()}</span></div>
      <div class="line"><span>ドリンク（${t.drinks.length}杯 × ¥${state.settings.drinkPrice.toLocaleString()}）</span><span>¥${b.drinks.toLocaleString()}</span></div>
      <div class="total"><span>合計</span><span>¥${b.total.toLocaleString()}</span></div>
    `;
  }

  function openGirlPicker(tableId, rotationIndex) {
    const t = getTable(tableId);
    if (!t) return;
    const usedIds = new Set(
      t.rotations.map((r, i) => (i !== rotationIndex ? r.girlId : null)).filter(Boolean)
    );
    const currentId = t.rotations[rotationIndex].girlId;

    const grid = state.girls
      .map((g) => {
        const dup = usedIds.has(g.id);
        const isCurrent = g.id === currentId;
        let cls = "opt";
        if (dup) cls += " dup";
        if (isCurrent) cls += " now";
        return `<div class="${cls}" data-gid="${g.id}" data-dup="${dup}">${escapeHtml(g.name)}${dup ? " ⚠" : ""}</div>`;
      })
      .join("");

    const dupHint = state.girls.some((g) => usedIds.has(g.id))
      ? `<div class="opt warn-msg">⚠ 赤い女の子は同じお客様にすでに付いています</div>`
      : "";

    openModal(`
      <h3>女の子を選択（回転 ${rotationIndex + 1}）</h3>
      <div class="girl-picker">
        ${grid}
        ${dupHint}
        <div class="opt clear" data-clear="1">未割当に戻す</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-close="1">キャンセル</button>
      </div>
    `, (root) => {
      root.querySelectorAll(".girl-picker .opt").forEach((el) => {
        el.addEventListener("click", () => {
          if (el.dataset.clear) {
            assignGirl(tableId, rotationIndex, null);
            closeModal();
            return;
          }
          if (!el.dataset.gid) return;
          if (el.dataset.dup === "true") {
            el.classList.add("dup");
            return;
          }
          const ok = assignGirl(tableId, rotationIndex, el.dataset.gid);
          if (ok) closeModal();
        });
      });
      root.querySelectorAll("[data-close]").forEach((el) =>
        el.addEventListener("click", closeModal)
      );
    });
  }

  // ===== Modal =====
  function openModal(html, mount) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal"><div class="modal-box">${html}</div></div>`;
    const overlay = root.querySelector(".modal");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    if (mount) mount(root.querySelector(".modal-box"));
  }
  function closeModal() {
    $("#modalRoot").innerHTML = "";
  }

  function openAddGirl() {
    openModal(`
      <h3>女の子を追加</h3>
      <div class="field">
        <label>名前</label>
        <input type="text" id="newGirlName" autofocus />
      </div>
      <div class="actions">
        <button class="btn ghost" data-close="1">キャンセル</button>
        <button class="btn" id="confirmAddGirl">追加</button>
      </div>
    `, (root) => {
      root.querySelector("#confirmAddGirl").addEventListener("click", () => {
        const v = root.querySelector("#newGirlName").value;
        if (v.trim()) {
          addGirl(v);
          closeModal();
        }
      });
      root.querySelector("#newGirlName").addEventListener("keydown", (e) => {
        if (e.key === "Enter") root.querySelector("#confirmAddGirl").click();
      });
      root.querySelectorAll("[data-close]").forEach((el) =>
        el.addEventListener("click", closeModal)
      );
    });
  }

  function openSettings() {
    openModal(`
      <h3>設定</h3>
      <div class="field">
        <label>セット料金（円）</label>
        <input type="number" id="setPrice" value="${state.settings.setPrice}" />
      </div>
      <div class="field">
        <label>ドリンク単価（円）</label>
        <input type="number" id="drinkPrice" value="${state.settings.drinkPrice}" />
      </div>
      <div class="field">
        <label>回転数</label>
        <input type="number" id="rotations" value="${state.settings.rotations}" min="1" max="6" />
      </div>
      <div class="actions">
        <button class="btn ghost" data-close="1">閉じる</button>
        <button class="btn" id="saveSettings">保存</button>
      </div>
      <div class="field" style="margin-top:18px">
        <button class="btn danger" id="resetAll">すべてリセット</button>
      </div>
    `, (root) => {
      root.querySelector("#saveSettings").addEventListener("click", () => {
        state.settings.setPrice = Math.max(0, parseInt(root.querySelector("#setPrice").value, 10) || 0);
        state.settings.drinkPrice = Math.max(0, parseInt(root.querySelector("#drinkPrice").value, 10) || 0);
        state.settings.rotations = Math.max(1, Math.min(6, parseInt(root.querySelector("#rotations").value, 10) || 3));
        save();
        render();
        closeModal();
      });
      root.querySelector("#resetAll").addEventListener("click", () => {
        if (confirm("すべてのデータを削除します。よろしいですか？")) {
          state = defaultState();
          save();
          render();
          closeModal();
        }
      });
      root.querySelectorAll("[data-close]").forEach((el) =>
        el.addEventListener("click", closeModal)
      );
    });
  }

  // ===== Utilities =====
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ===== Event wiring =====
  document.addEventListener("DOMContentLoaded", () => {
    $("#addGirlBtn").addEventListener("click", openAddGirl);
    $("#addTableBtn").addEventListener("click", addTable);
    $("#settingsBtn").addEventListener("click", openSettings);
    $("#baseTime").addEventListener("change", (e) => {
      state.settings.baseTime = parseInt(e.target.value, 10);
      save();
      render();
    });
    $("#closeDetail").addEventListener("click", () => {
      state.selectedTableId = null;
      save();
      render();
    });
    $("#customerName").addEventListener("input", (e) => {
      const t = getTable(state.selectedTableId);
      if (!t) return;
      t.customerName = e.target.value;
      save();
      renderTables();
    });
    $("#closeTableBtn").addEventListener("click", () => {
      const t = getTable(state.selectedTableId);
      if (!t) return;
      const b = billFor(t);
      if (confirm(`卓 ${t.number} を退店処理します。\n合計 ¥${b.total.toLocaleString()} でよろしいですか？`)) {
        t.closed = true;
        state.selectedTableId = null;
        save();
        render();
      }
    });
    $("#deleteTableBtn").addEventListener("click", () => {
      if (state.selectedTableId) deleteTable(state.selectedTableId);
    });

    render();
    // 1秒タイマで残時間更新
    setInterval(() => {
      if (state.tables.length > 0) {
        renderTables();
        if (state.selectedTableId) {
          const t = getTable(state.selectedTableId);
          if (t) {
            const total = totalSessionSec(t);
            const el = elapsedSec(t);
            $("#elapsed").textContent = fmtTime(el);
            $("#remaining").textContent = fmtTime(total - el);
          }
        }
      }
    }, 1000);
  });
})();
