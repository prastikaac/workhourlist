// ============================================================
//  WorkTrack — script.js
//  Firebase Firestore v11 · Real-time · CRUD · Export
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocs,
  where
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ── Firebase Init ──────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAnBX2gLAo9aZRC8suyRNICRjoOUK4gp-4",
  authDomain: "real-time-prasiddha.firebaseapp.com",
  databaseURL: "https://real-time-prasiddha-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "real-time-prasiddha",
  storageBucket: "real-time-prasiddha.firebasestorage.app",
  messagingSenderId: "713785938695",
  appId: "1:713785938695:web:a9aa397c252a9eb9e9eba2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ── State ──────────────────────────────────────────────────
let allRecords = [];   // raw Firestore docs
let filteredRecords = [];  // after applying filters
let pendingDeleteId = null; // doc id waiting for confirm
let allActivities = []; // activity logs
let allNotes = [];         // workNotes docs — for pending-note auto-fill

// ── Activity Helper ───────────────────────────────────────
  async function logActivity(action, message, location = "") {
    try {
      const currentUser = localStorage.getItem('wt-logged-in-user') || 'worker';
      await addDoc(collection(db, "activityLogs"), {
        action,
        message,
        location,
        addedBy: currentUser,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to log activity", e);
    }
  }

  // ── DOM helpers ───────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  };

  // ── Page Init ─────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    checkAuth();
  });

  // ── Set tomorrow's date as default ────────────────────────
  function setDefaultDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    $("date").value = toISODate(tomorrow);

    if ($("qDate")) {
      $("qDate").value = toISODate(new Date());
    }

    if ($("noteDate")) {
      $("noteDate").value = toISODate(new Date());
    }
  }

  function toISODate(d) {
    // Use LOCAL date components — toISOString() would give UTC which is wrong for Finland (UTC+3)
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Theme ─────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem("wt-theme") || "light";
    applyTheme(saved);
  }

  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  };

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("wt-theme", theme);
    const isDark = theme === "dark";
    const icon = isDark ? "ri-sun-line" : "ri-moon-line";
    const label = isDark ? "Light Mode" : "Dark Mode";
    ["themeIcon", "themeIconMobile"].forEach(id => {
      const el = $(id);
      if (el) { el.className = icon; }
    });
    const lbl = $("themeLabel");
    if (lbl) lbl.textContent = label;
  }

  // ── Auth ──────────────────────────────────────────────────
  function isAdminUser() {
    return localStorage.getItem('wt-user-role') === 'admin';
  }

  function getUserRecordsCollectionName(username) {
    const user = username || localStorage.getItem('wt-logged-in-user') || '';
    if (!user || user === 'admin' || user === 'prastika' || isAdminUser()) {
      return "workHours";
    }
    return `workHours_${user}`;
  }

  async function sha256(message) {
    if (window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback pure-JS SHA-256 for non-HTTPS / LAN origins
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    const mathPow = Math.pow, maxWord = mathPow(2, 32);
    let result = '';
    const words = [];
    const asciiBitLength = message.length * 8;
    let hash = [], k = [];
    let primeCounter = 0;
    const isComposite = {};
    for (let candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    message += '\x80';
    while (message.length % 64 - 56) message += '\x00';
    for (let i = 0; i < message.length; i++) {
      const j = message.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const oldHash = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }

  function checkAuth() {
    const user = localStorage.getItem('wt-logged-in-user');
    if (user) {
      hideLoginOverlay(user);
    } else {
      showLoginOverlay();
    }
  }

  function showLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.remove('hidden');
    // Don't init app yet
  }

  function hideLoginOverlay(username) {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    const logoutBtn = document.getElementById('logoutBtn');
    const changePwBtn = document.getElementById('changePwBtn');
    const loggedInUser = document.getElementById('loggedInUser');
    const navAdmin = document.getElementById('nav-admin');
    const navApprovals = document.getElementById('nav-approvals');
    const adminApprovalsCard = document.getElementById('adminApprovalsCard');
    const filterWorkerGroup = document.getElementById('filterWorkerGroup');
    const dTargetWorkerGroup = document.getElementById('dTargetWorkerGroup');
    const qTargetWorkerGroup = document.getElementById('qTargetWorkerGroup');
    if (logoutBtn) logoutBtn.style.display = '';
    if (loggedInUser) loggedInUser.textContent = capitalizeWord(username);
    if (isAdminUser()) {
      if (navAdmin) navAdmin.style.display = '';
      if (navApprovals) navApprovals.style.display = '';
      if (adminApprovalsCard) adminApprovalsCard.classList.remove('hidden');
      if (filterWorkerGroup) filterWorkerGroup.classList.remove('hidden');
      if (dTargetWorkerGroup) dTargetWorkerGroup.classList.remove('hidden');
      if (qTargetWorkerGroup) qTargetWorkerGroup.classList.remove('hidden');
      document.querySelectorAll('.admin-assigned-col').forEach(el => el.classList.remove('hidden'));
      if (changePwBtn) changePwBtn.style.display = 'none';
      subscribeAdminTools();
    } else {
      if (navAdmin) navAdmin.style.display = 'none';
      if (navApprovals) navApprovals.style.display = 'none';
      if (adminApprovalsCard) adminApprovalsCard.classList.add('hidden');
      if (filterWorkerGroup) filterWorkerGroup.classList.add('hidden');
      if (dTargetWorkerGroup) dTargetWorkerGroup.classList.add('hidden');
      if (qTargetWorkerGroup) qTargetWorkerGroup.classList.add('hidden');
      document.querySelectorAll('.admin-assigned-col').forEach(el => el.classList.add('hidden'));
      if (changePwBtn) changePwBtn.style.display = '';
    }
    // Now init the app
    setDefaultDate();
    subscribeFirestore();
    subscribeNotes();
    subscribeActivities();
    setTimeout(updateRecQpLabels, 0);
  }

  window.handleLogin = async function (e) {
    e.preventDefault();
    const rawUsername = document.getElementById('loginUsername').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    const btnText = document.getElementById('loginBtnText');

    errEl.classList.add('hidden');

    // Check built-in admin credentials (accepts 'admin', 'prastika', or any username when using the admin password)
    if (password.trim() === 'Prastika@1216' && (!rawUsername || rawUsername === 'admin' || rawUsername === 'prastika')) {
      const adminUser = rawUsername || 'admin';
      localStorage.setItem('wt-logged-in-user', adminUser);
      localStorage.setItem('wt-user-role', 'admin');
      localStorage.setItem('wt-admin-unlocked', '1');
      hideLoginOverlay(adminUser);
      return;
    }

    const username = rawUsername;
    if (!username || !password) {
      document.getElementById('loginErrorMsg').textContent = 'Please enter username and password.';
      errEl.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btnText.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></div> Signing in…';

    try {
      const hash = await sha256(password);
      const snap = await getDocs(query(collection(db, 'workers'), where('username', '==', username)));
      const matched = snap.docs.some(d => {
        const w = d.data();
        return w.passwordHash === hash || w.password === password;
      });
      if (matched) {
        localStorage.setItem('wt-logged-in-user', username);
        localStorage.setItem('wt-user-role', 'worker');
        hideLoginOverlay(username);
      } else {
        document.getElementById('loginErrorMsg').textContent = 'Invalid username or password.';
        errEl.classList.remove('hidden');
        document.getElementById('loginPassword').value = '';
      }
    } catch (err) {
      console.error(err);
      document.getElementById('loginErrorMsg').textContent = 'Connection error. Try again.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btnText.innerHTML = '<i class="ri-login-circle-line"></i> Sign In';
    }
  };

  window.handleLogout = function () {
    if (!confirm('Are you sure you want to log out?')) return;
    localStorage.removeItem('wt-logged-in-user');
    localStorage.removeItem('wt-user-role');
    localStorage.removeItem('wt-admin-unlocked');
    location.reload();
  };

  window.toggleLoginPw = function () {
    const inp = document.getElementById('loginPassword');
    const icon = document.getElementById('loginEyeIcon');
    if (inp.type === 'password') { inp.type = 'text'; icon.className = 'ri-eye-off-line'; }
    else { inp.type = 'password'; icon.className = 'ri-eye-line'; }
  };

  // ── Worker Change Password Modal ──────────────────────────
  window.openChangePwModal = function () {
    if ($("changePwForm")) $("changePwForm").reset();
    if ($("cpError")) $("cpError").textContent = "";
    ["cpCurrentPw", "cpNewPw", "cpConfirmPw"].forEach((id, idx) => {
      const inp = $(id);
      const ico = $(`cpEye${idx + 1}`);
      if (inp) inp.type = "password";
      if (ico) ico.className = "ri-eye-line";
    });
    if ($("changePwOverlay")) $("changePwOverlay").classList.remove("hidden");
    // Close mobile sidebar if open
    $("sidebar").classList.remove("open");
    $("sidebarOverlay").classList.remove("active");
  };

  window.closeChangePwModal = function () {
    if ($("changePwOverlay")) $("changePwOverlay").classList.add("hidden");
  };

  window.toggleCpEye = function (inputId, iconId) {
    const inp = $(inputId);
    const ico = $(iconId);
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
    if (ico) ico.className = inp.type === "text" ? "ri-eye-off-line" : "ri-eye-line";
  };

  window.handleChangePassword = async function (e) {
    e.preventDefault();
    const currentPw = ($("cpCurrentPw").value || "");
    const newPw = ($("cpNewPw").value || "");
    const confirmPw = ($("cpConfirmPw").value || "");
    const errEl = $("cpError");
    const btn = $("cpSubmitBtn");
    const username = (localStorage.getItem("wt-logged-in-user") || "").trim().toLowerCase();

    if (errEl) errEl.textContent = "";

    if (!currentPw || !newPw || !confirmPw) {
      if (errEl) errEl.textContent = "Please fill in all password fields.";
      return;
    }
    if (newPw.length < 4) {
      if (errEl) errEl.textContent = "New password must be at least 4 characters.";
      return;
    }
    if (newPw !== confirmPw) {
      if (errEl) errEl.textContent = "New password and confirmation do not match.";
      return;
    }

    btn.disabled = true;
    const origText = btn.innerHTML;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-width:2px"></div> Updating…`;

    try {
      const currentHash = await sha256(currentPw);
      const snap = await getDocs(query(collection(db, "workers"), where("username", "==", username)));
      const matchedDoc = snap.docs.find(d => {
        const w = d.data();
        return w.passwordHash === currentHash || w.password === currentPw;
      });

      if (!matchedDoc) {
        if (errEl) errEl.textContent = "Current password is incorrect.";
        return;
      }

      const newHash = await sha256(newPw);
      await updateDoc(doc(db, "workers", matchedDoc.id), {
        passwordHash: newHash,
        updatedAt: serverTimestamp()
      });

      logActivity("EDITED", `Worker ${username} changed their password`);
      showToast("Password updated successfully!", "success");
      closeChangePwModal();
    } catch (err) {
      console.error(err);
      if (errEl) errEl.textContent = "Error updating password. Try again.";
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  };

  // ── Sidebar (mobile) ──────────────────────────────────────
  window.toggleSidebar = function () {
    $("sidebar").classList.toggle("open");
    $("sidebarOverlay").classList.toggle("active");
  };

  // ── Section Navigation ────────────────────────────────────
  window.showSection = function (sectionId, navEl) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    $("section-" + sectionId).classList.add("active");
    if (navEl) navEl.classList.add("active");
    // close mobile sidebar
    $("sidebar").classList.remove("open");
    $("sidebarOverlay").classList.remove("active");
  };

  // ── Form Tabs ─────────────────────────────────────────────
  window.switchFormTab = function (tab) {
    const dForm = $("detailedFormWrapper");
    const qForm = $("quickFormWrapper");
    const dTab = $("tabDetailed");
    const qTab = $("tabQuick");

    if (tab === "quick") {
      dForm.classList.add("hidden");
      qForm.classList.remove("hidden");
      dTab.className = "btn btn-ghost";
      qTab.className = "btn btn-primary";
    } else {
      dForm.classList.remove("hidden");
      qForm.classList.add("hidden");
      dTab.className = "btn btn-primary";
      qTab.className = "btn btn-ghost";
    }
  };

  // ── Dashboard shortcut buttons ──────────────────────
  window.goToWorkingHour = function () {
    showSection('add-entry', $("nav-add"));
    switchFormTab('quick');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.goToNote = function () {
    showSection('notes', $("nav-notes"));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Toggle "Other" text input ────────────────────────────
  window.toggleNoteOther = function (checkbox) {
    const wrapper = $("noteOtherWrapper");
    const input = $("noteOtherText");
    if (checkbox.checked) {
      wrapper.classList.remove("hidden");
      input.focus();
    } else {
      wrapper.classList.add("hidden");
      input.value = "";
    }
  };

  // ── Notes Submit (Add + Edit) ──────────────────────────
  window.handleNoteSubmit = async function (e) {
    e.preventDefault();
    let valid = true;

    let items = [...document.querySelectorAll('input[name="noteItem"]:checked')].map(c => c.value);
    const otherChecked = items.includes("__other__");

    if (otherChecked) {
      const otherText = ($("noteOtherText").value || "").trim();
      if (!otherText) {
        $("noteOtherText").classList.add("error");
        $("noteItemError").textContent = "Please describe the 'Other' item.";
        valid = false;
      } else {
        $("noteOtherText").classList.remove("error");
        items = items.filter(v => v !== "__other__").concat(otherText);
      }
    }

    const locs = [...document.querySelectorAll('input[name="noteLoc"]:checked')].map(c => c.value);
    const date = $("noteDate").value;
    const text = $("noteText").value.trim();

    if (items.length === 0) { $("noteItemError").textContent = "Please select at least one item."; valid = false; }
    else if (valid) { $("noteItemError").textContent = ""; }
    if (locs.length === 0) { $("noteLocError").textContent = "Please select at least one location."; valid = false; }
    else { $("noteLocError").textContent = ""; }
    if (!date) { $("noteDateError").textContent = "Please pick a date."; valid = false; }
    else { $("noteDateError").textContent = ""; }
    if (!valid) return;

    const editId = $("editNoteDocId") ? $("editNoteDocId").value : "";
    const btn = $("noteSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Saving…`;

    try {
      const currentUser = localStorage.getItem('wt-logged-in-user') || 'worker';
      if (editId) {
        await updateDoc(doc(db, "workNotes", editId), { items, locations: locs, date, note: text, addedBy: currentUser, usageCount: 0 });
        logActivity("EDITED", `Updated note: ${items.join(', ')} at ${locs.join(', ')}`, locs.join(', '));
        showToast("Note updated!", "success");
        cancelNoteEdit();
      } else {
        await addDoc(collection(db, "workNotes"), { items, locations: locs, date, note: text, addedBy: currentUser, createdAt: serverTimestamp() });
        logActivity("ADDED", `Added note: ${items.join(', ')} at ${locs.join(', ')}`, locs.join(', '));
        showToast("Note saved!", "success");
      }
      $("noteEntryForm").reset();
      $("noteOtherWrapper").classList.add("hidden");
      if ($("noteOtherText")) $("noteOtherText").value = "";
      if ($("noteDate")) $("noteDate").value = toISODate(new Date());
    } catch (err) {
      console.error(err);
      showToast("Error saving note.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-save-line"></i> <span id="noteSubmitBtnText">${editId ? 'Update Note' : 'Save Note'}</span>`;
      if ($("noteSubmitBtnText")) $("noteSubmitBtnText").textContent = "Save Note";
    }
  };

  // Pre-fill the form to edit an existing note
  window.editNote = function (id) {
    const n = allNotes.find(x => x.id === id);
    if (!n) return;
    // scroll to form
    $("notesFormWrapper").scrollIntoView({ behavior: 'smooth', block: 'start' });
    if ($("noteFormHeading")) $("noteFormHeading").textContent = "Edit Note";
    if ($("noteSubmitBtnText")) $("noteSubmitBtnText").textContent = "Update Note";
    if ($("editNoteDocId")) $("editNoteDocId").value = id;
    if ($("noteCancelEditBtn")) $("noteCancelEditBtn").style.display = "";
    // Set date
    if ($("noteDate")) $("noteDate").value = n.date || "";
    if ($("noteText")) $("noteText").value = n.note || "";
    // Tick item checkboxes
    document.querySelectorAll('input[name="noteItem"]').forEach(cb => {
      cb.checked = (n.items || []).includes(cb.value);
    });
    // Tick location checkboxes
    document.querySelectorAll('input[name="noteLoc"]').forEach(cb => {
      cb.checked = (n.locations || []).includes(cb.value);
    });
  };

  window.cancelNoteEdit = function () {
    if ($("noteFormHeading")) $("noteFormHeading").textContent = "Add Note";
    if ($("noteSubmitBtnText")) $("noteSubmitBtnText").textContent = "Save Note";
    if ($("editNoteDocId")) $("editNoteDocId").value = "";
    if ($("noteCancelEditBtn")) $("noteCancelEditBtn").style.display = "none";
    $("noteEntryForm").reset();
    $("noteOtherWrapper").classList.add("hidden");
    if ($("noteDate")) $("noteDate").value = toISODate(new Date());
  };

  // Mark note as done = delete it immediately
  window.markNoteDone = async function (id) {
    try {
      await deleteDoc(doc(db, "workNotes", id));
      logActivity("DELETED", "Marked note as done and removed it");
      showToast("Note marked as done!", "success");
    } catch (err) {
      console.error(err);
      showToast("Error removing note.", "error");
    }
  };

  // ── Notes Firestore Listener ──────────────────────────
  function subscribeNotes() {
    const q = query(collection(db, "workNotes"), orderBy("date", "desc"));
    onSnapshot(q, snapshot => {
      allNotes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderNotesTable(allNotes);
      if (typeof allRecords !== 'undefined' && typeof renderTodayTable === 'function') {
        renderTodayTable(allRecords);
        renderTomorrowTable(allRecords);
      }
    }, err => {
      console.error("Notes Firestore error:", err);
    });
  }

  // ── Pending-note auto-fill helpers ───────────────────────
  // Build a hint string from notes that are still "pending" (usageCount < 2)
  // for the given array of location names.
  function getPendingNotesHint(locations) {
    const lines = [];
    locations.forEach(loc => {
      const pending = allNotes.filter(n =>
        Array.isArray(n.locations) && n.locations.includes(loc) &&
        (n.usageCount || 0) < 2
      );
      pending.forEach(n => {
        if (n.items && n.items.length) {
          // Format: "[Mayavatie] Trash Bags, Coffee"
          lines.push(`[${loc}] ${n.items.join(', ')}`);
        }
      });
    });
    return lines.join('\n');
  }

  // Pre-fill a notes textarea only if it is currently empty or was previously
  // auto-filled (starts with '[').
  function autoFillPendingNotes(locations, textareaId) {
    const ta = $(textareaId);
    if (!ta) return;
    const current = ta.value;
    // Only overwrite if blank or a previous auto-fill value
    if (current && !current.startsWith('[')) return;
    const hint = getPendingNotesHint(locations);
    ta.value = hint;
    if (hint) {
      ta.classList.add('autofilled-note');
    } else {
      ta.classList.remove('autofilled-note');
      ta.value = '';
    }
  }



  // ── Notes Delete ─────────────────────────────────────────
  let pendingDeleteNoteId = null;

  window.deleteNote = function (docId) {
    pendingDeleteNoteId = docId;
    // Reuse the same confirm dialog
    $("confirmOverlay").classList.remove("hidden");
    $("confirmDeleteBtn").onclick = confirmDeleteNote;
  };

  async function confirmDeleteNote() {
    if (!pendingDeleteNoteId) return;
    const btn = $("confirmDeleteBtn");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      await deleteDoc(doc(db, "workNotes", pendingDeleteNoteId));
      logActivity("DELETED", "Deleted a note entry");
      showToast("Note deleted.", "warning");
    } catch (err) {
      console.error(err);
      showToast("Error deleting note.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete";
      btn.onclick = confirmDelete; // restore original
      pendingDeleteNoteId = null;
      closeConfirm();
    }
  }


  function renderNotesTable(notes) {
    // ── Unified Pending Notes Overview (Dashboard & Notes Tab)
    const pending = notes.filter(n => (n.usageCount || 0) < 2);

    // Update counts
    const notesCount = $("pendingNotesCount");
    const dashCount = $("dashPendingNotesCount");
    if (notesCount) notesCount.textContent = pending.length > 0 ? `${pending.length}` : '';
    if (dashCount) dashCount.textContent = pending.length > 0 ? `${pending.length}` : '';

    // DOM Elements - Notes Tab
    const notesEmpty = $("pendingNotesEmpty");
    const notesContainer = $("pendingNotesListContainer");
    const notesTbody = $("notesPendingTbody");

    // DOM Elements - Dashboard
    const dashEmpty = $('dashPendingNotesEmpty');
    const dashContainer = $('dashPendingNotesList');
    const dashTbody = $('dashPendingNotesTbody');

    if (!pending.length) {
      if (notesEmpty) notesEmpty.classList.remove('hidden');
      if (notesContainer) notesContainer.classList.add('hidden');
      if (dashEmpty) dashEmpty.classList.remove('hidden');
      if (dashContainer) dashContainer.classList.add('hidden');
    } else {
      if (notesEmpty) notesEmpty.classList.add('hidden');
      if (notesContainer) notesContainer.classList.remove('hidden');
      if (dashEmpty) dashEmpty.classList.add('hidden');
      if (dashContainer) dashContainer.classList.remove('hidden');

      // Generate Desktop Table Rows
      const rowsHtml = pending.map(n => {
        const itemBadges = (n.items || []).map(i => `<span class="pnote-item">${escHtml(i)}</span>`).join(' ');
        const locBadges = (n.locations || []).map(l => `<span class="dash-loc-chip"><i class="ri-building-line"></i>${escHtml(l)}</span>`).join(' ');
        const addedByName = getAddedByName(n);
        return `
        <tr>
          <td>${locBadges}</td>
          <td>${itemBadges}</td>
          <td style="max-width:180px;word-break:break-word;">${n.note ? escHtml(n.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
          <td>${formatDate(n.date)}</td>
          <td><span style="font-size:12px;color:var(--clr-text-muted);"><i class="ri-user-line"></i> Added by <strong>${escHtml(addedByName)}</strong></span></td>
          <td>
            <div class="actions-cell">
              <button class="btn btn-success btn-sm" onclick="markNoteDone('${n.id}')"><i class="ri-checkbox-circle-line"></i> Done</button>
              <button class="btn btn-ghost btn-sm" onclick="editNote('${n.id}')"><i class="ri-edit-line"></i></button>
              <button class="btn btn-del btn-sm" onclick="deleteNote('${n.id}')"><i class="ri-delete-bin-6-line"></i></button>
            </div>
          </td>
        </tr>`;
      }).join('');

      if (notesTbody) notesTbody.innerHTML = rowsHtml;
      if (dashTbody) dashTbody.innerHTML = rowsHtml;

      // Generate Mobile Cards
      const cardsHtml = pending.map(n => {
        const itemText = (n.items || []).map(i => `<span class="pnote-item">${escHtml(i)}</span>`).join(' ') || '—';
        const locText = (n.locations || []).join(', ') || '—';
        const addedByName = getAddedByName(n);
        return `
        <div class="work-card">
          <div class="work-card-header">
            <span class="dash-loc-chip"><i class="ri-building-line"></i>${escHtml(locText)}</span>
          </div>
          <div class="work-card-field" style="flex-wrap:wrap; gap:8px;">
            <span class="work-card-label">Items</span>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">${itemText}</div>
          </div>
          ${n.note ? `<div class="work-card-note">${escHtml(n.note)}</div>` : ''}
          <div class="work-card-field">
            <span class="work-card-label">Date</span>
            <span class="work-card-value">${formatDate(n.date)}</span>
          </div>
          <div class="work-card-field">
            <span class="work-card-label"><i class="ri-user-line"></i> User</span>
            <span class="work-card-value" style="font-size:12.5px;color:var(--clr-text-muted);">Added by <strong>${escHtml(addedByName)}</strong></span>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn btn-success btn-sm" onclick="markNoteDone('${n.id}')"><i class="ri-checkbox-circle-line"></i> Done</button>
            <button class="btn btn-ghost btn-sm" onclick="editNote('${n.id}')"><i class="ri-edit-line"></i></button>
            <button class="btn btn-del btn-sm" onclick="deleteNote('${n.id}')"><i class="ri-delete-bin-6-line"></i></button>
          </div>
        </div>`;
      }).join('');

      // Inject mobile cards into Dashboard
      if (dashContainer) {
        const oldDashCards = dashContainer.querySelector('.work-card-list');
        if (oldDashCards) oldDashCards.remove();
        const dashCardsEl = document.createElement('div');
        dashCardsEl.className = 'work-card-list';
        dashCardsEl.innerHTML = cardsHtml;
        dashContainer.appendChild(dashCardsEl);
      }

      // Inject mobile cards into Notes tab
      if (notesContainer) {
        const oldNotesCards = notesContainer.querySelector('.work-card-list');
        if (oldNotesCards) oldNotesCards.remove();
        const notesCardsEl = document.createElement('div');
        notesCardsEl.className = 'work-card-list';
        notesCardsEl.innerHTML = cardsHtml;
        notesContainer.appendChild(notesCardsEl);
      }
    }

    // ── Notes History table
    const spinner = $("notesSpinner");
    const empty = $("notesEmpty");
    const wrapper = $("notesTableWrapper");
    const tbody = $("notesTableBody");

    if (spinner) spinner.classList.add("hidden");

    if (!notes.length) {
      if (empty) empty.classList.remove("hidden");
      if (wrapper) wrapper.classList.add("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    if (wrapper) wrapper.classList.remove("hidden");

    tbody.innerHTML = notes.map(n => {
      const isDone = (n.usageCount || 0) >= 2;
      const itemBadges = (n.items || []).map(i =>
        `<span class="pnote-item">${escHtml(i)}</span>`
      ).join(' ');
      const locBadges = (n.locations || []).map(l =>
        `<span class="location-badge badge-${l.replace(/[^a-zA-Z0-9]/g, '')}">${escHtml(l)}</span>`
      ).join(' ');
      const addedByName = getAddedByName(n);
      return `
      <tr class="${isDone ? 'note-row-done' : ''}">
        <td>${formatDate(n.date)}</td>
        <td style="max-width:180px">${itemBadges}</td>
        <td>${locBadges}</td>
        <td style="max-width:200px;word-break:break-word">${n.note ? escHtml(n.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
        <td><span style="font-size:12px;color:var(--clr-text-muted);"><i class="ri-user-line"></i> Added by <strong>${escHtml(addedByName)}</strong></span></td>
        <td>
          <div class="actions-cell">
            <button class="btn btn-ghost btn-sm" onclick="editNote('${n.id}')"><i class="ri-edit-line"></i></button>
            <button class="btn btn-del" onclick="deleteNote('${n.id}')"><i class="ri-delete-bin-6-line"></i> Delete</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
  }

  // ── "Check-in Not Provided / No Check In" toggle ──────────
  window.checkInSkipStates = {}; // Track state per location

  window.updateDynamicDetailedBlocks = function () {
    const container = $("dynamicDetailedContainer");
    const checkboxes = document.querySelectorAll('input[name="dLoc"]:checked');

    if (checkboxes.length === 0) {
      container.innerHTML = "";
      return;
    }

    // Preserve existing values
    const existingValues = {};
    container.querySelectorAll('.detailed-block').forEach(block => {
      const loc = block.dataset.loc;
      const noteEl = block.querySelector('.d-locnote');
      existingValues[loc] = {
        checkOut: block.querySelector('.d-checkout').value,
        checkIn: block.querySelector('.d-checkin').value,
        hours: block.querySelector('.d-hours').value,
        guests: block.querySelector('.d-guests').value,
        locNote: noteEl ? noteEl.value : '',
      };
    });

    let html = "";
    checkboxes.forEach(cb => {
      const loc = cb.value;
      const isPuistola = loc === "House Cleaning (Puistola)";
      const vals = existingValues[loc] || {
        checkOut: isPuistola ? "20:30" : "12:00",
        checkIn: isPuistola ? "18:00" : "15:00",
        hours: isPuistola ? "2.5" : "2",
        guests: "",
        locNote: ""
      };

      if (isPuistola) {
        html += `
        <div class="detailed-block card" data-loc="${loc}">
          <h3>
            <i class="ri-building-line"></i> ${loc} Details
          </h3>
          <div class="form-grid">
            
            <!-- End Time (mapped to checkOut) -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-logout-circle-line"></i> End Time <span class="label-loc">(${loc})</span>
              </label>
              <input type="time" id="checkOut_${loc}" class="form-control d-checkout" value="${vals.checkOut}" />
              <span class="field-error" id="checkOutError_${loc}"></span>
            </div>

            <!-- Start Time (mapped to checkIn) -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-login-circle-line"></i> Start Time <span class="label-loc">(${loc})</span> <span class="required">*</span>
              </label>
              <div class="time-input-row">
                <input type="time" id="checkIn_${loc}" class="form-control d-checkin" value="${vals.checkIn}" />
              </div>
              <span class="field-error" id="checkInError_${loc}"></span>
            </div>

            <!-- Work Hours -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-timer-2-line"></i> Work Hours <span class="label-loc">(${loc})</span> <span class="required">*</span>
              </label>
              <input type="number" id="workHours_${loc}" class="form-control d-hours" step="0.5" min="0" value="${vals.hours}" required />
              <span class="field-error" id="workHoursError_${loc}"></span>
            </div>
            
            <input type="hidden" id="guests_${loc}" class="d-guests" value="" />

            <!-- Per-location Note -->
            <div class="form-group form-group-full">
              <label class="form-label" for="locNote_${loc}">
                <i class="ri-sticky-note-line"></i> Note <span class="label-loc">(${loc})</span>
              </label>
              <textarea id="locNote_${loc}" class="form-control d-locnote" rows="2" placeholder="Optional note for ${loc}…">${vals.locNote}</textarea>
            </div>
          </div>
        </div>
      `;
      } else {
        // Initialize state if not present
        if (window.checkInSkipStates[loc] === undefined) {
          window.checkInSkipStates[loc] = false;
        }
        const skipState = window.checkInSkipStates[loc];

        const isNoCheckInActive = skipState === "no_check_in";
        const isNotProvidedActive = skipState === "not_provided";
        const isInputDisabled = skipState !== false;

        html += `
        <div class="detailed-block card" data-loc="${loc}">
          <h3>
            <i class="ri-building-line"></i> ${loc} Details
          </h3>
          <div class="form-grid">
            
            <!-- Check-Out -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-logout-circle-line"></i> Check-Out Time <span class="label-loc">(${loc})</span>
              </label>
              <input type="time" id="checkOut_${loc}" class="form-control d-checkout" value="${vals.checkOut}" />
              <span class="field-error" id="checkOutError_${loc}"></span>
            </div>

            <!-- Check-In -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-login-circle-line"></i> Check-In Time <span class="label-loc">(${loc})</span> <span class="required">*</span>
              </label>
              <div class="time-input-row">
                <input type="time" id="checkIn_${loc}" class="form-control d-checkin ${isInputDisabled ? 'disabled-input' : ''}" value="${vals.checkIn}" ${isInputDisabled ? 'disabled' : ''} />
                <button type="button" class="btn-no-checkin ${isNoCheckInActive ? 'active' : ''}" id="noCheckInBtn_${loc}" onclick="toggleNoCheckIn('${loc}', 'no_check_in')">
                  <i class="${isNoCheckInActive ? 'ri-close-circle-fill' : 'ri-close-circle-line'}"></i> No Check In
                </button>
                <button type="button" class="btn-no-checkin ${isNotProvidedActive ? 'active' : ''}" id="notProvidedBtn_${loc}" onclick="toggleNoCheckIn('${loc}', 'not_provided')">
                  <i class="ri-question-line"></i> Not Provided
                </button>
              </div>
              <span class="field-error" id="checkInError_${loc}"></span>
            </div>

            <!-- Work Hours -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-timer-2-line"></i> Work Hours <span class="label-loc">(${loc})</span> <span class="required">*</span>
              </label>
              <input type="number" id="workHours_${loc}" class="form-control d-hours" step="0.5" min="0" value="${vals.hours}" required />
              <span class="field-error" id="workHoursError_${loc}"></span>
            </div>

            <!-- Number of Guests -->
            <div class="form-group">
              <label class="form-label">
                <i class="ri-group-line"></i> Number of Guests <span class="label-loc">(${loc})</span>
                <span id="guestsRequiredMark_${loc}" class="required ${isNoCheckInActive ? 'hidden' : ''}">*</span>
              </label>
              <input type="number" id="guests_${loc}" class="form-control d-guests" min="0" placeholder="e.g. 2" value="${vals.guests}" />
              <span class="field-error" id="guestsError_${loc}"></span>
            </div>

            <!-- Per-location Note -->
            <div class="form-group form-group-full">
              <label class="form-label" for="locNote_${loc}">
                <i class="ri-sticky-note-line"></i> Note <span class="label-loc">(${loc})</span>
              </label>
              <textarea id="locNote_${loc}" class="form-control d-locnote" rows="2" placeholder="Optional note for ${loc}…">${vals.locNote}</textarea>
            </div>

          </div>
        </div>
      `;
      }
    });

    container.innerHTML = html;

    const selectedLocs = [...checkboxes].map(cb => cb.value);
  };
  window.toggleNoCheckIn = function (loc, stateType) {
    const btnNoCheckIn = $(`noCheckInBtn_${loc}`);
    const btnNotProvided = $(`notProvidedBtn_${loc}`);
    const input = $(`checkIn_${loc}`);
    const reqMark = $(`guestsRequiredMark_${loc}`);
    const guestsError = $(`guestsError_${loc}`);
    const guestsInput = $(`guests_${loc}`);

    if (!btnNoCheckIn) return; // safeguard

    const currentState = window.checkInSkipStates[loc];

    // If clicking the currently active state, toggle it off
    if (currentState === stateType) {
      window.checkInSkipStates[loc] = false;
      input.disabled = false;
      input.classList.remove("disabled-input");

      btnNoCheckIn.classList.remove("active");
      btnNoCheckIn.innerHTML = '<i class="ri-close-circle-line"></i> No Check In';

      btnNotProvided.classList.remove("active");
      btnNotProvided.innerHTML = '<i class="ri-question-line"></i> Not Provided';

      input.value = "15:00";
      if (reqMark) reqMark.classList.remove("hidden");
    } else {
      // Activate the new state
      window.checkInSkipStates[loc] = stateType;
      input.disabled = true;
      input.classList.add("disabled-input");
      input.value = "";
      input.classList.remove("error");

      if (reqMark) reqMark.classList.add("hidden");
      if (guestsError) guestsError.textContent = "";
      if (guestsInput) guestsInput.classList.remove("error");

      if (stateType === "no_check_in") {
        btnNoCheckIn.classList.add("active");
        btnNoCheckIn.innerHTML = '<i class="ri-close-circle-fill"></i> No Check In';
        btnNotProvided.classList.remove("active");
        btnNotProvided.innerHTML = '<i class="ri-question-line"></i> Not Provided';
      } else {
        btnNotProvided.classList.add("active");
        btnNotProvided.innerHTML = '<i class="ri-check-line"></i> Not Provided';
        btnNoCheckIn.classList.remove("active");
        btnNoCheckIn.innerHTML = '<i class="ri-close-circle-line"></i> No Check In';
        if (reqMark) reqMark.classList.remove("hidden");
      }
    }
    autoCalculateHours(loc);
  };

  // ── Auto-calculate hours ───────────────────────────────────
  window.autoCalculateHours = function (loc) {
    const ciInput = $(`checkIn_${loc}`);
    const coInput = $(`checkOut_${loc}`);
    const hoursInput = $(`workHours_${loc}`);

    if (!ciInput || !coInput || !hoursInput) return;

    const ci = ciInput.value;
    const co = coInput.value;
    const skipState = window.checkInSkipStates[loc];

    // Don't calculate if we don't have valid times
    if (skipState || !ci || !co) return;

    const [ciH, ciM] = ci.split(":").map(Number);
    const [coH, coM] = co.split(":").map(Number);
    let mins = (coH * 60 + coM) - (ciH * 60 + ciM);

    // Auto-fill work hours if valid
    if (mins > 0) {
      const hrs = (mins / 60).toFixed(2);
      hoursInput.value = parseFloat(hrs);
    }
  }

  function getActivityUserName(a) {
    const raw = (a && a.addedBy) ? String(a.addedBy).trim() : "";
    const lower = raw.toLowerCase();
    if (!raw || lower === "admin" || lower === "prastika" || lower === "prasiddha") {
      return "admin";
    }
    return capitalizeWord(raw);
  }

  window.applyActivityFilters = function () {
    const checkedLocs = [...document.querySelectorAll('input[name="actFilterLoc"]:checked')].map(cb => cb.value);
    let list = allActivities;

    if (checkedLocs.length > 0) {
      list = list.filter(a => {
        if (a.location && checkedLocs.includes(a.location)) return true;
        const msg = (a.message || "").toLowerCase();
        return checkedLocs.some(loc => msg.includes(loc.toLowerCase()));
      });
    }

    renderActivitiesTable(list);
  };

  window.clearActivityFilters = function () {
    document.querySelectorAll('input[name="actFilterLoc"]').forEach(cb => cb.checked = false);
    applyActivityFilters();
  };

  function renderActivitiesTable(activities) {
    const tbody = $("activitiesTableBody");
    if (!tbody) return;

    if (!activities.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--clr-text-muted)">No activities recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = activities.map(a => {
      const timeStr = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().toLocaleString() : "Just now";
      let actionBadge = "";
      if (a.action === "ADDED") actionBadge = '<span class="location-badge" style="background:var(--clr-success);color:white">Added</span>';
      else if (a.action === "EDITED") actionBadge = '<span class="location-badge" style="background:var(--clr-primary);color:white">Edited</span>';
      else if (a.action === "DELETED") actionBadge = '<span class="location-badge" style="background:var(--clr-danger);color:white">Deleted</span>';

      const userName = getActivityUserName(a);
      const userBadge = `<span class="location-badge" style="font-size:12px;"><i class="ri-user-line"></i> ${escHtml(userName)}</span>`;

      return `
      <tr>
        <td style="white-space:nowrap;color:var(--clr-text-muted);font-size:0.875rem;">${timeStr}</td>
        <td>${userBadge}</td>
        <td>${actionBadge}</td>
        <td>${escHtml(a.message || "")}</td>
      </tr>
    `;
    }).join("");
  }

  // ── Form Validation ────────────────────────────────────────
  function validateForm() {
    let valid = true;

    const dateInput = $("date");
    const dateErr = $("dateError");
    if (!dateInput.value) {
      dateErr.textContent = "Please pick a date.";
      dateInput.classList.add("error");
      valid = false;
    } else {
      dateErr.textContent = "";
      dateInput.classList.remove("error");
    }

    const checkboxes = document.querySelectorAll('input[name="dLoc"]:checked');
    const locErr = $("locationError");
    if (checkboxes.length === 0) {
      locErr.textContent = "Please select at least one location.";
      valid = false;
    } else {
      locErr.textContent = "";
    }

    // Validate dynamic blocks
    checkboxes.forEach(cb => {
      const loc = cb.value;
      const isPuistola = loc === "House Cleaning (Puistola)";
      const skipState = window.checkInSkipStates[loc] || false;

      // Work Hours (always required)
      const hours = $(`workHours_${loc}`);
      const hoursErr = $(`workHoursError_${loc}`);
      if (!hours.value || parseFloat(hours.value) <= 0) {
        if (hoursErr) hoursErr.textContent = "Please enter valid work hours.";
        if (hours) hours.classList.add("error");
        valid = false;
      } else {
        if (hoursErr) hoursErr.textContent = "";
        if (hours) hours.classList.remove("error");
      }

      // House Cleaning (Puistola) uses a simplified form — no check-in skip
      // buttons and no guests field, so skip those validations entirely.
      if (isPuistola) return;

      // Check-In (required UNLESS skipped)
      if (!skipState) {
        const ci = $(`checkIn_${loc}`);
        const ciErr = $(`checkInError_${loc}`);
        if (!ci || !ci.value) {
          if (ciErr) ciErr.textContent = "Please enter check-in time, or mark it as skipped.";
          if (ci) ci.classList.add("error");
          valid = false;
        } else {
          if (ciErr) ciErr.textContent = "";
          if (ci) ci.classList.remove("error");
        }

        // Guests (required if check-in not skipped)
        const guests = $(`guests_${loc}`);
        const guestsErr = $(`guestsError_${loc}`);
        if (!guests || !guests.value || parseInt(guests.value) <= 0) {
          if (guestsErr) guestsErr.textContent = "Please enter number of guests.";
          if (guests) guests.classList.add("error");
          valid = false;
        } else {
          if (guestsErr) guestsErr.textContent = "";
          if (guests) guests.classList.remove("error");
        }
      }
    });

    return valid;
  }

  // ── Save / Update Entry ────────────────────────────────────
  window.handleFormSubmit = async function (e) {
    e.preventDefault();
    if (!validateForm()) return;

    const btn = $("submitBtn");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Saving…`;

    const dateVal = $("date").value;
    const checkboxes = document.querySelectorAll('input[name="dLoc"]:checked');
    const editId = $("editDocId").value;

    const submissions = [];
    const currentUser = localStorage.getItem('wt-logged-in-user') || 'worker';
    const existingRec = editId ? allRecords.find(r => r.id === editId) : null;
    let targetCol = getUserRecordsCollectionName();
    if (isAdminUser()) {
      const selectedWorkerRadio = document.querySelector('input[name="dTargetWorker"]:checked');
      if (selectedWorkerRadio && selectedWorkerRadio.value) {
        targetCol = selectedWorkerRadio.value;
      }
    }

    checkboxes.forEach(cb => {
      const loc = cb.value;
      const skipState = window.checkInSkipStates[loc] || false;
      const totalHours = parseFloat($(`workHours_${loc}`).value) || 0;
      // Read the per-location note
      const locNoteEl = $(`locNote_${loc}`);
      const locNoteVal = locNoteEl ? locNoteEl.value.trim() : '';
      const needsApproval = (loc === "Kotkansiipi" && !isAdminUser());

      submissions.push({
        location: loc,
        date: dateVal,
        checkIn: skipState ? "" : $(`checkIn_${loc}`).value,
        checkInSkipState: skipState,
        checkOut: $(`checkOut_${loc}`).value || "",
        totalHours: totalHours,
        guests: parseInt($(`guests_${loc}`).value) || "",
        note: locNoteVal,
        addedBy: (existingRec && existingRec.addedBy) ? existingRec.addedBy : currentUser,
        approvalStatus: (existingRec && existingRec.approvalStatus) ? existingRec.approvalStatus : (needsApproval ? "pending" : "approved")
      });
    });

    try {
      if (editId) {
        // UPDATE existing record
        const data = submissions[0];
        const origCol = (existingRec && existingRec._col) ? existingRec._col : getUserRecordsCollectionName();
        if (isAdminUser() && targetCol !== origCol) {
          await deleteDoc(doc(db, origCol, editId));
          await addDoc(collection(db, targetCol), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } else {
          await updateDoc(doc(db, origCol, editId), { ...data, updatedAt: serverTimestamp() });
        }
        logActivity("EDITED", `Updated work entry for ${data.location}`, data.location);
        showToast("Entry updated successfully!", "success");
        cancelEdit();
      } else {
        // ADD NEW (one or multiple)
        const promises = submissions.map(async (data) => {
          await addDoc(collection(db, targetCol), { ...data, createdAt: serverTimestamp() });
          logActivity("ADDED", `Added new work entry for ${data.location}`, data.location);
        });
        await Promise.all(promises);
        showToast(`Saved ${submissions.length} Entry(s) successfully!`, "success");
        resetForm();
      }
    } catch (err) {
      console.error(err);
      showToast("Error saving entry. Check console.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-save-line"></i> <span id="submitBtnText">${editId ? "Update Entry" : "Save Entry"}</span>`;
    }
  };

  // ── Quick Add Submit ───────────────────────────────────────
  window.updateDynamicHours = function () {
    const container = $("dynamicHoursContainer");
    const checkboxes = document.querySelectorAll('input[name="qLoc"]:checked');

    if (checkboxes.length === 0) {
      container.innerHTML = "";
      return;
    }

    // Preserve existing values
    const existingValues = {};
    container.querySelectorAll('input.q-dynamic-hours').forEach(input => {
      existingValues[input.dataset.loc] = input.value;
    });

    let html = "";
    checkboxes.forEach(cb => {
      const loc = cb.value;
      const isPuistola = loc === "House Cleaning (Puistola)";
      const val = existingValues[loc] || (isPuistola ? "2.5" : "2"); // Default to 2.5 or 2
      html += `
      <div class="form-group">
        <label class="form-label">
          <i class="ri-timer-2-line"></i> Work Hours for ${loc} <span class="required">*</span>
        </label>
        <input type="number" class="form-control q-dynamic-hours" data-loc="${loc}" step="0.5" min="0" value="${val}" required />
      </div>
    `;
    });

    container.innerHTML = html;

    const selectedLocs = [...checkboxes].map(cb => cb.value);
  };

  window.handleQuickSubmit = async function (e) {
    e.preventDefault();

    const checkboxes = document.querySelectorAll('input[name="qLoc"]:checked');
    if (checkboxes.length === 0) {
      $("qLocationError").textContent = "Select at least one location.";
      return;
    } else {
      $("qLocationError").textContent = "";
    }

    const date = $("qDate").value;
    if (!date) { $("qDate").classList.add("error"); return; } else { $("qDate").classList.remove("error"); }

    const hoursInputs = document.querySelectorAll('.q-dynamic-hours');
    let hasError = false;
    const submissions = [];

    hoursInputs.forEach(input => {
      const hrs = parseFloat(input.value);
      if (isNaN(hrs) || hrs <= 0) {
        input.classList.add("error");
        hasError = true;
      } else {
        input.classList.remove("error");
        submissions.push({ loc: input.dataset.loc, hrs });
      }
    });

    if (hasError) return;

    const btn = $("qSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px"></div> Adding…`;

    try {
      const currentUser = localStorage.getItem('wt-logged-in-user') || 'worker';
      let targetCol = getUserRecordsCollectionName();
      if (isAdminUser()) {
        const selectedWorkerRadio = document.querySelector('input[name="qTargetWorker"]:checked');
        if (selectedWorkerRadio && selectedWorkerRadio.value) {
          targetCol = selectedWorkerRadio.value;
        }
      }
      const promises = submissions.map(async (sub) => {
        const needsApproval = (sub.loc === "Kotkansiipi" && !isAdminUser());
        const data = {
          location: sub.loc,
          date: date,
          checkIn: "",
          checkInSkipState: "not_provided",
          checkOut: "",
          totalHours: sub.hrs,
          guests: "",
          note: $("qNotes").value.trim(),
          addedBy: currentUser,
          approvalStatus: needsApproval ? "pending" : "approved"
        };
        await addDoc(collection(db, targetCol), { ...data, createdAt: serverTimestamp() });
        logActivity("ADDED", `Quick added working hour for ${sub.loc}`, sub.loc);
      });

      await Promise.all(promises);

      showToast(`Saved ${submissions.length} Working Hour${submissions.length > 1 ? 's' : ''}!`, "success");
      $("quickEntryForm").reset();
      updateDynamicHours(); // Clear container
      setDefaultDate();
    } catch (err) {
      console.error(err);
      showToast("Error saving working hours.", "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="ri-flashlight-line"></i> Add Working Hour`;
    }
  };

  function resetForm() {
    $("workEntryForm").reset();
    setDefaultDate();
    window.checkInSkipStates = {};
    updateDynamicDetailedBlocks();
    clearFieldErrors();
  }

  function clearFieldErrors() {
    ["locationError", "dateError", "checkInError", "checkOutError", "workHoursError", "guestsError"].forEach(id => {
      const el = $(id); if (el) el.textContent = "";
    });
    ["location", "date", "checkIn", "checkOut", "workHours", "guests"].forEach(id => {
      const el = $(id); if (el) el.classList.remove("error");
    });
  }

  // ── Edit ──────────────────────────────────────────────────
  window.editEntry = function (docId) {
    const rec = allRecords.find(r => r.id === docId);
    if (!rec) return;

    $("date").value = rec.date;
    $("editDocId").value = docId;

    if (isAdminUser() && rec._col) {
      document.querySelectorAll('input[name="dTargetWorker"]').forEach(r => {
        r.checked = (r.value === rec._col);
      });
    }

    const checkboxes = document.querySelectorAll('input[name="dLoc"]');
    checkboxes.forEach(cb => {
      cb.checked = (cb.value === rec.location);
    });

    window.checkInSkipStates = {};
    window.checkInSkipStates[rec.location] = rec.checkInSkipState || false;

    updateDynamicDetailedBlocks();

    const loc = rec.location;
    if ($(`checkOut_${loc}`)) $(`checkOut_${loc}`).value = rec.checkOut || "";
    if ($(`workHours_${loc}`)) $(`workHours_${loc}`).value = rec.totalHours || 2;
    if ($(`guests_${loc}`)) $(`guests_${loc}`).value = rec.guests || "";
    if ($(`checkIn_${loc}`) && !rec.checkInSkipState) {
      $(`checkIn_${loc}`).value = rec.checkIn || "15:00";
    }
    // Restore per-location note
    if ($(`locNote_${loc}`)) $(`locNote_${loc}`).value = rec.note || "";

    // Switch to Detailed Tab if not already on it
    switchFormTab("detailed");

    $("submitBtnText").textContent = "Update Entry";
    $("cancelEditBtn").style.display = "inline-flex";
    $("formSectionTitle").textContent = "Edit Entry";

    showSection("add-entry", $("nav-add"));
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearFieldErrors();
  };

  window.cancelEdit = function () {
    $("editDocId").value = "";
    if ($("submitBtnText")) $("submitBtnText").textContent = "Save Entry";
    if ($("cancelEditBtn")) $("cancelEditBtn").style.display = "none";
    if ($("formSectionTitle")) $("formSectionTitle").textContent = "Add Entry";
    window.checkInSkipStates = {};
    resetForm();
  };

  // ── Delete ─────────────────────────────────────────────────
  window.deleteEntry = function (docId) {
    pendingDeleteId = docId;
    $("confirmOverlay").classList.remove("hidden");
  };

  window.closeConfirm = function () {
    pendingDeleteId = null;
    $("confirmOverlay").classList.add("hidden");
  };

  window.confirmDelete = async function () {
    if (!pendingDeleteId) return;
    const btn = $("confirmDeleteBtn");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      const rec = allRecords.find(r => r.id === pendingDeleteId);
      const targetCol = (rec && rec._col) ? rec._col : getUserRecordsCollectionName();
      await deleteDoc(doc(db, targetCol, pendingDeleteId));
      logActivity("DELETED", `Deleted work entry${rec ? ' for ' + rec.location : ''}`, rec ? rec.location : "");
      showToast("Entry deleted.", "warning");
    } catch (err) {
      console.error(err);
      showToast("Error deleting entry.", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete";
      closeConfirm();
    }
  };

  // ── Firestore Real-Time Listener (Separate Worker DBs + Admin Unified View) ──
  let recordsByCol = {};
  let activeColUnsubscribers = {};

  function rebuildAllRecords() {
    const merged = Object.values(recordsByCol).flat();
    merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    allRecords = merged;
    applyFilters();
    updateStats(allRecords);
    renderThisMonthTable(allRecords);
    renderTodayTable(allRecords);
    renderTomorrowTable(allRecords);
    renderAdminApprovals(allRecords);
    if ($("dashboardSpinner")) $("dashboardSpinner").classList.add("hidden");
    if ($("recordsSpinner")) $("recordsSpinner").classList.add("hidden");
  }

  function listenToRecordsCollection(colName) {
    if (activeColUnsubscribers[colName]) return;
    const q = query(collection(db, colName), orderBy("date", "desc"));
    activeColUnsubscribers[colName] = onSnapshot(q, snapshot => {
      recordsByCol[colName] = snapshot.docs.map(d => ({
        id: d.id,
        _col: colName,
        ...d.data()
      }));
      rebuildAllRecords();
    }, err => {
      console.error(`Firestore error (${colName}):`, err);
      if ($("dashboardSpinner")) $("dashboardSpinner").classList.add("hidden");
      if ($("recordsSpinner")) $("recordsSpinner").classList.add("hidden");
    });
  }

  function subscribeFirestore() {
    if (!isAdminUser()) {
      // Worker only subscribes to their own isolated collection: workHours_<username>
      const workerCol = getUserRecordsCollectionName();
      listenToRecordsCollection(workerCol);
    } else {
      // Admin subscribes to legacy/admin "workHours" AND every worker's "workHours_<username>"
      listenToRecordsCollection("workHours");
      onSnapshot(collection(db, "workers"), snap => {
        const workerNames = [];
        snap.docs.forEach(d => {
          const w = d.data();
          if (w.username) {
            workerNames.push(w.username);
            listenToRecordsCollection(`workHours_${w.username}`);
          }
        });
        populateFilterWorkerSelect(workerNames);
      });
    }
  }

  function populateFilterWorkerSelect(workerNames) {
    const items = [
      { label: "Prasiddha", col: "workHours" },
      ...workerNames.sort().map(u => ({ label: capitalizeWord(u), col: `workHours_${u}` }))
    ];

    const container = $("filterWorkerCheckboxes");
    if (container) {
      const prevChecked = new Set(
        [...document.querySelectorAll('input[name="filterWorker"]:checked')].map(cb => cb.value)
      );
      container.innerHTML = items.map(item => `
        <label class="checkbox-label">
          <input type="checkbox" name="filterWorker" value="${escHtml(item.col)}" ${prevChecked.has(item.col) ? "checked" : ""} onchange="applyFilters()"> ${escHtml(item.label)}
        </label>
      `).join("");
    }

    const dRadios = $("dTargetWorkerRadios");
    if (dRadios) {
      const prevD = document.querySelector('input[name="dTargetWorker"]:checked')?.value || "workHours";
      dRadios.innerHTML = items.map(item => `
        <label class="checkbox-label">
          <input type="radio" name="dTargetWorker" value="${escHtml(item.col)}" ${item.col === prevD ? "checked" : ""}> ${escHtml(item.label)}
        </label>
      `).join("");
    }

    const qRadios = $("qTargetWorkerRadios");
    if (qRadios) {
      const prevQ = document.querySelector('input[name="qTargetWorker"]:checked')?.value || "workHours";
      qRadios.innerHTML = items.map(item => `
        <label class="checkbox-label">
          <input type="radio" name="qTargetWorker" value="${escHtml(item.col)}" ${item.col === prevQ ? "checked" : ""}> ${escHtml(item.label)}
        </label>
      `).join("");
    }
  }

  function subscribeActivities() {
    const q = query(collection(db, "activityLogs"), orderBy("timestamp", "desc"));
    onSnapshot(q, snapshot => {
      allActivities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      applyActivityFilters();
    });
  }

      // ── Stats ─────────────────────────────────────────────────
      function updateStats(records) {
        // Get the date range from the current filter
        const { from, to } = getDashDateRange();

        // Apply date range
        let filtered = records.filter(r => r.date >= from && r.date <= to);

        // Apply location filter (if any selected)
        if (dashFilter.locations.length > 0) {
          filtered = filtered.filter(r => dashFilter.locations.includes(r.location));
        }

        // Total hours for the filtered period
        const totalHrs = filtered.reduce((s, r) => s + (r.totalHours || 0), 0);

        // Per-location totals (within filtered period & locations)
        const byLoc = loc => filtered.filter(r => r.location === loc).reduce((s, r) => s + (r.totalHours || 0), 0);

        // Now compute the three comparison cards based on period
        const now = new Date();
        const isoToday = toISODate(now);

        const daysFromMonday = (now.getDay() + 6) % 7;
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - daysFromMonday);
        startOfWeek.setHours(0, 0, 0, 0);
        const isoWeekStart = toISODate(startOfWeek);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const isoWeekEnd = toISODate(endOfWeek);

        const prevSunday = new Date(startOfWeek);
        prevSunday.setDate(startOfWeek.getDate() - 1);
        const prevMonday = new Date(startOfWeek);
        prevMonday.setDate(startOfWeek.getDate() - 7);
        const isoPrevStart = toISODate(prevMonday);
        const isoPrevEnd = toISODate(prevSunday);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const isoMonthStart = toISODate(startOfMonth);

        // Card 1: total hours in selected period
        // Card 2: this week (always fixed, for quick reference)
        // Card 3: prev week (always fixed, for quick reference)
        const thisWeekHrs = records
          .filter(r => r.date >= isoWeekStart && r.date <= isoWeekEnd)
          .reduce((s, r) => s + (r.totalHours || 0), 0);

        const prevWeekHrs = records
          .filter(r => r.date >= isoPrevStart && r.date <= isoPrevEnd)
          .reduce((s, r) => s + (r.totalHours || 0), 0);

        // Update period labels — just the month name or period + "Total"
        const { thisMonth, lastMonth } = getDashMonthNames();
        const periodLabels = {
          this_month: `${thisMonth} Total`,
          last_month: `${lastMonth} Total`,
          this_week: 'This Week',
          last_week: 'Last Week',
          custom: 'Custom Period'
        };
        const periodLabel = periodLabels[dashFilter.period] || `${thisMonth} Total`;
        if ($('statLabel1')) $('statLabel1').textContent = periodLabel;
        if ($('statLabel2')) $('statLabel2').textContent = 'This Week';
        if ($('statLabel3')) $('statLabel3').textContent = 'Prev Week';

        if ($('statThisMonthHours')) $('statThisMonthHours').textContent = totalHrs.toFixed(1);
        if ($('statThisWeekHours')) $('statThisWeekHours').textContent = thisWeekHrs.toFixed(1);
        if ($('statPrevWeekHours')) $('statPrevWeekHours').textContent = prevWeekHrs.toFixed(1);

        $('statKotkansiipi').textContent = byLoc('Kotkansiipi').toFixed(1) + 'h';
        $('statKakoisvayla').textContent = byLoc('Kakoisvayla').toFixed(1) + 'h';
        $('statMayavatie').textContent = byLoc('Mayavatie').toFixed(1) + 'h';
        if ($('statRiskilakuja')) $('statRiskilakuja').textContent = byLoc('Riskiläkuja').toFixed(1) + 'h';

        // Render pills on the dashboard header
        renderDashActivePills();
      }

      // ── This Month Table ──────────────────────────────────────
      function renderThisMonthTable(records) {
        const empty = $("thisMonthEmpty");
        const wrapper = $("thisMonthTableWrapper");
        const tbody = $("thisMonthTableBody");

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const isoMonthStart = toISODate(startOfMonth);
        const isoMonthEnd = toISODate(endOfMonth);

        // Format month like "June"
        const formattedMonth = now.toLocaleDateString('en-GB', { month: 'long' });
        $("thisMonthTitle").innerHTML = `<i class="ri-calendar-line"></i> This month (${formattedMonth}) work hours`;

        const thisMonthRecords = records.filter(r => r.date >= isoMonthStart && r.date <= isoMonthEnd);

        if (!thisMonthRecords.length) {
          empty.classList.remove("hidden");
          wrapper.classList.add("hidden");
          return;
        }

        empty.classList.add("hidden");
        wrapper.classList.remove("hidden");

        const totalHours = thisMonthRecords.reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);
        const rowsHtml = thisMonthRecords.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td><span class="location-badge badge-${r.location.replace(/[^a-zA-Z0-9]/g, '')}">${r.location}</span>${getAddedByHtml(r)}${getAdminApprovalHtml(r)}</td>
      <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
      <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
      <td>${r.guests || '—'}</td>
      <td>${r.note ? escHtml(r.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
    </tr>
  `).join("");

        tbody.innerHTML = rowsHtml + `
    <tr style="background: var(--clr-surface-2); font-weight: 700;">
      <td colspan="4" style="text-align: right;">Total Working Hours:</td>
      <td><span class="hours-pill" style="background: var(--clr-primary); color: white;">${totalHours.toFixed(2)}h</span></td>
      <td colspan="2"></td>
    </tr>
  `;
      }
      // ── Today's Work Table ─────────────────────────────────
      function getPendingHtmlForLoc(loc, isMobile = false, recordDateStr = null) {
        if (typeof allNotes === 'undefined') return '';
        const pending = allNotes.filter(n => {
          if (!Array.isArray(n.locations) || !n.locations.includes(loc)) return false;
          if ((n.usageCount || 0) >= 2) return false;
          if (recordDateStr && n.date >= recordDateStr) return false;
          return true;
        });
        if (!pending.length) return '';
        const badges = pending.flatMap(n => {
          const byName = getAddedByName(n);
          return (n.items || []).map(i => ({ item: i, by: byName }));
        });
        if (!badges.length) return '';

        if (isMobile) {
          return '<div class="work-card-field" style="grid-column:1 / -1; margin-top:2px;">' +
            '<span class="work-card-label" style="margin-bottom:3px;">NOTES</span>' +
            '<div style="display:flex;flex-wrap:wrap;gap:4px;">' +
            badges.map(b => `<span class="pnote-item" style="align-self:flex-start;"><i class="ri-sticky-note-line" style="color:var(--clr-text-muted);"></i> ${escHtml(b.item)} <small style="color:var(--clr-text-muted);font-weight:400;">(Added by ${escHtml(b.by)})</small></span>`).join('') +
            '</div></div>';
        } else {
          return '<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">' +
            badges.map(b => `<span class="pnote-item"><i class="ri-sticky-note-line" style="color:var(--clr-text-muted);"></i> ${escHtml(b.item)} <small style="color:var(--clr-text-muted);font-weight:400;">(Added by ${escHtml(b.by)})</small></span>`).join('') +
            '</div>';
        }
      }

      function renderTodayTable(records) {
        const todayDate = new Date();
        const isoToday = toISODate(todayDate);
        const formattedDate = todayDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        const todayRecords = records.filter(r => r.date === isoToday);

        $("todayTitle").innerHTML = `<i class="ri-calendar-event-line"></i> Today (${formattedDate}) Work List`;

        const empty = $("todayEmpty");
        const wrapper = $("todayTableWrapper");
        const tbody = $("todayTableBody");

        if (!todayRecords.length) {
          empty.classList.remove("hidden");
          wrapper.classList.add("hidden");
          return;
        }

        empty.classList.add("hidden");
        wrapper.classList.remove("hidden");

        const totalHours = todayRecords.reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);

        // ── Desktop table rows ──
        const isAdm = isAdminUser();
        const rowsHtml = todayRecords.map(r => {
          const pendingHtml = getPendingHtmlForLoc(r.location, false, r.date);
          const noteContent = r.note ? escHtml(r.note) : '';
          const finalNote = noteContent || pendingHtml ? `${noteContent}${pendingHtml}` : '<span style="color:var(--clr-text-muted)">—</span>';
          const addedByName = getAddedByName(r);
          const assignedToName = getAssignedToName(r);
          const assignedTd = isAdm
            ? `<td><span style="font-size:12px;color:var(--clr-text-muted);"><i class="ri-user-follow-line"></i> <strong>${escHtml(assignedToName)}</strong></span></td>`
            : '';
          return `
      <tr>
        <td><span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span></td>
        <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
        <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
        <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
        <td>${r.guests || '—'}</td>
        <td>${finalNote}</td>
        <td><span style="font-size:12px;color:var(--clr-text-muted);"><i class="ri-user-line"></i> Added by <strong>${escHtml(addedByName)}</strong></span>${getAdminApprovalHtml(r)}</td>
        ${assignedTd}
      </tr>
    `;
        }).join("");

        tbody.innerHTML = rowsHtml + `
    <tr class="dash-total-row">
      <td colspan="3" style="text-align:right;">Total Working Hours:</td>
      <td><span class="hours-pill">${totalHours.toFixed(2)}h</span></td>
      <td colspan="${isAdm ? 4 : 3}"></td>
    </tr>
  `;

        // ── Mobile card list ──
        const existingCardList = wrapper.querySelector('.work-card-list');
        if (existingCardList) existingCardList.remove();

        const cardListEl = document.createElement('div');
        cardListEl.className = 'work-card-list';

        cardListEl.innerHTML = todayRecords.map(r => {
          const checkInText = r.checkIn ? r.checkIn
            : (r.checkInSkipState === 'no_check_in' ? '<em style="color:var(--clr-text-muted)">No check-in</em>'
              : (r.checkInSkipState === 'not_provided' ? '<em style="color:var(--clr-text-muted)">Not provided</em>'
                : '<span style="color:var(--clr-text-muted)">—</span>'));
          const checkOutText = r.checkOut || '<span style="color:var(--clr-text-muted)">—</span>';
          const noteHtml = r.note ? `<div class="work-card-note">${escHtml(r.note)}</div>` : '';
          const pendingHtml = getPendingHtmlForLoc(r.location, true, r.date);
          const finalNotesSection = `${noteHtml}${pendingHtml}`;
          const addedByName = getAddedByName(r);
          const assignedToName = getAssignedToName(r);
          const assignedFieldHtml = isAdm ? `
        <div class="work-card-field">
          <span class="work-card-label"><i class="ri-user-follow-line"></i> Assigned To</span>
          <span class="work-card-value" style="font-size:12.5px;color:var(--clr-text-muted);"><strong>${escHtml(assignedToName)}</strong></span>
        </div>` : '';

          return `
      <div class="work-card">
        <div class="work-card-header">
          <div><span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span></div>
          <span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span>
        </div>
        <div class="work-card-field">
          <span class="work-card-label">Check-In</span>
          <span class="work-card-value">${checkInText}</span>
        </div>
        <div class="work-card-field">
          <span class="work-card-label">Check-Out</span>
          <span class="work-card-value">${checkOutText}</span>
        </div>
        <div class="work-card-field">
          <span class="work-card-label">Guests</span>
          <span class="work-card-value">${r.guests || '—'}</span>
        </div>
        ${finalNotesSection}
        <div class="work-card-field">
          <span class="work-card-label"><i class="ri-user-line"></i> User</span>
          <span class="work-card-value" style="font-size:12.5px;color:var(--clr-text-muted);">Added by <strong>${escHtml(addedByName)}</strong>${getAdminApprovalHtml(r)}</span>
        </div>
        ${assignedFieldHtml}
      </div>
    `;
        }).join('');

        cardListEl.innerHTML += `
    <div class="work-card-total">
      Total Working Hours:
      <span class="hours-pill">${totalHours.toFixed(2)}h</span>
    </div>
  `;

        wrapper.appendChild(cardListEl);
      }

      // ── Tomorrow's Work Table ─────────────────────────────────
      function renderTomorrowTable(records) {
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const isoTomorrow = toISODate(tomorrowDate);
        const formattedDate = tomorrowDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        const tmrRecords = records.filter(r => r.date === isoTomorrow);

        $("tomorrowTitle").innerHTML = `<i class="ri-calendar-todo-line"></i> Tomorrow (${formattedDate}) Work List`;

        const empty = $("tomorrowEmpty");
        const wrapper = $("tomorrowTableWrapper");
        const tbody = $("tomorrowTableBody");

        if (!tmrRecords.length) {
          empty.classList.remove("hidden");
          wrapper.classList.add("hidden");
          return;
        }

        empty.classList.add("hidden");
        wrapper.classList.remove("hidden");

        const totalHours = tmrRecords.reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);

        // ── Desktop table rows ──
        const isAdm = isAdminUser();
        const rowsHtml = tmrRecords.map(r => {
          const pendingHtml = getPendingHtmlForLoc(r.location, false, r.date);
          const noteContent = r.note ? escHtml(r.note) : '';
          const finalNote = noteContent || pendingHtml ? `${noteContent}${pendingHtml}` : '<span style="color:var(--clr-text-muted)">—</span>';
          const addedByName = getAddedByName(r);
          const assignedToName = getAssignedToName(r);
          const assignedTd = isAdm
            ? `<td><span style="font-size:12px;color:var(--clr-text-muted);"><i class="ri-user-follow-line"></i> <strong>${escHtml(assignedToName)}</strong></span></td>`
            : '';
          return `
      <tr>
        <td><span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span></td>
        <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
        <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
        <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
        <td>${r.guests || '—'}</td>
        <td>${finalNote}</td>
        <td><span style="font-size:12px;color:var(--clr-text-muted);"><i class="ri-user-line"></i> Added by <strong>${escHtml(addedByName)}</strong></span>${getAdminApprovalHtml(r)}</td>
        ${assignedTd}
      </tr>
    `;
        }).join("");

        tbody.innerHTML = rowsHtml + `
    <tr class="dash-total-row">
      <td colspan="3" style="text-align:right;">Total Working Hours:</td>
      <td><span class="hours-pill">${totalHours.toFixed(2)}h</span></td>
      <td colspan="${isAdm ? 4 : 3}"></td>
    </tr>
  `;

        // ── Mobile card list ──
        const existingCardList = wrapper.querySelector('.work-card-list');
        if (existingCardList) existingCardList.remove();

        const cardListEl = document.createElement('div');
        cardListEl.className = 'work-card-list';

        cardListEl.innerHTML = tmrRecords.map(r => {
          const checkInText = r.checkIn ? r.checkIn
            : (r.checkInSkipState === 'no_check_in' ? '<em style="color:var(--clr-text-muted)">No check-in</em>'
              : (r.checkInSkipState === 'not_provided' ? '<em style="color:var(--clr-text-muted)">Not provided</em>'
                : '<span style="color:var(--clr-text-muted)">—</span>'));
          const checkOutText = r.checkOut || '<span style="color:var(--clr-text-muted)">—</span>';
          const noteHtml = r.note ? `<div class="work-card-note">${escHtml(r.note)}</div>` : '';
          const pendingHtml = getPendingHtmlForLoc(r.location, true, r.date);
          const finalNotesSection = `${noteHtml}${pendingHtml}`;
          const addedByName = getAddedByName(r);
          const assignedToName = getAssignedToName(r);
          const assignedFieldHtml = isAdm ? `
        <div class="work-card-field">
          <span class="work-card-label"><i class="ri-user-follow-line"></i> Assigned To</span>
          <span class="work-card-value" style="font-size:12.5px;color:var(--clr-text-muted);"><strong>${escHtml(assignedToName)}</strong></span>
        </div>` : '';

          return `
      <div class="work-card">
        <div class="work-card-header">
          <div><span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span></div>
          <span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span>
        </div>
        <div class="work-card-field">
          <span class="work-card-label">Check-In</span>
          <span class="work-card-value">${checkInText}</span>
        </div>
        <div class="work-card-field">
          <span class="work-card-label">Check-Out</span>
          <span class="work-card-value">${checkOutText}</span>
        </div>
        <div class="work-card-field">
          <span class="work-card-label">Guests</span>
          <span class="work-card-value">${r.guests || '—'}</span>
        </div>
        ${finalNotesSection}
        <div class="work-card-field">
          <span class="work-card-label"><i class="ri-user-line"></i> User</span>
          <span class="work-card-value" style="font-size:12.5px;color:var(--clr-text-muted);">Added by <strong>${escHtml(addedByName)}</strong>${getAdminApprovalHtml(r)}</span>
        </div>
        ${assignedFieldHtml}
      </div>
    `;
        }).join('');

        cardListEl.innerHTML += `
    <div class="work-card-total">
      Total Working Hours:
      <span class="hours-pill">${totalHours.toFixed(2)}h</span>
    </div>
  `;

        wrapper.appendChild(cardListEl);
      }

      // ── Previous Week Table ───────────────────────────────────
      function renderPrevWeekTable(records) {
        const now = new Date();
        // ISO week: Mon=0 … Sun=6
        const daysFromMonday = (now.getDay() + 6) % 7;

        // This week's Monday
        const thisMonday = new Date(now);
        thisMonday.setDate(now.getDate() - daysFromMonday);
        thisMonday.setHours(0, 0, 0, 0);

        // Previous week: Mon = thisMonday - 7, Sun = thisMonday - 1
        const prevMonday = new Date(thisMonday);
        prevMonday.setDate(thisMonday.getDate() - 7);
        const prevSunday = new Date(thisMonday);
        prevSunday.setDate(thisMonday.getDate() - 1);

        const isoPrevStart = toISODate(prevMonday);
        const isoPrevEnd = toISODate(prevSunday);

        const empty = $("prevWeekEmpty");
        const wrapper = $("prevWeekTableWrapper");
        const tbody = $("prevWeekTableBody");
        const title = $("prevWeekTitle");
        const totalEl = $("prevWeekTotal");

        // Format heading date range like "9 Jun – 15 Jun"
        const fmtShort = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        if (title) title.innerHTML = `<i class="ri-calendar-2-line"></i> Previous Week (${fmtShort(prevMonday)} – ${fmtShort(prevSunday)})`;

        const prevRecords = records.filter(r => r.date >= isoPrevStart && r.date <= isoPrevEnd);
        // Sort ascending so it reads Mon → Sun
        prevRecords.sort((a, b) => a.date.localeCompare(b.date));

        if (!prevRecords.length) {
          if (empty) empty.classList.remove("hidden");
          if (wrapper) wrapper.classList.add("hidden");
          if (totalEl) totalEl.textContent = "";
          return;
        }

        if (empty) empty.classList.add("hidden");
        if (wrapper) wrapper.classList.remove("hidden");

        const grandTotal = prevRecords.reduce((s, r) => s + (parseFloat(r.totalHours) || 0), 0);
        if (totalEl) totalEl.innerHTML = `Total: <span class="hours-pill" style="background:var(--clr-primary);color:white;">${grandTotal.toFixed(2)}h</span>`;

        const rowsHtml = prevRecords.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td><span class="location-badge badge-${r.location.replace(/[^a-zA-Z0-9]/g, '')}">${r.location}</span>${getAddedByHtml(r)}</td>
      <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
      <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
      <td>${r.guests || '—'}</td>
      <td>${r.note ? escHtml(r.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
    </tr>
  `).join("");

        tbody.innerHTML = rowsHtml + `
    <tr style="background: var(--clr-surface-2); font-weight: 700;">
      <td colspan="4" style="text-align: right;">Total Working Hours:</td>
      <td><span class="hours-pill" style="background: var(--clr-primary); color: white;">${grandTotal.toFixed(2)}h</span></td>
      <td colspan="2"></td>
    </tr>
  `;
      }

      // ── Filters ────────────────────────────────────────────────
      window.applyFilters = function () {
        // Collect all checked location checkboxes
        const checkedLocs = new Set(
          [...document.querySelectorAll('input[name="filterLoc"]:checked')].map(cb => cb.value)
        );
        const checkedWorkers = new Set(
          [...document.querySelectorAll('input[name="filterWorker"]:checked')].map(cb => cb.value)
        );
        const month = $("filterMonth").value;    // "YYYY-MM"
        const startDate = $("filterStartDate").value;
        const endDate = $("filterEndDate").value;
        const noteQ = $("filterNotes").value.trim().toLowerCase();

        filteredRecords = allRecords.filter(r => {
          if (isAdminUser() && checkedWorkers.size > 0 && !checkedWorkers.has(r._col)) return false;
          if (checkedLocs.size > 0 && !checkedLocs.has(r.location)) return false;
          if (month && !r.date?.startsWith(month)) return false;
          if (startDate && r.date < startDate) return false;
          if (endDate && r.date > endDate) return false;
          if (noteQ && !r.note?.toLowerCase().includes(noteQ)) return false;
          return true;
        });

        renderRecordsTable(filteredRecords);
      };

      window.clearFilters = function () {
        document.querySelectorAll('input[name="filterLoc"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('input[name="filterWorker"]').forEach(cb => cb.checked = false);
        ["filterMonth", "filterStartDate", "filterEndDate", "filterNotes"]
          .forEach(id => { const el = $(id); if (el) el.value = ""; });
        // Clear quick-period active state
        document.querySelectorAll('.rec-qp-btn').forEach(b => b.classList.remove('active'));
        applyFilters();
      };

      // Called when user manually edits the date fields — deactivates quick buttons
      window.onRecDateFilterChange = function () {
        document.querySelectorAll('.rec-qp-btn').forEach(b => b.classList.remove('active'));
        applyFilters();
      };

      // Quick-period selector for Records
      window.setRecPeriod = function (period) {
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();
        let from = '', to = '';

        if (period === 'this_week') {
          const daysFromMon = (now.getDay() + 6) % 7;
          const mon = new Date(now); mon.setDate(now.getDate() - daysFromMon); mon.setHours(0, 0, 0, 0);
          const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
          from = toISODate(mon); to = toISODate(sun);
        } else if (period === 'prev_week') {
          const daysFromMon = (now.getDay() + 6) % 7;
          const thisMon = new Date(now); thisMon.setDate(now.getDate() - daysFromMon); thisMon.setHours(0, 0, 0, 0);
          const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
          const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
          from = toISODate(lastMon); to = toISODate(lastSun);
        } else if (period === 'this_month') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          from = toISODate(start); to = toISODate(end);
        } else if (period === 'prev_month') {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 0);
          from = toISODate(start); to = toISODate(end);
        }

        // Apply to date inputs
        if ($('filterStartDate')) $('filterStartDate').value = from;
        if ($('filterEndDate')) $('filterEndDate').value = to;
        if ($('filterMonth')) $('filterMonth').value = '';

        // Highlight active button
        document.querySelectorAll('.rec-qp-btn').forEach(b => b.classList.remove('active'));
        const idMap = {
          this_week: 'recQpThisWeek', prev_week: 'recQpPrevWeek',
          this_month: 'recQpThisMonth', prev_month: 'recQpPrevMonth'
        };
        const activeBtn = $(idMap[period]);
        if (activeBtn) activeBtn.classList.add('active');

        // Update button labels with live month names
        updateRecQpLabels();
        applyFilters();
      };

      // Update the month-name labels on the quick-period buttons
      function updateRecQpLabels() {
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();
        const thisM = MONTHS[now.getMonth()];
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevM = MONTHS[prevDate.getMonth()];
        const btnThis = $('recQpThisMonth');
        const btnPrev = $('recQpPrevMonth');
        if (btnThis) btnThis.textContent = `This Month (${thisM})`;
        if (btnPrev) btnPrev.textContent = `Prev Month (${prevM})`;
      }

      // ── Admin Approvals (Kotkansiipi) ─────────────────────────
      window.approveKotkansiipi = async function (docId) {
        try {
          const rec = allRecords.find(r => r.id === docId);
          const targetCol = (rec && rec._col) ? rec._col : "workHours";
          await updateDoc(doc(db, targetCol, docId), { approvalStatus: "approved", updatedAt: serverTimestamp() });
          logActivity("EDITED", "Admin approved Kotkansiipi entry", "Kotkansiipi");
          showToast("Entry approved!", "success");
        } catch (err) {
          console.error(err);
          showToast("Error approving entry.", "error");
        }
      };

      window.declineKotkansiipi = async function (docId) {
        try {
          const rec = allRecords.find(r => r.id === docId);
          const targetCol = (rec && rec._col) ? rec._col : "workHours";
          await deleteDoc(doc(db, targetCol, docId));
          logActivity("DELETED", "Admin declined & removed Kotkansiipi entry", "Kotkansiipi");
          showToast("Entry declined and deleted from database.", "warning");
        } catch (err) {
          console.error(err);
          showToast("Error declining entry.", "error");
        }
      };

      function renderAdminApprovals(records) {
        const card = $("adminApprovalsCard");
        if (!card) return;
        if (!isAdminUser()) {
          card.classList.add("hidden");
          return;
        }
        card.classList.remove("hidden");

        const pendingRecs = records.filter(r => r.location === "Kotkansiipi" && r.approvalStatus === "pending");
        const countEl = $("adminApprovalsCount");
        const emptyEl = $("adminApprovalsEmpty");
        const listEl = $("adminApprovalsList");
        const tbody = $("adminApprovalsTbody");
        const navBadge = $("navApprovalBadge");
        const sectionBadge = $("sectionApprovalBadge");

        if (countEl) {
          if (pendingRecs.length > 0) {
            countEl.innerHTML = `<i class="ri-notification-3-fill"></i> ${pendingRecs.length} Pending`;
            countEl.classList.remove("hidden");
          } else {
            countEl.textContent = "";
            countEl.classList.add("hidden");
          }
        }
        if (navBadge) {
          if (pendingRecs.length > 0) {
            navBadge.innerHTML = `<i class="ri-notification-3-fill" style="font-size:11px;margin-right:2px;"></i>${pendingRecs.length}`;
            navBadge.classList.remove("hidden");
          } else {
            navBadge.classList.add("hidden");
          }
        }
        if (sectionBadge) {
          if (pendingRecs.length > 0) {
            sectionBadge.innerHTML = `<i class="ri-notification-3-fill"></i> ${pendingRecs.length}`;
            sectionBadge.classList.remove("hidden");
          } else {
            sectionBadge.classList.add("hidden");
          }
        }

        if (!pendingRecs.length) {
          if (emptyEl) emptyEl.classList.remove("hidden");
          if (listEl) listEl.classList.add("hidden");
        } else {
          if (emptyEl) emptyEl.classList.add("hidden");
          if (listEl) listEl.classList.remove("hidden");
          if (tbody) {
            tbody.innerHTML = pendingRecs.map(r => {
              const ci = r.checkIn || (r.checkInSkipState === 'no_check_in' ? 'No check-in' : 'Not provided');
              const co = r.checkOut || '—';
              return `
          <tr>
            <td>${formatDateWithDay(r.date)}</td>
            <td><strong>${escHtml(capitalizeWord(r.addedBy || 'worker'))}</strong></td>
            <td>${ci} / ${co}</td>
            <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
            <td>${r.note ? escHtml(r.note) : '—'}</td>
            <td><span class="approval-badge pending"><i class="ri-time-line"></i> Needs Approval</span></td>
            <td>
              <div class="actions-cell">
                <button class="btn btn-success btn-sm" onclick="approveKotkansiipi('${r.id}')"><i class="ri-check-line"></i> Approve</button>
                <button class="btn btn-del btn-sm" onclick="declineKotkansiipi('${r.id}')"><i class="ri-close-line"></i> Decline</button>
              </div>
            </td>
          </tr>
        `;
            }).join("");
          }
        }

        // Also render Kotkansiipi worker entries in Approvals section
        const paneEmpty = $("adminPaneApprovalsEmpty");
        const paneWrapper = $("adminPaneApprovalsWrapper");
        const paneTbody = $("adminPaneApprovalsTbody");
        const allKotkansiipiWorkerRecs = records.filter(r => r.location === "Kotkansiipi" && r.approvalStatus && r.approvalStatus !== "declined");

        if (paneTbody) {
          if (!allKotkansiipiWorkerRecs.length) {
            if (paneEmpty) paneEmpty.classList.remove("hidden");
            if (paneWrapper) paneWrapper.classList.add("hidden");
          } else {
            if (paneEmpty) paneEmpty.classList.add("hidden");
            if (paneWrapper) paneWrapper.classList.remove("hidden");
            paneTbody.innerHTML = allKotkansiipiWorkerRecs.map(r => {
              const ci = r.checkIn || (r.checkInSkipState === 'no_check_in' ? 'No check-in' : 'Not provided');
              const co = r.checkOut || '—';
              let badge = '';
              if (r.approvalStatus === 'pending') {
                badge = `<span class="approval-badge pending"><i class="ri-time-line"></i> Needs Approval</span>`;
              } else if (r.approvalStatus === 'approved') {
                badge = `<span class="approval-badge approved"><i class="ri-checkbox-circle-line"></i> Approved</span>`;
              }
              return `
          <tr>
            <td>${formatDateWithDay(r.date)}</td>
            <td><strong>${escHtml(capitalizeWord(r.addedBy || 'worker'))}</strong></td>
            <td>${ci} / ${co}</td>
            <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
            <td>${r.note ? escHtml(r.note) : '—'}</td>
            <td>${badge}</td>
            <td>
              <div class="actions-cell">
                ${r.approvalStatus === 'pending' ? `<button class="btn btn-success btn-sm" onclick="approveKotkansiipi('${r.id}')"><i class="ri-check-line"></i> Approve</button>` : ''}
                <button class="btn btn-del btn-sm" onclick="declineKotkansiipi('${r.id}')"><i class="ri-close-line"></i> Decline</button>
              </div>
            </td>
          </tr>
        `;
            }).join("");
          }
        }
      }

      // ── Admin Tools (Accounts & Profiles) ─────────────────────
      let allAdminWorkers = [];
      let allAdminProfiles = [];

      window.switchAdminSubTab = function (tab) {
        const tabs = {
          accounts: { btn: $("adminTabAccounts"), pane: $("adminPaneAccounts") },
          profiles: { btn: $("adminTabProfiles"), pane: $("adminPaneProfiles") },
          approvals: { btn: $("adminTabApprovals"), pane: $("adminPaneApprovals") }
        };
        Object.keys(tabs).forEach(k => {
          if (tabs[k].btn) tabs[k].btn.className = (k === tab) ? "btn btn-primary" : "btn btn-ghost";
          if (tabs[k].pane) tabs[k].pane.classList.toggle("hidden", k !== tab);
        });
      };

      window.toggleAdminNewWorkerPw = function () {
        const inp = $("newWorkerPassword");
        const ico = $("newWorkerPwEye");
        if (!inp) return;
        inp.type = inp.type === "password" ? "text" : "password";
        if (ico) ico.className = inp.type === "text" ? "ri-eye-off-line" : "ri-eye-line";
      };

      function subscribeAdminTools() {
        if (!isAdminUser()) return;

        // Workers accounts listener
        const qW = query(collection(db, "workers"), orderBy("createdAt", "desc"));
        onSnapshot(qW, snap => {
          allAdminWorkers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          renderAdminWorkersTable(allAdminWorkers);
          populateAdminUsernameSelect(allAdminWorkers);
        });

        // Worker profiles listener
        const qP = query(collection(db, "workerProfiles"), orderBy("createdAt", "desc"));
        onSnapshot(qP, snap => {
          allAdminProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          renderAdminProfilesTable(allAdminProfiles);
        });
      }

      window.handleCreateWorker = async function (e) {
        e.preventDefault();
        const username = ($("newWorkerUsername").value || "").trim().toLowerCase();
        const password = $("newWorkerPassword").value || "";
        const errEl = $("createWorkerError");
        const btn = $("createWorkerBtn");

        if (errEl) errEl.textContent = "";

        if (!username || username.length < 2) {
          if (errEl) errEl.textContent = "Username must be at least 2 characters.";
          return;
        }
        if (!password || password.length < 4) {
          if (errEl) errEl.textContent = "Password must be at least 4 characters.";
          return;
        }

        const snap = await getDocs(query(collection(db, "workers"), where("username", "==", username)));
        if (!snap.empty) {
          if (errEl) errEl.textContent = "Username already exists.";
          return;
        }

        btn.disabled = true;
        try {
          const hash = await sha256(password);
          await addDoc(collection(db, "workers"), {
            username,
            passwordHash: hash,
            createdAt: serverTimestamp()
          });
          $("createWorkerForm").reset();
          showToast("Worker account created!", "success");
        } catch (err) {
          console.error(err);
          showToast("Error creating worker account.", "error");
        } finally {
          btn.disabled = false;
        }
      };

      window.deleteWorkerAccount = async function (id, username) {
        if (!confirm(`Delete worker account "${username}"?`)) return;
        try {
          await deleteDoc(doc(db, "workers", id));
          showToast(`Worker "${username}" deleted.`, "warning");
        } catch (err) {
          console.error(err);
          showToast("Error deleting worker.", "error");
        }
      };

      function renderAdminWorkersTable(workers) {
        const empty = $("workersListEmpty");
        const wrapper = $("workersListTableWrapper");
        const tbody = $("workersListTbody");
        if (!tbody) return;

        if (!workers.length) {
          if (empty) empty.classList.remove("hidden");
          if (wrapper) wrapper.classList.add("hidden");
          return;
        }
        if (empty) empty.classList.add("hidden");
        if (wrapper) wrapper.classList.remove("hidden");

        tbody.innerHTML = workers.map(w => {
          const created = w.createdAt?.toDate ? w.createdAt.toDate().toLocaleDateString() : "—";
          return `
      <tr>
        <td><strong>${escHtml(capitalizeWord(w.username))}</strong></td>
        <td style="color:var(--clr-text-muted);">${created}</td>
        <td>
          <button class="btn btn-del btn-sm" onclick="deleteWorkerAccount('${w.id}', '${escHtml(w.username)}')">
            <i class="ri-delete-bin-6-line"></i> Delete
          </button>
        </td>
      </tr>
    `;
        }).join("");
      }

      function populateAdminUsernameSelect(workers) {
        const sel = $("profileUsername");
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">— Select account —</option>';
        workers.forEach(w => {
          const opt = document.createElement("option");
          opt.value = w.username;
          opt.textContent = capitalizeWord(w.username);
          if (w.username === cur) opt.selected = true;
          sel.appendChild(opt);
        });
      }

      window.handleCreateProfile = async function (e) {
        e.preventDefault();
        const fullName = ($("profileFullName").value || "").trim();
        const username = ($("profileUsername").value || "").trim();
        const notes = ($("profileNotes").value || "").trim();
        const editId = $("editProfileDocId") ? $("editProfileDocId").value : "";
        const errEl = $("createProfileError");
        const btn = $("createProfileBtn");

        if (errEl) errEl.textContent = "";
        if (!fullName) {
          if (errEl) errEl.textContent = "Full name is required.";
          return;
        }

        btn.disabled = true;
        try {
          if (editId) {
            await updateDoc(doc(db, "workerProfiles", editId), {
              fullName,
              username,
              notes,
              updatedAt: serverTimestamp()
            });
            showToast("Profile updated!", "success");
            cancelProfileEdit();
          } else {
            await addDoc(collection(db, "workerProfiles"), {
              fullName,
              username,
              notes,
              createdAt: serverTimestamp()
            });
            $("createProfileForm").reset();
            showToast("Worker profile saved!", "success");
          }
        } catch (err) {
          console.error(err);
          showToast("Error saving profile.", "error");
        } finally {
          btn.disabled = false;
        }
      };

      window.editWorkerProfile = function (id) {
        const p = allAdminProfiles.find(x => x.id === id);
        if (!p) return;
        if ($("profileFullName")) $("profileFullName").value = p.fullName || "";
        if ($("profileUsername")) $("profileUsername").value = p.username || "";
        if ($("profileNotes")) $("profileNotes").value = p.notes || "";
        if ($("editProfileDocId")) $("editProfileDocId").value = id;
        if ($("createProfileBtnText")) $("createProfileBtnText").textContent = "Update Profile";
        if ($("cancelProfileEditBtn")) $("cancelProfileEditBtn").style.display = "";
        if ($("profileFormHeading")) $("profileFormHeading").innerHTML = '<i class="ri-edit-line"></i> Edit Worker Profile';
      };

      window.cancelProfileEdit = function () {
        if ($("createProfileForm")) $("createProfileForm").reset();
        if ($("editProfileDocId")) $("editProfileDocId").value = "";
        if ($("createProfileBtnText")) $("createProfileBtnText").textContent = "Save Profile";
        if ($("cancelProfileEditBtn")) $("cancelProfileEditBtn").style.display = "none";
        if ($("profileFormHeading")) $("profileFormHeading").innerHTML = '<i class="ri-id-card-line"></i> Create Worker Profile';
      };

      window.deleteWorkerProfile = async function (id, name) {
        if (!confirm(`Delete profile for "${name}"?`)) return;
        try {
          await deleteDoc(doc(db, "workerProfiles", id));
          showToast(`Profile "${name}" deleted.`, "warning");
        } catch (err) {
          console.error(err);
          showToast("Error deleting profile.", "error");
        }
      };

      function renderAdminProfilesTable(profiles) {
        const empty = $("profilesListEmpty");
        const wrapper = $("profilesListTableWrapper");
        const tbody = $("profilesListTbody");
        if (!tbody) return;

        if (!profiles.length) {
          if (empty) empty.classList.remove("hidden");
          if (wrapper) wrapper.classList.add("hidden");
          return;
        }
        if (empty) empty.classList.add("hidden");
        if (wrapper) wrapper.classList.remove("hidden");

        tbody.innerHTML = profiles.map(p => `
    <tr>
      <td><strong>${escHtml(p.fullName)}</strong></td>
      <td>${p.username ? `<span class="location-badge">@${escHtml(capitalizeWord(p.username))}</span>` : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td>${p.notes ? escHtml(p.notes) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-edit btn-sm" onclick="editWorkerProfile('${p.id}')"><i class="ri-edit-line"></i> Edit</button>
          <button class="btn btn-del btn-sm" onclick="deleteWorkerProfile('${p.id}', '${escHtml(p.fullName)}')"><i class="ri-delete-bin-6-line"></i> Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
      }

      function getAddedByName(r) {
        let raw = (r && r.addedBy) ? String(r.addedBy).trim() : "";
        if (!raw && r && r._col && r._col.startsWith("workHours_")) {
          raw = r._col.replace("workHours_", "");
        }
        const lower = raw.toLowerCase();
        if (!raw || lower === "admin" || lower === "prastika" || lower === "prasiddha") {
          return "Prasiddha";
        }
        return capitalizeWord(raw);
      }

      function getAssignedToName(r) {
        if (r && r._col && r._col.startsWith("workHours_")) {
          const worker = r._col.replace("workHours_", "");
          return capitalizeWord(worker);
        }
        return "Prasiddha";
      }

      function getAddedByHtml(r) {
        const name = getAddedByName(r);
        return `<div style="margin-top:4px;font-size:11.5px;color:var(--clr-text-muted);font-weight:500;"><i class="ri-user-line"></i> Added by <strong>${escHtml(name)}</strong></div>`;
      }

      function getAdminApprovalHtml(r) {
        if (!isAdminUser() || r.location !== "Kotkansiipi") return "";
        if (r.approvalStatus === "pending") {
          return `
      <div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="approval-badge pending"><i class="ri-error-warning-line"></i> Needs Approval</span>
        <button class="btn btn-success btn-sm" style="padding:3px 8px;font-size:11.5px;" onclick="approveKotkansiipi('${r.id}')"><i class="ri-check-line"></i> Approve</button>
        <button class="btn btn-del btn-sm" style="padding:3px 8px;font-size:11.5px;" onclick="declineKotkansiipi('${r.id}')"><i class="ri-close-line"></i> Decline</button>
      </div>
    `;
        } else if (r.approvalStatus === "approved") {
          return `<div style="margin-top:4px;"><span class="approval-badge approved"><i class="ri-checkbox-circle-line"></i> Approved</span></div>`;
        } else if (r.approvalStatus === "declined") {
          return `<div style="margin-top:4px;"><span class="approval-badge declined"><i class="ri-close-circle-line"></i> Declined</span></div>`;
        }
        return "";
      }

      // ── Records Table ─────────────────────────────────────────
      function renderRecordsTable(records) {
        const spinner = $("recordsSpinner");
        const empty = $("recordsEmpty");
        const wrapper = $("recordsTableWrapper");
        const tbody = $("recordsTableBody");

        spinner.classList.add("hidden");

        if (!records.length) {
          empty.classList.remove("hidden");
          wrapper.classList.add("hidden");
          return;
        }
        empty.classList.add("hidden");
        wrapper.classList.remove("hidden");

        const totalHours = records.reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);
        const rowsHtml = records.map(r => `
    <tr>
      <td>${formatDateWithDay(r.date)}</td>
      <td>
        <span class="location-badge badge-${r.location.replace(/[^a-zA-Z0-9]/g, '')}">${r.location}</span>
        ${getAddedByHtml(r)}
        ${getAdminApprovalHtml(r)}
      </td>
      <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
      <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
      <td>${r.guests || '—'}</td>
      <td style="max-width:200px;word-break:break-word">${r.note ? escHtml(r.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-edit" onclick="editEntry('${r.id}')"><i class="ri-edit-line"></i> Edit</button>
          <button class="btn btn-del"  onclick="deleteEntry('${r.id}')"><i class="ri-delete-bin-6-line"></i> Delete</button>
        </div>
      </td>
    </tr>
  `).join("");

        tbody.innerHTML = rowsHtml + `
    <tr style="background: var(--clr-surface-2); font-weight: 700;">
      <td colspan="4" style="text-align: right;">Total Working Hours:</td>
      <td><span class="hours-pill" style="background: var(--clr-primary); color: white;">${totalHours.toFixed(2)}h</span></td>
      <td colspan="3"></td>
    </tr>
  `;
      }

      // ── Generate Text Summary ──────────────────────────────────
      window.generateTextSummary = function () {
        if (!filteredRecords.length) {
          showToast("No records to summarize.", "warning");
          return;
        }

        // Build title from checked location filters, or fall back to unique locations in results
        const checkedLocs = [...document.querySelectorAll('input[name="filterLoc"]:checked')].map(cb => cb.value);
        const titleLocs = checkedLocs.length > 0
          ? checkedLocs
          : [...new Set(filteredRecords.map(r => r.location))];
        const locationTitle = titleLocs.join(" & ");
        const summaryTitle = `${locationTitle} Working Hours`;
        const separator = "=".repeat(Math.max(summaryTitle.length, 40));

        const grouped = {};
        filteredRecords.forEach(r => {
          if (!grouped[r.date]) grouped[r.date] = [];
          grouped[r.date].push(r);
        });

        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        const lines = Object.keys(grouped).sort().map(dateStr => {
          const d = new Date(dateStr);
          const dateFormatted = `${monthNames[d.getMonth()]} ${d.getDate()}`;

          const locStrings = grouped[dateStr].map(r => {
            const hrs = r.totalHours ? r.totalHours.toFixed(2).replace(/\.00$/, '') : "0";
            return `${r.location} (${hrs} Hours)`;
          }).join(" + ");

          return `${dateFormatted} : ${locStrings}`;
        });

        const totalSummaryHours = filteredRecords.reduce((sum, r) => sum + (parseFloat(r.totalHours) || 0), 0);
        const totalSummaryStr = totalSummaryHours.toFixed(2).replace(/\.00$/, '');

        let text = `${summaryTitle}\n${separator}\n`;
        text += lines.join("\n");
        text += "\n----------------------------------------------------------\n";
        text += `Total Hours : ${totalSummaryStr} Hours`;

        $("summaryText").value = text;
        $("summaryContainer").classList.remove("hidden");
        showToast("Summary generated!", "success");
      };

      window.copyTextSummary = function () {
        const text = $("summaryText").value;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
          showToast("Summary copied to clipboard!", "success");
        }).catch(err => {
          console.error("Could not copy text: ", err);
          showToast("Failed to copy text.", "error");
        });
      };

      // ── Toast ─────────────────────────────────────────────────
      function showToast(message, type = "info") {
        const icons = { success: "ri-checkbox-circle-line", error: "ri-error-warning-line", warning: "ri-alert-line", info: "ri-information-line" };
        const container = $("toastContainer");
        const toast = el("div", `toast ${type}`);
        toast.innerHTML = `<i class="${icons[type] || icons.info}"></i><span>${escHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
          toast.classList.add("hide");
          setTimeout(() => toast.remove(), 300);
        }, 3500);
      }

      // ── Utilities ─────────────────────────────────────────────
      function formatDate(iso) {
        if (!iso) return "—";
        const [y, m, d] = iso.split("-");
        return `${d}/${m}/${y}`;
      }

      function formatDateWithDay(iso) {
        if (!iso) return "—";
        const [y, m, d] = iso.split("-");
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const dayName = days[new Date(`${y}-${m}-${d}T12:00:00`).getDay()];
        return `<span style="font-weight:600;">${dayName}</span><br><span style="font-size:12px;color:var(--clr-text-muted);">${d}/${m}/${y}</span>`;
      }

      function capitalizeWord(str) {
        if (!str) return "";
        const s = String(str).trim();
        return s.charAt(0).toUpperCase() + s.slice(1);
      }

      function escHtml(str) {
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      // ── Initialization ─────────────────────────────────────────
      // Note: subscribeFirestore(), subscribeActivities(), setDefaultDate(),
      // and initTheme() are called inside the DOMContentLoaded handler above.

      // ── Dashboard Filter State ─────────────────────────────────
      let dashFilter = {
        period: 'this_month',   // this_month | last_month | this_week | last_week | custom
        fromDate: '',
        toDate: '',
        locations: []           // [] = all locations
      };

      // Helper: return current and previous month names
      function getDashMonthNames() {
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'];
        const now = new Date();
        const thisMon = MONTHS[now.getMonth()];
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMon = MONTHS[prevDate.getMonth()];
        return { thisMonth: thisMon, lastMonth: lastMon };
      }

      // Open the modal
      window.openDashFilter = function () {
        // Inject live month names into the chips
        const { thisMonth, lastMonth } = getDashMonthNames();
        const chipThis = $('dfmChipThisMonth');
        const chipLast = $('dfmChipLastMonth');
        if (chipThis) chipThis.textContent = `This Month (${thisMonth})`;
        if (chipLast) chipLast.textContent = `Last Month (${lastMonth})`;

        // Sync UI to current state
        document.querySelectorAll('.dfm-chip[data-period]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.period === dashFilter.period);
        });
        document.querySelectorAll('.dfm-loc-chip').forEach(btn => {
          btn.classList.toggle('active', dashFilter.locations.includes(btn.dataset.loc));
        });
        const customRange = $('dfmCustomRange');
        if (dashFilter.period === 'custom') customRange.classList.remove('hidden');
        else customRange.classList.add('hidden');
        if ($('dfmFrom')) $('dfmFrom').value = dashFilter.fromDate;
        if ($('dfmTo')) $('dfmTo').value = dashFilter.toDate;
        $('dashFilterOverlay').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
      };

      // Close the modal
      window.closeDashFilter = function () {
        $('dashFilterOverlay').classList.add('hidden');
        document.body.style.overflow = '';
      };

      // Close on backdrop click
      window.closeDashFilterOnBg = function (e) {
        if (e.target === $('dashFilterOverlay')) closeDashFilter();
      };

      // Period chip click
      window.selectDfmPeriod = function (btn) {
        document.querySelectorAll('.dfm-chip[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const period = btn.dataset.period;
        const customRange = $('dfmCustomRange');
        if (period === 'custom') customRange.classList.remove('hidden');
        else customRange.classList.add('hidden');
      };

      // Location chip toggle
      window.toggleDfmLoc = function (btn) {
        btn.classList.toggle('active');
      };

      // Apply the filter
      window.applyDashFilter = function () {
        const activePeriodBtn = document.querySelector('.dfm-chip[data-period].active');
        dashFilter.period = activePeriodBtn ? activePeriodBtn.dataset.period : 'this_month';
        dashFilter.fromDate = $('dfmFrom') ? $('dfmFrom').value : '';
        dashFilter.toDate = $('dfmTo') ? $('dfmTo').value : '';
        dashFilter.locations = [...document.querySelectorAll('.dfm-loc-chip.active')].map(b => b.dataset.loc);
        closeDashFilter();
        updateStats(allRecords);
        renderDashActivePills();
      };

      // Reset the filter
      window.resetDashFilter = function () {
        dashFilter = { period: 'this_month', fromDate: '', toDate: '', locations: [] };
        document.querySelectorAll('.dfm-chip[data-period]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.period === 'this_month');
        });
        document.querySelectorAll('.dfm-loc-chip').forEach(btn => btn.classList.remove('active'));
        $('dfmCustomRange').classList.add('hidden');
        if ($('dfmFrom')) $('dfmFrom').value = '';
        if ($('dfmTo')) $('dfmTo').value = '';
        closeDashFilter();
        updateStats(allRecords);
        renderDashActivePills();
      };

      // Compute the ISO date range for the active filter period
      function getDashDateRange() {
        const now = new Date();

        if (dashFilter.period === 'this_month') {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          return { from: toISODate(start), to: toISODate(end) };
        }

        if (dashFilter.period === 'last_month') {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 0);
          return { from: toISODate(start), to: toISODate(end) };
        }

        if (dashFilter.period === 'this_week') {
          const daysFromMon = (now.getDay() + 6) % 7;
          const start = new Date(now); start.setDate(now.getDate() - daysFromMon); start.setHours(0, 0, 0, 0);
          const end = new Date(start); end.setDate(start.getDate() + 6);
          return { from: toISODate(start), to: toISODate(end) };
        }

        if (dashFilter.period === 'last_week') {
          const daysFromMon = (now.getDay() + 6) % 7;
          const thisMon = new Date(now); thisMon.setDate(now.getDate() - daysFromMon); thisMon.setHours(0, 0, 0, 0);
          const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
          const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
          return { from: toISODate(lastMon), to: toISODate(lastSun) };
        }

        if (dashFilter.period === 'custom') {
          return { from: dashFilter.fromDate || '0000-01-01', to: dashFilter.toDate || '9999-12-31' };
        }

        // fallback → this month
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: toISODate(start), to: toISODate(end) };
      }

      // Render active-filter pills under the header
      function renderDashActivePills() {
        const pillsEl = $('dashActivePills');
        if (!pillsEl) return;

        const dot = $('dashFilterDot');
        const isFiltered = dashFilter.period !== 'this_month' || dashFilter.locations.length > 0;

        // Dot indicator on the filter button
        if (dot) dot.classList.toggle('hidden', !isFiltered);

        // Build human-readable label with live month names
        const { thisMonth, lastMonth } = getDashMonthNames();
        const periodLabels = {
          this_month: `This Month (${thisMonth})`,
          last_month: `Last Month (${lastMonth})`,
          this_week: 'This Week',
          last_week: 'Last Week',
          custom: 'Custom Range'
        };

        let html = '';
        html += `<span class="dap-pill"><i class="ri-calendar-2-line"></i>${periodLabels[dashFilter.period] || `This Month (${thisMonth})`}</span>`;

        if (dashFilter.period === 'custom' && (dashFilter.fromDate || dashFilter.toDate)) {
          const f = dashFilter.fromDate ? formatDate(dashFilter.fromDate) : '…';
          const t = dashFilter.toDate ? formatDate(dashFilter.toDate) : '…';
          html += `<span class="dap-pill"><i class="ri-calendar-range-line"></i>${f} → ${t}</span>`;
        }

        dashFilter.locations.forEach(loc => {
          html += `<span class="dap-pill"><i class="ri-building-line"></i>${loc}</span>`;
        });

        pillsEl.innerHTML = html;
      }
