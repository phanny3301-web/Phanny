const $ = (s) => document.querySelector(s),
  todayISO = () => {
    const d = new Date();
    return new Date(d - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
  },
  labels = {
    present: "មានវត្តមាន",
    absent: "អវត្តមាន",
    late: "មកយឺត",
    unmarked: "មិនទាន់កត់",
  };
let currentUser = null,
  students = [],
  records = {},
  holidays = [],
  userCount = 0,
  selectedDate = todayISO(),
  activeFilter = "all",
  search = "";
async function api(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!r.ok) {
    const x = await r.json().catch(() => ({}));
    throw Error(x.error || `សំណើបរាជ័យ (${r.status})`);
  }
  return r.status === 204 ? null : r.json();
}
function msg(s) {
  const t = $("#toast");
  t.textContent = s;
  t.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function auth(setup = false) {
  $("#authScreen").hidden = false;
  $(".sidebar").hidden = true;
  $(".main").hidden = true;
  $("#setupFields").hidden = !setup;
  $("#authTitle").textContent = setup
    ? "បង្កើតអ្នកគ្រប់គ្រង"
    : "ចូល ClassTrack";
  $("#authCaption").textContent = setup
    ? "បង្កើតគណនីដំបូង ដើម្បីការពារប្រព័ន្ធ"
    : "សូមចូលគណនីរបស់អ្នក";
  $("#authSubmit").textContent = setup ? "បង្កើតគណនី និងបន្ត" : "ចូលប្រើ";
  $("#authError").textContent = "";
  $("#authForm").dataset.setup = setup ? "yes" : "no";
}
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget),
    setup = e.currentTarget.dataset.setup === "yes";
  $("#authError").textContent = "";
  try {
    const data = { username: f.get("username"), password: f.get("password") };
    if (setup) data.name = f.get("name");
    const out = await api(setup ? "/api/setup" : "/api/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    currentUser = out.user;
    await startApp();
  } catch (err) {
    $("#authError").textContent = err.message;
  }
});
async function boot() {
  try {
    const s = await api("/api/setup-status");
    if (s.setupRequired) {
      auth(true);
      return;
    }
    try {
      const out = await api("/api/me");
      currentUser = out.user;
      await startApp();
    } catch {
      auth(false);
    }
  } catch {
    $("#authScreen").hidden = false;
    $(".sidebar").hidden = true;
    $(".main").hidden = true;
    $("#authTitle").textContent = "មិនអាចភ្ជាប់ server";
    $("#authCaption").textContent =
      "សូមដំណើរការ server.py ហើយបើក http://localhost:8000";
    $("#authForm").hidden = true;
  }
}
async function refresh() {
  const out = await api("/api/data?date=" + selectedDate);
  students = out.students;
  records = out.records;
  holidays = out.holidays;
  userCount = out.userCount;
  render();
}
async function startApp() {
  $("#authScreen").hidden = true;
  $(".sidebar").hidden = false;
  $(".main").hidden = false;
  $("#userName").textContent = currentUser.name;
  $("#helloName").textContent = currentUser.name;
  $("#userRole").textContent =
    currentUser.role === "admin" ? "អ្នកគ្រប់គ្រង" : "គ្រូ";
  document
    .querySelectorAll(".admin-only")
    .forEach((e) => (e.hidden = currentUser.role !== "admin"));
  document
    .querySelectorAll(".today-label")
    .forEach(
      (e) =>
        (e.textContent = new Intl.DateTimeFormat("km-KH", {
          dateStyle: "long",
        }).format(new Date())),
    );
  $("#dateDisplay").textContent = new Intl.DateTimeFormat("km-KH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  $("#dayDisplay").textContent = new Intl.DateTimeFormat("km-KH", {
    weekday: "long",
  }).format(new Date());
  $("#datePicker").value = selectedDate;
  $("#reportMonth").value = selectedDate.slice(0, 7);
  await refresh();
}
function avatar(s) {
  return s
    .trim()
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
}
function render() {
  const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
  students.forEach((s) => counts[records[s.id]?.status || "unmarked"]++);
  $("#totalStat").textContent = students.length;
  $("#presentStat").textContent = counts.present;
  $("#absentStat").textContent = counts.absent;
  $("#lateStat").textContent = counts.late;
  $("#presentPercent").textContent =
    `${students.length ? Math.round((counts.present / students.length) * 100) : 0}%`;
  $("#allCount").textContent = students.length;
  $("#presentCount").textContent = counts.present;
  $("#absentCount").textContent = counts.absent;
  $("#lateCount").textContent = counts.late;
  const dayHoliday = holidays.find((h) => h.day === selectedDate);
  $("#holidayBanner").hidden = !dayHoliday;
  $("#holidayBanner").textContent = dayHoliday
    ? `☀ ថ្ងៃឈប់សម្រាក៖ ${dayHoliday.name}`
    : "";
  const filtered = students.filter(
    (s) =>
      (activeFilter === "all" ||
        (records[s.id]?.status || "unmarked") === activeFilter) &&
      (!search ||
        `${s.name} ${s.id}`.toLowerCase().includes(search.toLowerCase())),
  );
  $("#studentRows").innerHTML = filtered
    .map((s) => {
      const r = records[s.id] || { status: "unmarked", time: "—" },
        c = ["#e8edff", "#fce9e5", "#e4f4ee", "#f2e9fa", "#fff0d9", "#e5eff8"][
          students.indexOf(s) % 6
        ];
      return `<tr><td><div class="student"><div class="student-avatar" style="background:${c}">${esc(avatar(s.name))}</div><div><div class="student-name">${esc(s.name)}</div><div class="student-email">${esc(s.email || "សិស្ស")}</div></div></div></td><td><span class="id-label">${esc(s.id)}</span></td><td>${esc(s.className)}</td><td class="time-cell">${esc(r.time || "—")}</td><td><select class="status-select status-${r.status}" data-id="${esc(s.id)}">${Object.entries(
        labels,
      )
        .map(
          ([k, v]) =>
            `<option value="${k}" ${k === r.status ? "selected" : ""}>${v}</option>`,
        )
        .join("")}</select></td></tr>`;
    })
    .join("");
  $("#emptyState").hidden = filtered.length > 0;
  $("#rowCount").textContent = `បង្ហាញ ${filtered.length} នាក់`;
  $("#manageRows").innerHTML = students
    .map(
      (s) =>
        `<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.className)}</td><td>${esc(s.email || "—")}</td></tr>`,
    )
    .join("");
  $("#holidayList").innerHTML =
    holidays
      .map(
        (h) =>
          `<div class="holiday-row"><span>📅 ${esc(h.day)} — ${esc(h.name)}</span><button class="remove-holiday" data-day="${esc(h.day)}" title="លុប">×</button></div>`,
      )
      .join("") || '<p class="muted">មិនទាន់មានថ្ងៃឈប់ដែលបានកំណត់ទេ</p>';
  $("#userCount").textContent = `ចំនួនគណនី៖ ${userCount}`;
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
$("#datePicker").addEventListener("change", async (e) => {
  selectedDate = e.target.value || todayISO();
  await refresh();
});
$("#searchInput").addEventListener("input", (e) => {
  search = e.target.value;
  render();
});
document.querySelectorAll(".filter").forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelector(".filter.active").classList.remove("active");
      b.classList.add("active");
      activeFilter = b.dataset.filter;
      render();
    }),
);
$("#studentRows").addEventListener("change", async (e) => {
  if (!e.target.matches("select")) return;
  try {
    await api("/api/attendance", {
      method: "POST",
      body: JSON.stringify({
        studentId: e.target.dataset.id,
        day: selectedDate,
        status: e.target.value,
      }),
    });
    await refresh();
    msg("បានរក្សាទុកវត្តមាន");
  } catch (err) {
    msg(err.message);
  }
});
document.querySelectorAll(".nav-item").forEach(
  (b) =>
    (b.onclick = async () => {
      document.querySelector(".nav-item.active")?.classList.remove("active");
      b.classList.add("active");
      document.querySelectorAll(".page").forEach((p) => (p.hidden = true));
      $("#page-" + b.dataset.page).hidden = false;
      $("#pageTitle").textContent = b.textContent.trim();
      if (b.dataset.page === "report") await loadReport();
      if (b.dataset.page === "settings" || b.dataset.page === "manage")
        await refresh();
    }),
);
$("#logoutBtn").onclick = async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
  } finally {
    currentUser = null;
    auth(false);
  }
};
$("#addStudentBtn").onclick = () => $("#studentDialog").showModal();
document
  .querySelectorAll(".close-dialog")
  .forEach((b) => (b.onclick = () => $("#studentDialog").close()));
