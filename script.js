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
  serverTimestamp
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

// ── Activity Helper ───────────────────────────────────────
async function logActivity(action, message) {
  try {
    await addDoc(collection(db, "activityLogs"), {
      action,
      message,
      timestamp: serverTimestamp()
    });
  } catch(e) {
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
  setDefaultDate();
  initTheme();
  subscribeFirestore();
});

// ── Set tomorrow's date as default ────────────────────────
function setDefaultDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  $("date").value = toISODate(tomorrow);

  if ($("qDate")) {
    $("qDate").value = toISODate(new Date());
  }
}

function toISODate(d) {
  return d.toISOString().split("T")[0];
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
    existingValues[loc] = {
      checkOut: block.querySelector('.d-checkout').value,
      checkIn: block.querySelector('.d-checkin').value,
      hours: block.querySelector('.d-hours').value,
      guests: block.querySelector('.d-guests').value,
    };
  });

  let html = "";
  checkboxes.forEach(cb => {
    const loc = cb.value;
    const isPuistola = loc === "House Cleaning (Puistola)";
    const vals = existingValues[loc] || { 
      checkOut: isPuistola ? "20:30" : "", 
      checkIn: isPuistola ? "18:00" : "15:00", 
      hours: isPuistola ? "2.5" : "2", 
      guests: "" 
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

          </div>
        </div>
      `;
    }
  });
  
  container.innerHTML = html;
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
    if(reqMark) reqMark.classList.remove("hidden");
  } else {
    // Activate the new state
    window.checkInSkipStates[loc] = stateType;
    input.disabled = true;
    input.classList.add("disabled-input");
    input.value = "";
    input.classList.remove("error");
    
    if(reqMark) reqMark.classList.add("hidden");
    if(guestsError) guestsError.textContent = "";
    if(guestsInput) guestsInput.classList.remove("error");

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
      if(reqMark) reqMark.classList.remove("hidden");
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

function renderActivitiesTable(activities) {
  const tbody = $("activitiesTableBody");
  if(!tbody) return;

  if (!activities.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--clr-text-muted)">No activities recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = activities.map(a => {
    const timeStr = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().toLocaleString() : "Just now";
    let actionBadge = "";
    if (a.action === "ADDED") actionBadge = '<span class="location-badge" style="background:var(--clr-success);color:white">Added</span>';
    else if (a.action === "EDITED") actionBadge = '<span class="location-badge" style="background:var(--clr-primary);color:white">Edited</span>';
    else if (a.action === "DELETED") actionBadge = '<span class="location-badge" style="background:var(--clr-danger);color:white">Deleted</span>';

    return `
      <tr>
        <td style="white-space:nowrap;color:var(--clr-text-muted);font-size:0.875rem;">${timeStr}</td>
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
    const skipState = window.checkInSkipStates[loc] || false;

    // Work Hours (always required)
    const hours = $(`workHours_${loc}`);
    const hoursErr = $(`workHoursError_${loc}`);
    if (!hours.value || parseFloat(hours.value) <= 0) {
      if(hoursErr) hoursErr.textContent = "Please enter valid work hours.";
      if(hours) hours.classList.add("error");
      valid = false;
    } else {
      if(hoursErr) hoursErr.textContent = "";
      if(hours) hours.classList.remove("error");
    }

    // Check-In (required UNLESS skipped)
    if (!skipState) {
      const ci = $(`checkIn_${loc}`);
      const ciErr = $(`checkInError_${loc}`);
      if (!ci || !ci.value) {
        if(ciErr) ciErr.textContent = "Please enter check-in time, or mark it as skipped.";
        if(ci) ci.classList.add("error");
        valid = false;
      } else {
        if(ciErr) ciErr.textContent = "";
        if(ci) ci.classList.remove("error");
      }

      // Guests (required if check-in not skipped)
      const guests = $(`guests_${loc}`);
      const guestsErr = $(`guestsError_${loc}`);
      if (!guests || !guests.value || parseInt(guests.value) <= 0) {
        if(guestsErr) guestsErr.textContent = "Please enter number of guests.";
        if(guests) guests.classList.add("error");
        valid = false;
      } else {
        if(guestsErr) guestsErr.textContent = "";
        if(guests) guests.classList.remove("error");
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
  const notesVal = $("notes").value.trim();
  const checkboxes = document.querySelectorAll('input[name="dLoc"]:checked');
  const editId = $("editDocId").value;

  const submissions = [];
  checkboxes.forEach(cb => {
    const loc = cb.value;
    const skipState = window.checkInSkipStates[loc] || false;
    const totalHours = parseFloat($(`workHours_${loc}`).value) || 0;
    
    submissions.push({
      location: loc,
      date: dateVal,
      checkIn: skipState ? "" : $(`checkIn_${loc}`).value,
      checkInSkipState: skipState,
      checkOut: $(`checkOut_${loc}`).value || "",
      totalHours: totalHours,
      guests: parseInt($(`guests_${loc}`).value) || "",
      note: notesVal,
    });
  });

  try {
    if (editId) {
      // UPDATE existing record
      const data = submissions[0];
      await updateDoc(doc(db, "workHours", editId), { ...data, updatedAt: serverTimestamp() });
      logActivity("EDITED", `Updated work entry for ${data.location}`);
      showToast("Entry updated successfully!", "success");
      cancelEdit();
    } else {
      // ADD NEW (one or multiple)
      const promises = submissions.map(async (data) => {
        await addDoc(collection(db, "workHours"), { ...data, createdAt: serverTimestamp() });
        logActivity("ADDED", `Added new work entry for ${data.location}`);
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
    const promises = submissions.map(async (sub) => {
      const data = {
        location: sub.loc,
        date: date,
        checkIn: "",
        checkInSkipState: "not_provided",
        checkOut: "",
        totalHours: sub.hrs,
        guests: "",
        note: $("qNotes").value.trim(),
      };
      await addDoc(collection(db, "workHours"), { ...data, createdAt: serverTimestamp() });
      logActivity("ADDED", `Quick added working hour for ${sub.loc}`);
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
  $("notes").value = rec.note || "";
  $("editDocId").value = docId;

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
  if ($(`checkIn_${loc}`) && rec.checkInSkipState === false) {
    $(`checkIn_${loc}`).value = rec.checkIn || "15:00";
  }

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
    // Attempt to get the location of the record before deleting so we can log it
    const rec = allRecords.find(r => r.id === pendingDeleteId);
    await deleteDoc(doc(db, "workHours", pendingDeleteId));
    logActivity("DELETED", `Deleted work entry${rec ? ' for ' + rec.location : ''}`);
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

// ── Firestore Real-Time Listener ───────────────────────────
function subscribeFirestore() {
  const q = query(collection(db, "workHours"), orderBy("date", "desc"));

  onSnapshot(q, snapshot => {
    allRecords = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilters();
    updateStats(allRecords);
    renderThisMonthTable(allRecords);
    renderTodayTable(allRecords);
    renderTomorrowTable(allRecords);
    // hide spinners (guard against elements that may not exist)
    if ($("dashboardSpinner")) $("dashboardSpinner").classList.add("hidden");
    if ($("recordsSpinner")) $("recordsSpinner").classList.add("hidden");
  }, err => {
    console.error("Firestore error:", err);
    showToast("Could not connect to Firestore.", "error");
    if ($("dashboardSpinner")) $("dashboardSpinner").classList.add("hidden");
    if ($("recordsSpinner")) $("recordsSpinner").classList.add("hidden");
  });
}

function subscribeActivities() {
  const q = query(collection(db, "activityLogs"), orderBy("timestamp", "desc"));
  onSnapshot(q, snapshot => {
    allActivities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderActivitiesTable(allActivities);
  });
}

// ── Stats ─────────────────────────────────────────────────
function updateStats(records) {
  const byLoc = loc => records.filter(r => r.location === loc).reduce((s, r) => s + (r.totalHours || 0), 0);

  const now = new Date();

  // Calculate this month's hours
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const isoMonthStart = toISODate(startOfMonth);

  const thisMonthHrs = records
    .filter(r => r.date >= isoMonthStart && r.date <= toISODate(now))
    .reduce((s, r) => s + (r.totalHours || 0), 0);

  // Calculate this week's hours
  const day = now.getDay() || 7; // Convert Sun=0 to 7
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - day + 1);
  startOfWeek.setHours(0, 0, 0, 0);
  const isoWeekStart = toISODate(startOfWeek);

  const thisWeekHrs = records
    .filter(r => r.date >= isoWeekStart && r.date <= toISODate(now))
    .reduce((s, r) => s + (r.totalHours || 0), 0);

  if ($("statThisMonthHours")) $("statThisMonthHours").textContent = thisMonthHrs.toFixed(1);
  if ($("statThisWeekHours")) $("statThisWeekHours").textContent = thisWeekHrs.toFixed(1);

  $("statKotkansiipi").textContent = byLoc("Kotkansiipi").toFixed(1) + "h";
  $("statRautkallionkatu").textContent = byLoc("Rautkallionkatu").toFixed(1) + "h";
  $("statKakoisvayla").textContent = byLoc("Kakoisvayla").toFixed(1) + "h";
  $("statMayavatie").textContent = byLoc("Mayavatie").toFixed(1) + "h";
}

// ── This Month Table ──────────────────────────────────────
function renderThisMonthTable(records) {
  const empty = $("thisMonthEmpty");
  const wrapper = $("thisMonthTableWrapper");
  const tbody = $("thisMonthTableBody");

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const isoMonthStart = toISODate(startOfMonth);

  // Format month like "June"
  const formattedMonth = now.toLocaleDateString('en-GB', { month: 'long' });
  $("thisMonthTitle").innerHTML = `<i class="ri-calendar-line"></i> This month (${formattedMonth}) work hours`;

  const thisMonthRecords = records.filter(r => r.date >= isoMonthStart && r.date <= toISODate(now));

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
      <td><span class="location-badge badge-${r.location.replace(/[^a-zA-Z0-9]/g, '')}">${r.location}</span></td>
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
  const rowsHtml = todayRecords.map(r => `
    <tr>
      <td><span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span></td>
      <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
      <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
      <td>${r.guests || '—'}</td>
      <td>${r.note ? escHtml(r.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
    </tr>
  `).join("");

  tbody.innerHTML = rowsHtml + `
    <tr class="dash-total-row">
      <td colspan="3" style="text-align:right;">Total Working Hours:</td>
      <td><span class="hours-pill">${totalHours.toFixed(2)}h</span></td>
      <td colspan="2"></td>
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

    return `
      <div class="work-card">
        <div class="work-card-header">
          <span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span>
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
        ${noteHtml}
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
  const rowsHtml = tmrRecords.map(r => `
    <tr>
      <td><span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span></td>
      <td>${r.checkIn ? r.checkIn : (r.checkInSkipState === 'no_check_in' ? '<span style="color:var(--clr-text-muted);font-style:italic">No check-in</span>' : (r.checkInSkipState === 'not_provided' ? '<span style="color:var(--clr-text-muted);font-style:italic">Not provided</span>' : '<span style="color:var(--clr-text-muted)">—</span>'))}</td>
      <td>${r.checkOut ? r.checkOut : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
      <td><span class="hours-pill">${r.totalHours ? r.totalHours.toFixed(2) + 'h' : '—'}</span></td>
      <td>${r.guests || '—'}</td>
      <td>${r.note ? escHtml(r.note) : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
    </tr>
  `).join("");

  tbody.innerHTML = rowsHtml + `
    <tr class="dash-total-row">
      <td colspan="3" style="text-align:right;">Total Working Hours:</td>
      <td><span class="hours-pill">${totalHours.toFixed(2)}h</span></td>
      <td colspan="2"></td>
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

    return `
      <div class="work-card">
        <div class="work-card-header">
          <span class="dash-loc-chip"><i class="ri-building-line"></i>${r.location}</span>
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
        ${noteHtml}
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

// ── Filters ────────────────────────────────────────────────
window.applyFilters = function () {
  // Collect all checked location checkboxes
  const checkedLocs = new Set(
    [...document.querySelectorAll('input[name="filterLoc"]:checked')].map(cb => cb.value)
  );
  const month = $("filterMonth").value;    // "YYYY-MM"
  const startDate = $("filterStartDate").value;
  const endDate = $("filterEndDate").value;
  const noteQ = $("filterNotes").value.trim().toLowerCase();

  filteredRecords = allRecords.filter(r => {
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
  // Uncheck all location checkboxes
  document.querySelectorAll('input[name="filterLoc"]').forEach(cb => cb.checked = false);
  ["filterMonth", "filterStartDate", "filterEndDate", "filterNotes"]
    .forEach(id => { const el = $(id); if (el) el.value = ""; });
  applyFilters();
};

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
      <td>${formatDate(r.date)}</td>
      <td><span class="location-badge badge-${r.location.replace(/[^a-zA-Z0-9]/g, '')}">${r.location}</span></td>
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
