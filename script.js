(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- Seat booking demo (simulated, runs in the browser) ---------- */
  var ROWS = "ABCDEFGH".split("");
  var COLS = 10;
  var start = {
    1: { booked: "A3 A4 B7 C5 C6 D2 E8 E9 F4 G6 H1 H10", picked: "D5 D6" },
    2: { booked: "A1 A2 B4 B5 D6 D7 E3 F8 F9 G2 G3 H5", picked: "" },
    3: { booked: "B2 B3 C8 C9 D4 E5 E6 F1 G9 H7 H8 A10", picked: "" }
  };
  var state = {};
  Object.keys(start).forEach(function (k) {
    state[k] = {
      booked: new Set(start[k].booked.split(" ")),
      picked: new Set(start[k].picked ? start[k].picked.split(" ") : [])
    };
  });
  var current = "1";

  var grid = $("#seat-grid");
  var pickedEl = $("#picked");
  var reqEl = $("#con-req");
  var statusEl = $("#con-status");
  var bodyEl = $("#con-body");

  function seatSort(a, b) {
    if (a.charAt(0) !== b.charAt(0)) return a.charAt(0) < b.charAt(0) ? -1 : 1;
    return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
  }
  function sorted(set) { return Array.from(set).sort(seatSort); }

  function pretty(obj) {
    return JSON.stringify(obj, null, 2).replace(/\[\s+([^\]]*?)\s+\]/g, function (m, inner) {
      return "[" + inner.replace(/\s*\n\s*/g, " ") + "]";
    });
  }
  function respond(req, code, text, body) {
    reqEl.textContent = req;
    statusEl.textContent = code + " " + text;
    statusEl.className = "con-status " + (code < 300 ? "ok" : code < 500 ? "warn" : "err");
    bodyEl.textContent = pretty(body);
  }
  function counts() {
    var s = state[current];
    var total = ROWS.length * COLS;
    return { screen: Number(current), total: total, booked: s.booked.size, available: total - s.booked.size };
  }
  function showSeats() {
    respond("GET /api/screens/" + current + "/seats", 200, "OK", counts());
  }
  function updatePicked() {
    pickedEl.textContent = state[current].picked.size + " selected";
  }
  function render() {
    var s = state[current];
    var frag = document.createDocumentFragment();
    ROWS.forEach(function (r) {
      var l = document.createElement("span");
      l.className = "row-l";
      l.textContent = r;
      frag.appendChild(l);
      for (var n = 1; n <= COLS; n++) {
        var id = r + n;
        var b = document.createElement("button");
        b.type = "button";
        b.className = "seat";
        b.dataset.seat = id;
        var isBooked = s.booked.has(id);
        var isPicked = s.picked.has(id);
        if (isBooked) b.disabled = true;
        if (isPicked) b.classList.add("sel");
        b.setAttribute("aria-pressed", isPicked ? "true" : "false");
        b.setAttribute("aria-label", "Seat " + id + (isBooked ? ", booked" : isPicked ? ", selected" : ", available"));
        frag.appendChild(b);
      }
    });
    grid.textContent = "";
    grid.appendChild(frag);
    updatePicked();
  }

  grid.addEventListener("click", function (e) {
    var t = e.target.closest(".seat");
    if (!t || t.disabled) return;
    var s = state[current];
    var id = t.dataset.seat;
    if (s.picked.has(id)) s.picked.delete(id); else s.picked.add(id);
    var on = s.picked.has(id);
    t.classList.toggle("sel", on);
    t.setAttribute("aria-pressed", on ? "true" : "false");
    t.setAttribute("aria-label", "Seat " + id + (on ? ", selected" : ", available"));
    updatePicked();
  });

  $$("[data-screen]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      current = btn.getAttribute("data-screen");
      $$("[data-screen]").forEach(function (b) { b.setAttribute("aria-pressed", b === btn ? "true" : "false"); });
      render();
      showSeats();
    });
  });

  $("#book").addEventListener("click", function () {
    var s = state[current];
    if (!s.picked.size) {
      respond("POST /api/bookings", 400, "Bad Request", { error: "Select at least one seat", screen: Number(current) });
      return;
    }
    var seats = sorted(s.picked);
    seats.forEach(function (id) { s.booked.add(id); });
    s.picked.clear();
    render();
    respond("POST /api/bookings", 201, "Created", { screen: Number(current), seats: seats, status: "CONFIRMED" });
  });

  $("#clash").addEventListener("click", function () {
    var taken = sorted(state[current].booked)[0];
    respond("POST /api/bookings", 409, "Conflict", { error: "Seat " + taken + " is already booked", screen: Number(current) });
  });

  render();
  showSeats();

  /* ---------- Resume download ---------- */
  var b64 = window.__RESUME_B64__;
  var notes = $$("[data-dl-note]");
  function say(msg) { notes.forEach(function (n) { n.textContent = msg; }); }
  function toBytes(str) {
    var bin = atob(str), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  if (b64) {
    $$("[data-resume]").forEach(function (el) {
      el.addEventListener("click", async function (e) {
        e.preventDefault();
        var dl = null;
        try { dl = window.claude ? await window.claude.use("downloads") : null; } catch (err) { dl = null; }
        if (!dl) { say("Saving is not available in this view. Open the page in Claude to download the resume."); return; }
        try {
          await dl.save({ filename: "Patan_Dilshad_Resume.pdf", data: new Blob([toBytes(b64)], { type: "application/pdf" }) });
          say("Resume saved.");
        } catch (err) {
          say(err && err.code === "declined" ? "" : "The resume could not be saved. Try again in a moment.");
        }
      });
    });
  }

  /* ---------- Copy buttons ---------- */
  function selectText(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  $$("[data-copy]").forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener("click", function () {
      var el = document.getElementById(btn.getAttribute("data-copy"));
      var text = el.textContent.trim();
      var done = function (msg) { btn.textContent = msg; setTimeout(function () { btn.textContent = label; }, 1800); };
      var fallback = function () { selectText(el); done("Selected"); };
      try {
        navigator.clipboard.writeText(text).then(function () { done("Copied"); }, fallback);
      } catch (err) { fallback(); }
    });
  });

  /* ---------- Active section in the nav ---------- */
  var links = $$("[data-nav]");
  var ids = {};
  links.forEach(function (a) { ids[a.getAttribute("href").slice(1)] = true; });
  function setActive(id) {
    links.forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-25% 0px -65% 0px" });
    Object.keys(ids).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Profile photo: fall back to the PD badge if the image is missing ---------- */
  var photo = $("#badge img");
  if (photo) {
    var dropPhoto = function () { photo.remove(); };
    photo.addEventListener("error", dropPhoto);
    if (photo.complete && photo.naturalWidth === 0) dropPhoto();
  }

  var yr = $("#yr");
  if (yr) yr.textContent = new Date().getFullYear();
})();
