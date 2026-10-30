(() => {
  "use strict";

  const TOKEN_KEY = "hair_admin_token";
  const COUNTRY_CODES =
    "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(" ");

  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const countryName = (code) => {
    if (code === "DEFAULT") return "All other countries";
    if (!code) return "Unknown";
    try { return names.of(code) || code; } catch { return code; }
  };
  // Windows has no flag emoji, so show the country code as a badge everywhere.
  const flag = (code) =>
    h("span", { class: "flag" + (code === "DEFAULT" ? " globe" : "") }, code === "DEFAULT" ? "🌍" : code || "?");

  let settings = { max_schedule_days: 90, max_day_limit: 1000, timezone: "UTC", fallback_daily_quota: 3 };

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "style") el.setAttribute("style", v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  const fmt = (n) => Number(n || 0).toLocaleString();
  const when = (iso) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";

  function toast(message, isError = false) {
    const t = h("div", { class: "toast" + (isError ? " error" : "") }, message);
    $("#toasts").append(t);
    setTimeout(() => t.remove(), 3800);
  }

  async function api(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const res = await fetch("/admin-api" + path, {
      method: options.method || "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: "Bearer " + token } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "/login") {
      logout(true);
      throw new Error(data.message || "Session expired");
    }
    if (!res.ok || data.success === false) throw new Error(data.message || "Request failed");
    return data;
  }

  // ---------- auth ----------
  function showLogin() {
    $("#app-view").hidden = true;
    $("#login-view").hidden = false;
  }

  function logout(expired) {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
    if (expired) {
      const err = $("#login-error");
      err.textContent = "Your session ended. Please sign in again.";
      err.hidden = false;
    }
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const btn = $("button[type=submit]", form);
    const err = $("#login-error");
    err.hidden = true;
    btn.disabled = true;
    try {
      const data = await api("/login", {
        method: "POST",
        body: { username: form.username.value.trim(), password: form.password.value }
      });
      sessionStorage.setItem(TOKEN_KEY, data.token);
      form.password.value = "";
      await startApp();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logout").addEventListener("click", () => logout(false));

  // ---------- routing ----------
  const pages = { overview: renderOverview, limits: renderLimits, users: renderUsers };
  const titles = { overview: "Overview", limits: "Country limits", users: "Users" };

  async function route() {
    const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const key = pages[name] ? name : "overview";
    document.querySelectorAll("[data-nav]").forEach((a) =>
      a.classList.toggle("active", a.dataset.nav === key)
    );
    $("#page-title").textContent = titles[key];
    $("#topbar-actions").replaceChildren();
    const page = $("#page");
    page.replaceChildren(h("div", { class: "skeleton" }));
    try {
      await pages[key](page);
    } catch (error) {
      page.replaceChildren(h("div", { class: "notice warn" }, "Could not load this page: " + error.message));
    }
  }
  window.addEventListener("hashchange", () => !$("#app-view").hidden && route());

  async function startApp() {
    const { data } = await api("/settings");
    settings = data;
    $("#tz-note").textContent = `Days roll over at midnight (${settings.timezone}).`;
    $("#login-view").hidden = true;
    $("#app-view").hidden = false;
    await route();
  }

  // ---------- overview ----------
  async function renderOverview(page) {
    const [{ data: o }, { data: policies }] = await Promise.all([api("/overview"), api("/policies")]);

    const stat = (k, v, hint) =>
      h("div", { class: "card stat" }, h("span", { class: "k" }, k), h("span", { class: "v" }, fmt(v)), h("span", { class: "h" }, hint));

    const max = Math.max(1, ...o.trend.map((d) => d.generations));
    const bars = h(
      "div",
      { class: "bars" },
      o.trend.map((d, i) =>
        h(
          "div",
          { class: "bar-col" + (i === o.trend.length - 1 ? " today" : ""), title: `${d.date}: ${d.generations} images from ${d.devices} devices` },
          h("span", { class: "bar-val" }, fmt(d.generations)),
          h("div", { class: "bar", style: `height:${Math.max((d.generations / max) * 100, 2)}%` }),
          h("span", { class: "bar-lbl" }, new Date(d.date + "T00:00:00").toLocaleDateString([], { weekday: "short" }))
        )
      )
    );

    const countryRows = o.countries.length
      ? h(
          "table",
          {},
          h("thead", {}, h("tr", {}, h("th", {}, "Country"), h("th", {}, "New users"), h("th", {}, "Images today"))),
          h(
            "tbody",
            {},
            o.countries.map((c) =>
              h(
                "tr",
                {},
                h("td", {}, h("span", { class: "country" }, flag(c.country), countryName(c.country))),
                h("td", {}, fmt(c.devices)),
                h("td", {}, fmt(c.generations_today))
              )
            )
          )
        )
      : h("p", { class: "muted" }, "No new users yet. They appear here after their first app launch.");

    const noRulesNotice = h(
      "div",
      { class: "notice warn" },
      h("span", {}, "⚠️"),
      h("span", {}, `No country limits are set, so every user gets the standard ${settings.fallback_daily_quota} images/day. `, h("a", { href: "#/limits" }, "Set limits →"))
    );

    page.replaceChildren(
      ...(policies.length ? [] : [noRulesNotice]),
      h(
        "div",
        { class: "stats" },
        stat("New users today", o.new_today, "first seen today"),
        stat("In welcome period", o.in_onboarding, "still inside their day limits"),
        stat("Images today", o.generations_today, "successful generations"),
        stat("Active country rules", o.active_policies, `${fmt(o.total_devices)} devices in total`)
      ),
      h(
        "div",
        { class: "grid-2" },
        h("div", { class: "card" }, h("h3", {}, "Images generated"), h("p", { class: "sub" }, "Last 7 days"), bars),
        h("div", { class: "card" }, h("h3", {}, "Top countries"), h("p", { class: "sub" }, "New users only"), h("div", { class: "table-wrap" }, countryRows))
      )
    );
  }

  // ---------- country limits ----------
  async function renderLimits(page) {
    const { data: policies } = await api("/policies");

    $("#topbar-actions").append(
      h("button", { class: "btn btn-primary", onclick: () => openPolicyDialog() }, "+ Add country")
    );

    const intro = h(
      "div",
      { class: "notice" },
      h("span", {}, "💡"),
      h("span", {}, `Each rule sets how many images a `, h("strong", {}, "new user"), ` may generate on each day of a period you choose (for example 3 or 10 days). After that, they get the fixed daily limit you set for "after the last day" (or no limit, if you choose). Existing users are not affected.`)
    );

    if (!policies.length) {
      page.replaceChildren(
        intro,
        h(
          "div",
          { class: "card empty" },
          h("div", { class: "big" }, "🌍"),
          h("h3", {}, "No country limits yet"),
          h("p", {}, "Add a rule for a country, or create a rule for “All other countries” to cover everyone else."),
          h("button", { class: "btn btn-primary", onclick: () => openPolicyDialog() }, "+ Add your first country")
        )
      );
      return;
    }

    // "All other countries" first, then alphabetical
    const sorted = [...policies].sort((a, b) =>
      a.country === "DEFAULT" ? -1 : b.country === "DEFAULT" ? 1 : countryName(a.country).localeCompare(countryName(b.country))
    );

    page.replaceChildren(intro, h("div", { class: "policy-grid" }, sorted.map(policyCard)));
  }

  function policyCard(p) {
    const max = Math.max(1, ...p.day_limits);
    const timeline = h(
      "div",
      { class: "timeline", style: `grid-template-columns: repeat(${p.day_limits.length}, minmax(${p.day_limits.length > 8 ? 28 : 44}px, 1fr)) minmax(54px, 1.15fr)` },
      p.day_limits.map((n, i) =>
        h(
          "div",
          { class: "tl" + (n === 0 ? " zero" : "") },
          h("span", { class: "n" }, n),
          h("div", { class: "col", style: `height:${Math.max((n / max) * 70, 4)}px` }, h("i")),
          h("span", { class: "d" }, p.day_limits.length > 8 ? String(i + 1) : "Day " + (i + 1))
        )
      ),
      h("div", { class: "tl inf" }, h("span", { class: "n" }, p.after_limit === null ? "∞" : p.after_limit), h("div", { class: "col" }), h("span", { class: "d" }, p.day_limits.length > 8 ? `${p.day_limits.length + 1}+` : `Day ${p.day_limits.length + 1}+`))
    );

    return h(
      "article",
      { class: "card policy" + (p.enabled ? "" : " off") },
      h(
        "div",
        { class: "policy-top" },
        h("span", { class: "country" }, flag(p.country), countryName(p.country)),
        h("span", { class: "pill " + (p.enabled ? "pill-green" : "pill-gray") }, p.enabled ? "Active" : "Paused")
      ),
      timeline,
      h(
        "div",
        { class: "policy-foot" },
        h("span", { class: "muted small" }, p.new_devices === undefined ? "Fallback for unlisted countries" : `${fmt(p.new_devices)} new user${p.new_devices === 1 ? "" : "s"}`),
        h(
          "div",
          { class: "btns" },
          h("button", { class: "btn btn-sm", onclick: () => openPolicyDialog(p) }, "Edit"),
          h("button", { class: "btn btn-sm btn-ghost", onclick: () => confirmDelete(p) }, "Delete")
        )
      )
    );
  }

  // ---------- policy dialog ----------
  const dialog = $("#policy-dialog");
  const dayGrid = $("#day-grid");
  const countryInput = $("#country-input");
  let editing = null;

  (function fillCountryList() {
    const options = [
      { code: "DEFAULT", label: "All other countries (fallback)" },
      ...COUNTRY_CODES.map((code) => ({ code, label: countryName(code) })).sort((a, b) => a.label.localeCompare(b.label))
    ];
    $("#country-list").replaceChildren(
      ...options.map((o) => h("option", { value: `${o.label} (${o.code})` }))
    );
  })();

  /** "United States (US)" | "US" | "United States" -> "US" */
  function parseCountryInput(text) {
    const raw = text.trim();
    const inParens = raw.match(/\(([A-Za-z]{2}|DEFAULT)\)\s*$/i);
    if (inParens) return inParens[1].toUpperCase();
    if (/^default$/i.test(raw) || /^all other/i.test(raw)) return "DEFAULT";
    if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
    const match = COUNTRY_CODES.find((c) => countryName(c).toLowerCase() === raw.toLowerCase());
    return match || null;
  }

  countryInput.addEventListener("input", () => {
    const code = parseCountryInput(countryInput.value);
    $("#country-hint").textContent = code ? countryName(code) : "";
  });

  function buildDayGrid(values) {
    dayGrid.replaceChildren(
      ...values.map((v, i) => {
        const input = h("input", { type: "number", min: 0, max: settings.max_day_limit, step: 1, value: v, inputmode: "numeric", id: "day-" + i, "aria-label": `Day ${i + 1} image limit` });
        const step = (d) => {
          input.value = Math.min(settings.max_day_limit, Math.max(0, (parseInt(input.value, 10) || 0) + d));
          input.dispatchEvent(new Event("input"));
        };
        input.addEventListener("input", () => cell.classList.remove("invalid"));
        const cell = h(
          "div",
          { class: "day-cell" },
          h("label", { for: "day-" + i }, "Day " + (i + 1)),
          h("div", { class: "stepper" }, h("button", { type: "button", "aria-label": "Decrease", onclick: () => step(-1) }, "−"), input, h("button", { type: "button", "aria-label": "Increase", onclick: () => step(1) }, "+"))
        );
        return cell;
      })
    );
  }

  function openPolicyDialog(policy) {
    editing = policy || null;
    $("#dialog-title").textContent = policy ? `Edit ${countryName(policy.country)}` : "Add country limits";
    countryInput.value = policy ? `${countryName(policy.country)} (${policy.country})` : "";
    countryInput.readOnly = Boolean(policy);
    $("#country-hint").textContent = policy ? countryName(policy.country) : "";
    $("#enabled-input").checked = policy ? policy.enabled : true;
    setDays(policy ? policy.day_limits : [3, 2, 2, 1, 1, 1]);
    setAfter(policy ? policy.after_limit : 1);
    $("#dialog-error").hidden = true;
    dialog.showModal();
    (policy ? $("#day-0") : countryInput).focus();
  }

  // ---- number of days ----
  const daysInput = $("#days-count");

  const currentValues = () => [...dayGrid.querySelectorAll("input")].map((i) => i.value);

  /** Rebuilds the grid with these values and syncs the count box and the "unlimited" note. */
  function setDays(values) {
    buildDayGrid(values);
    daysInput.value = values.length;
    $("#after-title").textContent = `From day ${values.length + 1} onwards`;
  }

  // ---- limit after the last day ----
  const afterInput = $("#after-limit");
  const afterUnlimited = $("#after-unlimited");

  function setAfter(value) {
    afterUnlimited.checked = value === null;
    afterInput.value = value === null ? 1 : value;
    $(".after-box").classList.toggle("off", afterUnlimited.checked);
  }
  const stepAfter = (d) => {
    afterInput.value = Math.min(settings.max_day_limit, Math.max(0, (parseInt(afterInput.value, 10) || 0) + d));
  };
  $("#after-minus").addEventListener("click", () => stepAfter(-1));
  $("#after-plus").addEventListener("click", () => stepAfter(1));
  afterUnlimited.addEventListener("change", () => $(".after-box").classList.toggle("off", afterUnlimited.checked));

  /** Grow (new days copy the last day's value) or shrink the schedule. */
  function resizeDays(count) {
    const n = Math.min(settings.max_schedule_days, Math.max(1, count));
    const values = currentValues();
    const last = values.length ? values[values.length - 1] : 1;
    setDays(Array.from({ length: n }, (_, i) => (i < values.length ? values[i] : last)));
  }

  $("#days-minus").addEventListener("click", () => resizeDays((parseInt(daysInput.value, 10) || 1) - 1));
  $("#days-plus").addEventListener("click", () => resizeDays((parseInt(daysInput.value, 10) || 0) + 1));
  daysInput.addEventListener("change", () => resizeDays(parseInt(daysInput.value, 10) || 1));

  const closeDialog = () => dialog.close();
  $("#dialog-close").addEventListener("click", closeDialog);
  $("#dialog-cancel").addEventListener("click", closeDialog);

  $("#fill-btn").addEventListener("click", () => {
    const v = Math.min(settings.max_day_limit, Math.max(0, parseInt($("#fill-value").value, 10) || 0));
    dayGrid.querySelectorAll("input").forEach((i) => (i.value = v));
  });

  $("#policy-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#dialog-error");
    err.hidden = true;

    const country = parseCountryInput(countryInput.value);
    if (!country) {
      err.textContent = "Pick a country from the list (or type its 2-letter code, e.g. US).";
      err.hidden = false;
      return;
    }

    const inputs = [...dayGrid.querySelectorAll("input")];
    let bad = false;
    const day_limits = inputs.map((input) => {
      const n = Number(input.value);
      const ok = input.value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= settings.max_day_limit;
      input.closest(".day-cell").classList.toggle("invalid", !ok);
      if (!ok) bad = true;
      return n;
    });
    if (bad) {
      err.textContent = `Each day needs a whole number between 0 and ${settings.max_day_limit}.`;
      err.hidden = false;
      return;
    }

    const afterN = Number(afterInput.value);
    if (!afterUnlimited.checked && (afterInput.value.trim() === "" || !Number.isInteger(afterN) || afterN < 0 || afterN > settings.max_day_limit)) {
      err.textContent = `Enter the daily limit for after the last day (0 to ${settings.max_day_limit}), or tick "No limit".`;
      err.hidden = false;
      return;
    }

    const btn = $("#dialog-save");
    btn.disabled = true;
    try {
      await api("/policies/" + country, {
        method: "PUT",
        body: { day_limits, after_limit: afterUnlimited.checked ? null : afterN, enabled: $("#enabled-input").checked }
      });
      dialog.close();
      toast(`Saved limits for ${countryName(country)}`);
      route();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- delete confirm ----------
  const confirmDialog = $("#confirm-dialog");
  let pendingDelete = null;

  function confirmDelete(policy) {
    pendingDelete = policy;
    $("#confirm-title").textContent = `Delete ${countryName(policy.country)}?`;
    $("#confirm-text").textContent =
      "New users from this country will fall back to the “All other countries” rule, or the standard daily limit if there is none.";
    confirmDialog.showModal();
  }
  $("#confirm-no").addEventListener("click", () => confirmDialog.close());
  $("#confirm-yes").addEventListener("click", async () => {
    confirmDialog.close();
    try {
      await api("/policies/" + pendingDelete.country, { method: "DELETE" });
      toast("Rule deleted");
      route();
    } catch (error) {
      toast(error.message, true);
    }
  });

  // click on backdrop closes dialogs
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); })
  );

  // ---------- users ----------
  const userFilters = { search: "", country: "", type: "", page: 1 };

  async function renderUsers(page) {
    const { data: policies } = await api("/policies");
    const countries = [...new Set([...policies.map((p) => p.country).filter((c) => c !== "DEFAULT")])];

    const search = h("input", { type: "search", class: "grow", placeholder: "Search by device ID…", value: userFilters.search, "aria-label": "Search devices" });
    const country = h("select", { "aria-label": "Country" },
      h("option", { value: "" }, "All countries"),
      h("option", { value: "UNKNOWN" }, "Unknown"),
      countries.map((c) => h("option", { value: c }, countryName(c)))
    );
    country.value = userFilters.country;
    const type = h("select", { "aria-label": "User type" },
      h("option", { value: "" }, "All users"),
      h("option", { value: "new" }, "New users"),
      h("option", { value: "existing" }, "Existing users")
    );
    type.value = userFilters.type;

    const results = h("div", { class: "card" });
    let timer;
    const load = async () => {
      Object.assign(userFilters, { search: search.value, country: country.value, type: type.value });
      const q = new URLSearchParams({ page: userFilters.page, search: userFilters.search, country: userFilters.country, type: userFilters.type });
      try {
        const { data } = await api("/users?" + q);
        results.replaceChildren(usersTable(data, (p) => { userFilters.page = p; load(); }));
      } catch (error) {
        results.replaceChildren(h("p", { class: "muted" }, error.message));
      }
    };
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { userFilters.page = 1; load(); }, 300); });
    [country, type].forEach((s) => s.addEventListener("change", () => { userFilters.page = 1; load(); }));

    page.replaceChildren(h("div", { class: "toolbar" }, search, country, type), results);
    load();
  }

  function usersTable(data, goto) {
    if (!data.rows.length) {
      return h("div", { class: "empty" }, h("div", { class: "big" }, "🙂"), h("h3", {}, "No users found"), h("p", {}, "Users appear here the first time their device opens the app."));
    }

    const phase = (r) =>
      r.phase === "onboarding" ? h("span", { class: "pill pill-blue" }, `Day ${r.day} of ${r.total_days}`)
      : r.phase === "unlimited" ? h("span", { class: "pill pill-green" }, "Unlimited")
      : r.phase === "ongoing" ? h("span", { class: "pill pill-green" }, `${r.limit}/day`)
      : r.phase === "existing" ? h("span", { class: "pill pill-gray" }, "Existing user")
      : h("span", { class: "pill pill-amber" }, "Standard");

    const usage = (r) => {
      if (r.limit === null) return h("span", {}, `${fmt(r.used_today)} used`);
      const pct = r.limit ? Math.min(100, (r.used_today / r.limit) * 100) : 100;
      return h("div", { class: "usage" }, h("div", { class: "meter" }, h("i", { class: pct >= 100 ? "full" : "", style: `width:${pct}%` })), h("span", { class: "small" }, `${r.used_today}/${r.limit}`));
    };

    return h(
      "div",
      {},
      h("div", { class: "table-wrap" },
        h("table", {},
          h("thead", {}, h("tr", {}, ["Device", "Country", "Joined", "Stage", "Today"].map((t) => h("th", {}, t)))),
          h("tbody", {}, data.rows.map((r) =>
            h("tr", {},
              h("td", {}, h("span", { class: "mono ellipsis", title: r.device_id }, r.device_id)),
              h("td", {}, h("span", { class: "country" }, flag(r.country), r.country ? countryName(r.country) : "Unknown")),
              h("td", { class: "small" }, when(r.first_seen)),
              h("td", {}, phase(r)),
              h("td", {}, usage(r))
            )
          ))
        )
      ),
      h("div", { class: "pager" },
        h("span", { class: "muted small" }, `${fmt(data.total)} device${data.total === 1 ? "" : "s"} · page ${data.page} of ${data.pages}`),
        h("div", { class: "btns" },
          h("button", { class: "btn btn-sm", disabled: data.page <= 1, onclick: () => goto(data.page - 1) }, "← Prev"),
          " ",
          h("button", { class: "btn btn-sm", disabled: data.page >= data.pages, onclick: () => goto(data.page + 1) }, "Next →")
        )
      )
    );
  }

  // ---------- boot ----------
  if (sessionStorage.getItem(TOKEN_KEY)) {
    startApp().catch(() => showLogin());
  } else {
    showLogin();
  }
})();
