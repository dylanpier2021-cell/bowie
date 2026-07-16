/* ==========================================================================
   Bowie Chiropractic - main.js
   Vanilla JS, no dependencies. Progressive enhancement only: every feature
   here degrades to working HTML if JS fails to load.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     Office hours, single source of truth.
     Minutes from midnight, in the clinic's local time (America/Chicago).
     Keep in sync with the hours table in contact.html and the
     openingHoursSpecification JSON-LD in every page head.
     ------------------------------------------------------------------------ */
  var HOURS = {
    0: null,           // Sunday, closed
    1: [510, 1080],    // Monday    8:30 AM - 6:00 PM
    2: [720, 1020],    // Tuesday  12:00 PM - 5:00 PM
    3: [510, 1080],    // Wednesday 8:30 AM - 6:00 PM
    4: [720, 1020],    // Thursday 12:00 PM - 5:00 PM
    5: [510, 1080],    // Friday    8:30 AM - 6:00 PM
    6: [540, 660]      // Saturday  9:00 AM - 11:00 AM
  };

  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  /**
   * Current day/minute in the clinic's timezone, regardless of the visitor's.
   * A visitor in London must still see Champaign's hours.
   */
  function clinicNow() {
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).formatToParts(new Date());

      var out = {};
      parts.forEach(function (p) { out[p.type] = p.value; });

      var day = DAY_INDEX[out.weekday];
      var hour = parseInt(out.hour, 10);
      var minute = parseInt(out.minute, 10);

      // Intl can render midnight as "24" in some engines.
      if (hour === 24) { hour = 0; }
      if (day === undefined || isNaN(hour) || isNaN(minute)) { return null; }

      return { day: day, minutes: hour * 60 + minute };
    } catch (e) {
      return null; // Intl/timeZone unsupported: leave the SSR fallback text.
    }
  }

  function fmtTime(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) { h12 = 12; }
    return h12 + (m ? ":" + String(m).padStart(2, "0") : "") + " " + ampm;
  }

  function rangeLabel(range) {
    return fmtTime(range[0]) + " to " + fmtTime(range[1]);
  }

  /** Next day (within 7) that has hours. Returns {day, range} or null. */
  function nextOpenDay(fromDay) {
    for (var i = 1; i <= 7; i++) {
      var d = (fromDay + i) % 7;
      if (HOURS[d]) { return { day: d, range: HOURS[d] }; }
    }
    return null;
  }

  /* ------------------------------------------------------------------------
     "Open today" indicator
     ------------------------------------------------------------------------ */
  function initStatus() {
    var els = document.querySelectorAll("[data-status]");
    if (!els.length) { return; }

    var now = clinicNow();
    if (!now) { return; }

    var today = HOURS[now.day];
    var state, text;

    if (today && now.minutes >= today[0] && now.minutes < today[1]) {
      state = "open";
      text = "<b>Open now</b> until " + fmtTime(today[1]);
    } else if (today && now.minutes < today[0]) {
      state = "closed";
      text = "<b>Opens today</b> at " + fmtTime(today[0]);
    } else {
      var nxt = nextOpenDay(now.day);
      state = "closed";
      if (nxt) {
        var label = nxt.day === (now.day + 1) % 7 ? "tomorrow" : DAY_NAMES[nxt.day];
        text = "<b>Closed now</b>, opens " + label + " at " + fmtTime(nxt.range[0]);
      } else {
        text = "<b>Closed now</b>";
      }
    }

    els.forEach(function (el) {
      el.classList.remove("status--open", "status--closed");
      el.classList.add("status--" + state);
      var t = el.querySelector(".status__text");
      if (t) { t.innerHTML = text; }
    });

    // Highlight today's row in any hours table.
    var rows = document.querySelectorAll("[data-day]");
    rows.forEach(function (r) {
      if (parseInt(r.getAttribute("data-day"), 10) === now.day) {
        r.classList.add("is-today");
        var cell = r.querySelector("th");
        if (cell && !cell.querySelector(".sr-only")) {
          var s = document.createElement("span");
          s.className = "sr-only";
          s.textContent = " (today)";
          cell.appendChild(s);
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     Mobile navigation
     ------------------------------------------------------------------------ */
  function initNav() {
    var burger = document.querySelector(".burger");
    var nav = document.querySelector(".nav");
    if (!burger || !nav) { return; }

    var overlay = document.createElement("div");
    overlay.className = "nav-overlay";
    document.body.appendChild(overlay);

    function setOpen(open) {
      burger.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      overlay.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
      if (open) {
        var first = nav.querySelector("a");
        if (first) { first.focus({ preventScroll: true }); }
      }
    }

    burger.addEventListener("click", function () {
      setOpen(burger.getAttribute("aria-expanded") !== "true");
    });

    overlay.addEventListener("click", function () { setOpen(false); });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") {
        setOpen(false);
        burger.focus();
      }
    });

    // Close when a link is chosen, and reset if resized back to desktop.
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) { setOpen(false); }
    });

    var mq = window.matchMedia("(min-width: 861px)");
    var onChange = function (e) { if (e.matches) { setOpen(false); } };
    if (mq.addEventListener) { mq.addEventListener("change", onChange); }
    else if (mq.addListener) { mq.addListener(onChange); }
  }

  /* ------------------------------------------------------------------------
     Sticky header shadow
     ------------------------------------------------------------------------ */
  function initHeader() {
    var header = document.querySelector(".header");
    if (!header) { return; }
    var ticking = false;
    function update() {
      header.classList.toggle("is-stuck", window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------------
     Scroll-in reveals
     ------------------------------------------------------------------------ */
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!els.length) { return; }

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------------
     FAQ: keep one panel open at a time.
     Built on <details>, so it still works with JS disabled.
     ------------------------------------------------------------------------ */
  function initFaq() {
    var items = document.querySelectorAll(".faq__item");
    if (!items.length) { return; }
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) { return; }
        items.forEach(function (other) {
          if (other !== item) { other.open = false; }
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     Contact form.
     Front-end only. See the TODO in contact.html to wire up a real handler.
     ------------------------------------------------------------------------ */
  function initForm() {
    var form = document.querySelector("[data-contact-form]");
    if (!form) { return; }
    var note = form.querySelector("[data-form-status]");

    form.addEventListener("submit", function (e) {
      // Remove this handler once a real endpoint (Formspree / Netlify) is connected.
      if (form.getAttribute("action")) { return; }
      e.preventDefault();
      if (!form.reportValidity()) { return; }
      if (note) {
        note.hidden = false;
        note.textContent =
          "This form is not connected yet. Please call 217-359-7702 to reach the office.";
        note.focus();
      }
    });
  }

  /* ------------------------------------------------------------------------
     Year stamp
     ------------------------------------------------------------------------ */
  function initYear() {
    var els = document.querySelectorAll("[data-year]");
    var y = String(new Date().getFullYear());
    els.forEach(function (el) { el.textContent = y; });
  }

  function ready(fn) {
    if (document.readyState !== "loading") { fn(); }
    else { document.addEventListener("DOMContentLoaded", fn); }
  }

  ready(function () {
    initNav();
    initHeader();
    initStatus();
    initReveal();
    initFaq();
    initForm();
    initYear();
  });
})();