$("#studentForm").onsubmit = async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.currentTarget));
  try {
    await api("/api/students", { method: "POST", body: JSON.stringify(f) });
    $("#studentDialog").close();
    e.currentTarget.reset();
    await refresh();
    msg("បានបន្ថែមសិស្ស");
  } catch (err) {
    msg(err.message);
  }
};
$("#templateBtn").onclick = () =>
  download(
    "student-import-template.csv",
    "id,name,className,email\r\nSTU-007,សុខា វណ្ណា,ថ្នាក់ទី ១០ ក,",
  );
$("#csvInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const rows = parseCSV(await file.text());
    if (!rows.length) throw Error("ឯកសារ CSV ទទេ");
    const keys = rows.shift().map((x) => x.trim());
    const items = rows
      .filter((r) => r.some(Boolean))
      .map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] || ""])));
    const out = await api("/api/students", {
      method: "POST",
      body: JSON.stringify({ students: items }),
    });
    await refresh();
    msg(`បាននាំចូលសិស្ស ${out.added} នាក់`);
  } catch (err) {
    msg(err.message);
  }
  e.target.value = "";
};
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const out = [];
  let row = [],
    field = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q && c === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (c === '"') q = !q;
    else if (c === "," && !q) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}
function download(name, content, type = "text/csv;charset=utf-8") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff", content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#userForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/api/users", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    e.currentTarget.reset();
    await refresh();
    msg("បានបង្កើតគណនី");
  } catch (err) {
    msg(err.message);
  }
};
$("#holidayForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("/api/holidays", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
    });
    e.currentTarget.reset();
    await refresh();
    msg("បានរក្សាទុកថ្ងៃឈប់");
  } catch (err) {
    msg(err.message);
  }
};
$("#holidayList").onclick = async (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  if (!confirm("តើអ្នកចង់លុបថ្ងៃឈប់នេះមែនទេ?")) return;
  try {
    await api("/api/holidays/delete", {
      method: "POST",
      body: JSON.stringify({ day: b.dataset.day }),
    });
    await refresh();
  } catch (err) {
    msg(err.message);
  }
};
$("#backupBtn").onclick = async () => {
  try {
    const r = await fetch("/api/backup");
    if (!r.ok) throw Error("មិនអាចទាញយក backup បាន");
    const blob = await r.blob(),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "classtrack-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg("បានទាញយក backup");
  } catch (e) {
    msg(e.message);
  }
};
$("#restoreInput").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (
    !confirm(
      "ការស្ដារនឹងជំនួសបញ្ជីសិស្ស វត្តមាន និងថ្ងៃឈប់បច្ចុប្បន្ន។ បន្តឬទេ?",
    )
  ) {
    e.target.value = "";
    return;
  }
  try {
    await api("/api/restore", { method: "POST", body: await f.text() });
    await refresh();
    msg("បានស្ដារទិន្នន័យរួចរាល់");
  } catch (err) {
    msg(err.message);
  }
  e.target.value = "";
};
async function loadReport() {
  const month = $("#reportMonth").value || todayISO().slice(0, 7),
    r = await api("/api/report?month=" + month);
  const map = {};
  r.records.forEach((x) => {
    map[x.student_id] ??= { present: 0, absent: 0, late: 0 };
    if (map[x.student_id][x.status] !== undefined)
      map[x.student_id][x.status]++;
  });
  $("#reportRows").innerHTML =
    r.students
      .map((s) => {
        const c = map[s.id] || { present: 0, absent: 0, late: 0 };
        return `<tr><td>${esc(s.name)}</td><td>${esc(s.className)}</td><td>${c.present}</td><td>${c.absent}</td><td>${c.late}</td><td>${c.present + c.absent + c.late}</td></tr>`;
      })
      .join("") || '<tr><td colspan="6">មិនមានទិន្នន័យ</td></tr>';
  $("#reportExport").onclick = () => {
    const rows = [
      ["Student ID", "Name", "Class", "Present", "Absent", "Late", "Recorded"],
      ...r.students.map((s) => {
        const c = map[s.id] || { present: 0, absent: 0, late: 0 };
        return [
          s.id,
          s.name,
          s.className,
          c.present,
          c.absent,
          c.late,
          c.present + c.absent + c.late,
        ];
      }),
    ];
    download(
      `attendance-${month}.csv`,
      rows
        .map((row) =>
          row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(","),
        )
        .join("\r\n"),
    );
  };
}
$("#reportMonth").onchange = loadReport;
boot();
setInterval(() => {
  if (currentUser) refresh().catch(() => {});
}, 20000);
