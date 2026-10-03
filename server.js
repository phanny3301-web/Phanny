// ClassTrack server using Node.js built-ins only. No package installation needed.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const ROOT = __dirname,
  FILE = path.join(ROOT, "attendance-data.json"),
  PORT = Number(process.env.PORT || 8000),
  HOST = process.env.HOST || "127.0.0.1";
const seedNames = [
  "សុខា វណ្ណា",
  "ចាន់ធី សុភា",
  "វិសាល រតនា",
  "មុនីរ័ត្ន ដារ៉ា",
  "ពិសិដ្ឋ មាលា",
  "រតនា សុវណ្ណ",
];
let store = fs.existsSync(FILE)
  ? JSON.parse(fs.readFileSync(FILE, "utf8"))
  : {
      users: [],
      students: seedNames.map((name, i) => ({
        id: `STU-${String(i + 1).padStart(3, "0")}`,
        name,
        className: "ថ្នាក់ទី ១០ ក",
        email: "",
      })),
      attendance: [],
      holidays: [],
    };
const sessions = new Map();
function save() {
  const temp = FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temp, FILE);
}
function passwordHash(pw, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}$${crypto.pbkdf2Sync(pw, salt, 240000, 32, "sha256").toString("hex")}`;
}
function verify(pw, hash) {
  try {
    const [salt, key] = hash.split("$"),
      test = crypto.pbkdf2Sync(pw, salt, 240000, 32, "sha256");
    return crypto.timingSafeEqual(test, Buffer.from(key, "hex"));
  } catch {
    return false;
  }
}
function send(res, status, obj, headers = {}) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}
function cookie(res, token, maxAge = 43200) {
  res.setHeader(
    "Set-Cookie",
    `ct_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
  );
}
function userFor(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("ct_session="))
    ?.slice(11);
  if (!token) return null;
  const entry = sessions.get(token);
  if (!entry || entry.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return store.users.find((u) => u.id === entry.id) || null;
}
function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}
function dayOK(s) {
  return /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(Date.parse(s));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "",
      size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 15e6) {
        reject(Error("សំណើធំពេក"));
        req.destroy();
      } else raw += c;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(Error("ទិន្នន័យមិនមែនជា JSON ត្រឹមត្រូវ"));
      }
    });
    req.on("error", reject);
  });
}
function sessionLogin(res, u) {
  const token = crypto.randomBytes(36).toString("base64url");
  sessions.set(token, { id: u.id, expires: Date.now() + 12 * 60 * 60 * 1000 });
  cookie(res, token);
  send(res, 200, { user: publicUser(u) });
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"),
    p = url.pathname;
  try {
    if (
      req.method === "GET" &&
      ["/", "/index.html", "/app.js", "/style.css"].includes(p)
    ) {
      const f = path.join(ROOT, p === "/" ? "index.html" : p.slice(1)),
        body = fs.readFileSync(f);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(f)],
        "Content-Length": body.length,
      });
      return res.end(body);
    }
    if (req.method === "GET" && p === "/api/setup-status")
      return send(res, 200, { setupRequired: store.users.length === 0 });
    if (req.method === "POST" && (p === "/api/setup" || p === "/api/login")) {
      const d = await readBody(req),
        username = String(d.username || "")
          .trim()
          .toLowerCase(),
        pw = String(d.password || "");
      if (p === "/api/setup") {
        if (store.users.length)
          return send(res, 409, {
            error: "គណនីអ្នកគ្រប់គ្រងត្រូវបានបង្កើតរួចហើយ",
          });
        if (!d.name || !username || pw.length < 10)
          return send(res, 400, {
            error: "សូមបំពេញឈ្មោះ គណនី និងពាក្យសម្ងាត់យ៉ាងតិច ១០ តួអក្សរ",
          });
        const u = {
          id: crypto.randomUUID(),
          username,
          name: String(d.name).trim(),
          password: passwordHash(pw),
          role: "admin",
        };
        store.users.push(u);
        save();
        return sessionLogin(res, u);
      }
      const u = store.users.find((x) => x.username === username);
      if (!u || !verify(pw, u.password))
        return send(res, 401, {
          error: "ឈ្មោះគណនី ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ",
        });
      return sessionLogin(res, u);
    }
    const user = userFor(req);
    if (!user) return send(res, 401, { error: "សូមចូលគណនីជាមុន" });
    if (req.method === "GET" && p === "/api/me")
      return send(res, 200, { user: publicUser(user) });
    if (req.method === "GET" && p === "/api/data") {
      const d =
          url.searchParams.get("date") || new Date().toISOString().slice(0, 10),
        records = Object.fromEntries(
          store.attendance
            .filter((r) => r.day === d)
            .map((r) => [r.studentId, { status: r.status, time: r.time }]),
        );
      return send(res, 200, {
        students: store.students,
        records,
        holidays: store.holidays,
        userCount: store.users.length,
        date: d,
      });
    }
    if (req.method === "GET" && p === "/api/report") {
      const month =
        url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      return send(res, 200, {
        month,
        students: store.students,
        records: store.attendance.filter((x) => x.day.startsWith(month + "-")),
        holidays: store.holidays.filter((x) => x.day.startsWith(month + "-")),
      });
    }
    if (req.method === "GET" && p === "/api/backup") {
      const body = Buffer.from(
        JSON.stringify(
          {
            format: "classtrack-backup-v1",
            createdAt: new Date().toISOString(),
            students: store.students,
            attendance: store.attendance,
            holidays: store.holidays,
          },
          null,
          2,
        ),
      );
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="classtrack-backup.json"',
        "Content-Length": body.length,
      });
      return res.end(body);
    }
    if (req.method === "POST" && p === "/api/logout") {
      const token = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("ct_session="))
        ?.slice(11);
      if (token) sessions.delete(token);
      cookie(res, "", 0);
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST") {
      const d = await readBody(req),
        admin = user.role === "admin";
      if (
        [
          "/api/users",
          "/api/students",
          "/api/holidays",
          "/api/holidays/delete",
          "/api/restore",
        ].includes(p) &&
        !admin
      )
        return send(res, 403, { error: "មុខងារនេះសម្រាប់អ្នកគ្រប់គ្រង" });
      if (p === "/api/attendance") {
        const { studentId, day, status } = d;
        if (
          !dayOK(day) ||
          !["present", "absent", "late", "unmarked"].includes(status)
        )
          return send(res, 400, {
            error: "កាលបរិច្ឆេទ ឬស្ថានភាពមិនត្រឹមត្រូវ",
          });
        if (!store.students.some((s) => s.id === studentId))
          return send(res, 404, { error: "រកមិនឃើញសិស្ស" });
        store.attendance = store.attendance.filter(
          (x) => !(x.studentId === studentId && x.day === day),
        );
        if (status !== "unmarked")
          store.attendance.push({
            studentId,
            day,
            status,
            time: ["absent", "unmarked"].includes(status)
              ? "—"
              : new Date().toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
            updatedBy: user.id,
          });
        save();
        return send(res, 200, { ok: true });
      }
      if (p === "/api/students") {
        const items = Array.isArray(d.students) ? d.students : [d],
          seen = new Set(store.students.map((x) => x.id)),
          added = [];
        for (const s of items) {
          const id = String(s.id || "").trim(),
            name = String(s.name || "").trim(),
            className = String(s.className || s.class_name || "").trim();
          if (!id || !name || !className || seen.has(id))
            return send(res, 400, {
              error:
                "នាំចូលមិនបាន៖ ត្រូវការលេខសម្គាល់មិនស្ទួន ឈ្មោះ និងថ្នាក់សិស្ស",
            });
          seen.add(id);
          added.push({ id, name, className, email: String(s.email || "") });
        }
        store.students.push(...added);
        save();
        return send(res, 200, { ok: true, added: added.length });
      }
      if (p === "/api/users") {
        const username = String(d.username || "")
            .trim()
            .toLowerCase(),
          name = String(d.name || "").trim(),
          pw = String(d.password || ""),
          role = d.role || "teacher";
        if (
          !username ||
          !name ||
          pw.length < 10 ||
          !["admin", "teacher"].includes(role)
        )
          return send(res, 400, {
            error: "សូមបំពេញព័ត៌មាន និងប្រើពាក្យសម្ងាត់យ៉ាងតិច ១០ តួអក្សរ",
          });
        if (store.users.some((x) => x.username === username))
          return send(res, 409, { error: "ឈ្មោះគណនីនេះមានរួចហើយ" });
        store.users.push({
          id: crypto.randomUUID(),
          username,
          name,
          password: passwordHash(pw),
          role,
        });
        save();
        return send(res, 200, { ok: true });
      }
      if (p === "/api/holidays") {
        const day = String(d.day || ""),
          name = String(d.name || "").trim();
        if (!dayOK(day) || !name)
          return send(res, 400, {
            error: "សូមបញ្ចូលកាលបរិច្ឆេទ និងឈ្មោះថ្ងៃឈប់",
          });
        store.holidays = store.holidays.filter((h) => h.day !== day);
        store.holidays.push({ day, name, kind: d.kind || "holiday" });
        save();
        return send(res, 200, { ok: true });
      }
      if (p === "/api/holidays/delete") {
        store.holidays = store.holidays.filter((h) => h.day !== d.day);
        save();
        return send(res, 200, { ok: true });
      }
      if (p === "/api/restore") {
        if (
          d.format !== "classtrack-backup-v1" ||
          !Array.isArray(d.students) ||
          !Array.isArray(d.attendance) ||
          !Array.isArray(d.holidays)
        )
          return send(res, 400, { error: "ឯកសារបម្រុងទុកមិនត្រឹមត្រូវ" });
        store = {
          ...store,
          students: d.students,
          attendance: d.attendance,
          holidays: d.holidays,
        };
        save();
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: "រកមិនឃើញទំព័រ" });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: "មានបញ្ហាក្នុង server៖ " + err.message });
  }
});
server.listen(PORT, HOST, () =>
  console.log(`ClassTrack ready at http://localhost:${PORT}`),
);
