(function () {
  var cfg = window.DVFR || {};
  var contentUrl = cfg.content || "/data/dvfr.json";
  var guidePage = cfg.guidePage || "guide.html";
  var STORE_KEY = cfg.storageKey || "dvfr-workbook";
  var STATE_VERSION = 1;

  var FACTOR_KEYS = ["d", "v", "f", "r"];
  var INFLUENCE = [
    { key: "high", label: "High influence" },
    { key: "medium", label: "Medium influence" },
    { key: "low", label: "Low influence" }
  ];

  var content = null;
  var state = null;
  var seq = 0;

  /* ------------------------------------------------------------------ util */

  function track(name, params) {
    if (typeof window.gtag !== "function") return;
    var clean = {};
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v == null || v === "") return;
      if (typeof v === "string" && v.length > 100) v = v.slice(0, 97) + "...";
      clean[k] = v;
    });
    window.gtag("event", name, clean);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function uid(prefix) {
    seq += 1;
    return prefix + "-" + seq + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  function clampScore(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 10) return 10;
    return n;
  }

  function str(v) {
    return typeof v === "string" ? v : "";
  }

  function one(n) {
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function factor(key) {
    for (var i = 0; i < content.factors.length; i++) {
      if (content.factors[i].key === key) return content.factors[i];
    }
    return null;
  }

  function bucket(key) {
    for (var i = 0; i < content.buckets.length; i++) {
      if (content.buckets[i].key === key) return content.buckets[i];
    }
    return content.buckets[0];
  }

  function verdictCopy(key) {
    for (var i = 0; i < content.verdicts.length; i++) {
      if (content.verdicts[i].key === key) return content.verdicts[i];
    }
    return content.verdicts[0];
  }

  function coalitionState(key) {
    var states = content.coalition.states;
    for (var i = 0; i < states.length; i++) {
      if (states[i].key === key) return states[i];
    }
    return states[0];
  }

  function influenceLabel(key) {
    for (var i = 0; i < INFLUENCE.length; i++) {
      if (INFLUENCE[i].key === key) return INFLUENCE[i].label;
    }
    return INFLUENCE[1].label;
  }

  /* ----------------------------------------------------------------- state */

  function emptyState() {
    var s = {
      version: STATE_VERSION,
      title: "",
      sentence: "",
      who: "",
      by: "",
      scores: {},
      checks: {},
      touched: {},
      vision: {},
      people: [],
      coalition: [],
      steps: [],
      wins: []
    };
    FACTOR_KEYS.forEach(function (k) {
      s.scores[k] = 0;
      s.checks[k] = [];
      s.touched[k] = false;
    });
    return s;
  }

  function coerce(raw) {
    var s = emptyState();
    if (!raw || typeof raw !== "object") return s;
    s.title = str(raw.title);
    s.sentence = str(raw.sentence);
    s.who = str(raw.who);
    s.by = str(raw.by);
    FACTOR_KEYS.forEach(function (k) {
      if (raw.scores && raw.scores[k] != null) s.scores[k] = clampScore(raw.scores[k]);
      if (raw.checks && Object.prototype.toString.call(raw.checks[k]) === "[object Array]") {
        s.checks[k] = raw.checks[k].map(function (b) { return !!b; });
      }
      if (raw.touched) s.touched[k] = !!raw.touched[k];
    });
    if (raw.vision && typeof raw.vision === "object") {
      Object.keys(raw.vision).forEach(function (k) { s.vision[k] = str(raw.vision[k]); });
    }
    (raw.people || []).forEach(function (p) {
      if (!p) return;
      s.people.push({
        id: str(p.id) || uid("p"),
        name: str(p.name),
        role: str(p.role),
        bucket: str(p.bucket) || "non_supportive",
        influence: str(p.influence) || "medium",
        concern: str(p.concern),
        response: str(p.response)
      });
    });
    (raw.coalition || []).forEach(function (a) {
      if (!a) return;
      s.coalition.push({
        id: str(a.id) || uid("a"),
        name: str(a.name),
        role: str(a.role),
        state: str(a.state) || "not_asked"
      });
    });
    (raw.steps || []).forEach(function (t) {
      if (!t) return;
      s.steps.push({
        id: str(t.id) || uid("s"),
        text: str(t.text),
        owner: str(t.owner),
        date: str(t.date)
      });
    });
    (raw.wins || []).forEach(function (w) {
      if (!w) return;
      s.wins.push({ id: str(w.id) || uid("w"), text: str(w.text), who: str(w.who) });
    });
    return s;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyState();
      return coerce(JSON.parse(raw));
    } catch (e) {
      return emptyState();
    }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch (e) {
        setStatus("Could not save to this browser's storage.");
      }
    }, 200);
  }

  function changed() {
    save();
    renderDerived();
  }

  /* ------------------------------------------------------------------ math */

  function scores() {
    return {
      d: clampScore(state.scores.d),
      v: clampScore(state.scores.v),
      f: clampScore(state.scores.f),
      r: clampScore(state.scores.r)
    };
  }

  // D, V and F multiply, so the model dies if any one of them is zero. The cube
  // root puts that product back on the same 0-10 scale as R, which keeps
  // "force > resistance" an honest comparison instead of a rigged one.
  function analyse() {
    var s = scores();
    var product = s.d * s.v * s.f;
    var force = Math.pow(product, 1 / 3);
    var weakest = "d";
    ["v", "f"].forEach(function (k) {
      if (s[k] < s[weakest]) weakest = k;
    });
    var key;
    if (s.d === 0 || s.v === 0 || s.f === 0) key = "zero";
    else if (force <= s.r) key = "stalled";
    else if (force - s.r <= 2) key = "fragile";
    else if (force - s.r <= 4.5) key = "moving";
    else key = "unstoppable";
    return {
      s: s,
      product: product,
      force: force,
      margin: force - s.r,
      weakest: weakest,
      zeros: FACTOR_KEYS.filter(function (k) { return k !== "r" && s[k] === 0; }),
      verdict: key
    };
  }

  function suggested(key) {
    var f = factor(key);
    var checks = state.checks[key] || [];
    var hits = 0;
    for (var i = 0; i < f.checks.length; i++) if (checks[i]) hits += 1;
    return Math.round((hits / f.checks.length) * 10);
  }

  function coalitionCount() {
    var n = 0;
    state.coalition.forEach(function (a) {
      if (coalitionState(a.state).counts && a.name.trim()) n += 1;
    });
    return n;
  }

  function sortedPeople() {
    var order = {};
    content.buckets.forEach(function (b) { order[b.key] = b.priority; });
    var rank = { high: 0, medium: 1, low: 2 };
    return state.people.slice().sort(function (a, b) {
      var pa = order[a.bucket] || 99;
      var pb = order[b.bucket] || 99;
      if (pa !== pb) return pa - pb;
      return (rank[a.influence] == null ? 1 : rank[a.influence]) -
        (rank[b.influence] == null ? 1 : rank[b.influence]);
    });
  }

  function namedPeople() {
    return state.people.filter(function (p) { return p.name.trim() || p.role.trim(); });
  }

  function datedSteps() {
    return state.steps.filter(function (t) { return t.text.trim() && t.date; });
  }

  /* --------------------------------------------------------------- step one */

  function bindText(id, key) {
    var node = byId(id);
    if (!node) return;
    node.value = state[key];
    node.addEventListener("input", function () {
      state[key] = node.value;
      changed();
    });
  }

  /* -------------------------------------------------------------- step two */

  function renderFactors() {
    var host = byId("dvfr-factors");
    clear(host);

    content.factors.forEach(function (f) {
      var card = el("article", "dvfr-factor dvfr-factor-" + f.key);
      card.id = "dvfr-factor-" + f.key;

      var head = el("header", "dvfr-factor-head");
      head.appendChild(el("span", "dvfr-factor-letter", f.letter));
      var headText = el("div", "dvfr-factor-head-text");
      headText.appendChild(el("h3", null, f.name));
      headText.appendChild(el("p", "dvfr-factor-def", f.definition));
      head.appendChild(headText);
      card.appendChild(head);

      card.appendChild(el("p", "dvfr-factor-help", f.help));

      var list = el("ul", "dvfr-checks");
      f.checks.forEach(function (text, i) {
        var li = el("li");
        var label = el("label", "dvfr-check");
        var box = document.createElement("input");
        box.type = "checkbox";
        box.checked = !!(state.checks[f.key] || [])[i];
        box.addEventListener("change", function () {
          state.checks[f.key][i] = box.checked;
          if (!state.touched[f.key]) {
            state.scores[f.key] = suggested(f.key);
            syncFactor(f.key);
          } else {
            syncSuggestion(f.key);
          }
          changed();
        });
        label.appendChild(box);
        label.appendChild(el("span", null, text));
        li.appendChild(label);
        list.appendChild(li);
      });
      card.appendChild(list);

      var slider = document.createElement("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "10";
      slider.step = "1";
      slider.id = "dvfr-range-" + f.key;
      slider.className = "dvfr-range";
      slider.value = String(clampScore(state.scores[f.key]));
      slider.setAttribute("aria-describedby", "dvfr-anchor-" + f.key);

      var scoreRow = el("div", "dvfr-score-row");
      var scoreLabel = el("label", "dvfr-score-label", f.letter + " score");
      scoreLabel.setAttribute("for", slider.id);
      var value = el("output", "dvfr-score-value", String(clampScore(state.scores[f.key])));
      value.id = "dvfr-value-" + f.key;
      value.setAttribute("for", slider.id);
      scoreRow.appendChild(scoreLabel);
      scoreRow.appendChild(value);
      card.appendChild(scoreRow);
      card.appendChild(slider);

      var scale = el("div", "dvfr-scale");
      scale.appendChild(el("span", null, "0"));
      scale.appendChild(el("span", null, "5"));
      scale.appendChild(el("span", null, "10"));
      card.appendChild(scale);

      var anchor = el("p", "dvfr-anchor");
      anchor.id = "dvfr-anchor-" + f.key;
      card.appendChild(anchor);

      var hint = el("p", "dvfr-suggestion");
      hint.id = "dvfr-suggestion-" + f.key;
      card.appendChild(hint);

      slider.addEventListener("input", function () {
        state.scores[f.key] = clampScore(slider.value);
        state.touched[f.key] = true;
        syncFactor(f.key);
        changed();
      });
      slider.addEventListener("change", function () {
        track("dvfr_score", { dvfr_factor: f.key, dvfr_value: clampScore(slider.value) });
      });

      host.appendChild(card);
      syncFactor(f.key);
    });
  }

  function anchorFor(f, score) {
    if (score <= 2) return f.anchors["0"];
    if (score <= 7) return f.anchors["5"];
    return f.anchors["10"];
  }

  function syncFactor(key) {
    var f = factor(key);
    var score = clampScore(state.scores[key]);
    var slider = byId("dvfr-range-" + key);
    var value = byId("dvfr-value-" + key);
    var anchor = byId("dvfr-anchor-" + key);
    if (slider) slider.value = String(score);
    if (value) value.textContent = String(score);
    if (anchor) anchor.textContent = anchorFor(f, score);
    syncSuggestion(key);
  }

  function syncSuggestion(key) {
    var hint = byId("dvfr-suggestion-" + key);
    if (!hint) return;
    clear(hint);
    var sug = suggested(key);
    var score = clampScore(state.scores[key]);
    var anyChecked = (state.checks[key] || []).some(function (b) { return b; });
    if (!anyChecked || sug === score) {
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    hint.appendChild(document.createTextNode("What you checked suggests " + sug + ". "));
    var btn = el("button", "dvfr-link-btn", "Use " + sug);
    btn.type = "button";
    btn.addEventListener("click", function () {
      state.scores[key] = sug;
      state.touched[key] = false;
      syncFactor(key);
      changed();
    });
    hint.appendChild(btn);
  }

  /* ------------------------------------------------------------ step three */

  function renderVerdict() {
    var host = byId("dvfr-verdict");
    clear(host);
    var a = analyse();
    var copy = verdictCopy(a.verdict);

    var head = el("div", "dvfr-verdict-head dvfr-verdict-" + a.verdict);
    head.appendChild(el("p", "dvfr-eyebrow", "Verdict"));
    head.appendChild(el("h3", "dvfr-verdict-label", copy.label));
    head.appendChild(el("p", "dvfr-verdict-headline", copy.headline));

    var math = el("p", "dvfr-math");
    math.appendChild(el("span", "dvfr-math-part", "D " + a.s.d));
    math.appendChild(el("span", "dvfr-math-op", "x"));
    math.appendChild(el("span", "dvfr-math-part", "V " + a.s.v));
    math.appendChild(el("span", "dvfr-math-op", "x"));
    math.appendChild(el("span", "dvfr-math-part", "F " + a.s.f));
    math.appendChild(el("span", "dvfr-math-op", "="));
    math.appendChild(el("span", "dvfr-math-part", String(a.product)));
    head.appendChild(math);

    var scale = el("p", "dvfr-math-scale");
    scale.textContent = "Change force " + one(a.force) + " (cube root, back on the 0-10 scale) " +
      (a.force > a.s.r ? "beats" : "does not beat") + " resistance " + a.s.r + ".";
    head.appendChild(scale);
    head.appendChild(el("p", "dvfr-verdict-body", copy.body));
    host.appendChild(head);

    var bars = el("div", "dvfr-bars");
    content.factors.forEach(function (f) {
      var row = el("div", "dvfr-bar-row" + (f.key === a.weakest && a.verdict !== "zero" ? " is-weak" : "") +
        (f.key === "r" ? " is-resistance" : ""));
      row.appendChild(el("span", "dvfr-bar-label", f.letter + " " + f.name));
      var track_ = el("span", "dvfr-bar-track");
      var fill = el("span", "dvfr-bar-fill");
      fill.style.width = (a.s[f.key] * 10) + "%";
      track_.appendChild(fill);
      row.appendChild(track_);
      row.appendChild(el("span", "dvfr-bar-value", String(a.s[f.key])));
      bars.appendChild(row);
    });
    host.appendChild(bars);

    var plays = el("div", "dvfr-plays");
    var weakFactor = factor(a.verdict === "zero" ? a.zeros[0] : a.weakest);
    plays.appendChild(el("h4", null,
      a.verdict === "zero"
        ? "Fix this first: " + weakFactor.name + " is at zero"
        : "Weakest factor: " + weakFactor.name + " (" + a.s[weakFactor.key] + "). Work on this."));
    var ul = el("ul");
    weakFactor.plays.forEach(function (p) { ul.appendChild(el("li", null, p)); });
    plays.appendChild(ul);

    if (a.s.r >= a.force || a.s.r >= 7) {
      var rf = factor("r");
      plays.appendChild(el("h4", null, "Resistance is " + a.s.r + ". Lower it."));
      var rul = el("ul");
      rf.plays.forEach(function (p) { rul.appendChild(el("li", null, p)); });
      plays.appendChild(rul);
    }
    host.appendChild(plays);
  }

  /* ------------------------------------------------------------- step four */

  function renderVision() {
    var host = byId("dvfr-vision");
    clear(host);
    content.vision_prompts.forEach(function (p) {
      var field = el("div", "dvfr-field");
      var id = "dvfr-vision-" + p.key;
      var label = el("label", null, p.label);
      label.setAttribute("for", id);
      var help = el("p", "dvfr-help", p.help);
      help.id = id + "-help";
      var area = document.createElement("textarea");
      area.id = id;
      area.rows = p.key === "one_sentence" ? 2 : 3;
      area.value = str(state.vision[p.key]);
      area.setAttribute("aria-describedby", help.id);
      area.addEventListener("input", function () {
        state.vision[p.key] = area.value;
        changed();
      });
      field.appendChild(label);
      field.appendChild(help);
      field.appendChild(area);
      host.appendChild(field);
    });
  }

  /* ------------------------------------------------------------- step five */

  function renderBucketLegend() {
    var host = byId("dvfr-bucket-legend");
    clear(host);
    content.buckets.slice().sort(function (a, b) { return a.priority - b.priority; })
      .forEach(function (b) {
        var item = el("div", "dvfr-legend-item dvfr-bucket-" + b.key);
        item.appendChild(el("p", "dvfr-legend-name", b.priority + ". " + b.name));
        item.appendChild(el("p", "dvfr-legend-def", b.definition));
        item.appendChild(el("p", "dvfr-legend-guide", b.guidance));
        host.appendChild(item);
      });
  }

  function selectField(labelText, options, current, onChange) {
    var wrap = el("div", "dvfr-field dvfr-field-inline");
    var id = uid("sel");
    var label = el("label", null, labelText);
    label.setAttribute("for", id);
    var sel = document.createElement("select");
    sel.id = id;
    sel.className = "dvfr-select";
    options.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = o.label;
      if (o.key === current) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () { onChange(sel.value); });
    wrap.appendChild(label);
    wrap.appendChild(sel);
    return wrap;
  }

  function textField(labelText, value, placeholder, onInput, opts) {
    opts = opts || {};
    var wrap = el("div", "dvfr-field" + (opts.inline ? " dvfr-field-inline" : ""));
    var id = uid("txt");
    var label = el("label", null, labelText);
    label.setAttribute("for", id);
    var node = opts.rows
      ? document.createElement("textarea")
      : document.createElement("input");
    if (opts.rows) node.rows = opts.rows;
    else node.type = opts.type || "text";
    node.id = id;
    node.value = value || "";
    if (placeholder) node.placeholder = placeholder;
    if (!opts.rows && !opts.type) node.autocomplete = "off";
    node.addEventListener("input", function () { onInput(node.value); });
    wrap.appendChild(label);
    wrap.appendChild(node);
    return wrap;
  }

  function removeButton(label, fn) {
    var p = el("p", "dvfr-card-actions");
    var btn = el("button", "dvfr-link-btn dvfr-remove", label);
    btn.type = "button";
    btn.addEventListener("click", fn);
    p.appendChild(btn);
    return p;
  }

  function renderPeople() {
    var host = byId("dvfr-people");
    clear(host);
    if (!state.people.length) {
      host.appendChild(el("p", "dvfr-empty", content.bucket_warnings.empty));
    }
    state.people.forEach(function (p) {
      var card = el("article", "dvfr-card dvfr-bucket-" + p.bucket);
      var row = el("div", "dvfr-grid-2");
      row.appendChild(textField("Name", p.name, "Dana", function (v) {
        p.name = v;
        changed();
      }));
      row.appendChild(textField("Role", p.role, "VP Engineering", function (v) {
        p.role = v;
        changed();
      }));
      card.appendChild(row);

      var row2 = el("div", "dvfr-grid-2");
      row2.appendChild(selectField("Bucket", content.buckets.map(function (b) {
        return { key: b.key, label: b.name };
      }), p.bucket, function (v) {
        p.bucket = v;
        card.className = "dvfr-card dvfr-bucket-" + v;
        changed();
        track("dvfr_bucket", { dvfr_bucket: v });
      }));
      row2.appendChild(selectField("Influence", INFLUENCE, p.influence, function (v) {
        p.influence = v;
        changed();
      }));
      card.appendChild(row2);

      card.appendChild(textField("What are they afraid of losing?", p.concern,
        "Their team's ownership of the release gate", function (v) {
          p.concern = v;
          changed();
        }, { rows: 2 }));
      card.appendChild(textField("What changes in the plan because of that?", p.response,
        "They own the automated gate that replaces the manual one", function (v) {
          p.response = v;
          changed();
        }, { rows: 2 }));

      card.appendChild(removeButton("Remove", function () {
        state.people = state.people.filter(function (x) { return x !== p; });
        renderPeople();
        changed();
      }));
      host.appendChild(card);
    });
  }

  function renderPeopleReadout() {
    var host = byId("dvfr-people-read");
    clear(host);
    var people = namedPeople();
    var counts = {};
    content.buckets.forEach(function (b) { counts[b.key] = 0; });
    people.forEach(function (p) {
      if (counts[p.bucket] == null) counts[p.bucket] = 0;
      counts[p.bucket] += 1;
    });

    var tally = el("div", "dvfr-tally");
    content.buckets.slice().sort(function (a, b) { return a.priority - b.priority; })
      .forEach(function (b) {
        var item = el("div", "dvfr-tally-item dvfr-bucket-" + b.key);
        item.appendChild(el("span", "dvfr-tally-count", String(counts[b.key])));
        item.appendChild(el("span", "dvfr-tally-name", b.name));
        tally.appendChild(item);
      });
    host.appendChild(tally);

    if (!people.length) return;

    var warnings = [];
    var w = content.bucket_warnings;
    if (counts.opposed > counts.non_supportive) warnings.push(w.opposed_heavy);
    if (!counts.non_supportive) warnings.push(w.no_non_supportive);
    if (counts.supporter === people.length) warnings.push(w.all_supporters);
    var missing = people.filter(function (p) {
      return (p.bucket === "non_supportive" || p.bucket === "opposed" || p.bucket === "reluctant") &&
        !p.concern.trim();
    });
    if (missing.length) warnings.push(w.no_concerns);

    warnings.forEach(function (text) {
      host.appendChild(el("p", "dvfr-warning", text));
    });

    var order = el("div", "dvfr-worklist");
    order.appendChild(el("h4", null, "Work them in this order"));
    var ol = el("ol");
    sortedPeople().filter(function (p) { return p.name.trim() || p.role.trim(); })
      .forEach(function (p) {
        var li = el("li");
        li.appendChild(el("strong", null, p.name.trim() || "(unnamed)"));
        var meta = [];
        if (p.role.trim()) meta.push(p.role.trim());
        meta.push(bucket(p.bucket).name);
        meta.push(influenceLabel(p.influence).toLowerCase());
        li.appendChild(document.createTextNode(" — " + meta.join(", ")));
        if (!p.concern.trim() && p.bucket !== "supporter") {
          li.appendChild(el("span", "dvfr-flag", "ask what they fear losing"));
        }
        ol.appendChild(li);
      });
    order.appendChild(ol);
    host.appendChild(order);
  }

  /* -------------------------------------------------------------- step six */

  function renderCoalition() {
    var host = byId("dvfr-coalition");
    clear(host);
    if (!state.coalition.length) {
      host.appendChild(el("p", "dvfr-empty", "No coalition yet. Name the leaders you need."));
    }
    state.coalition.forEach(function (a) {
      var card = el("article", "dvfr-card dvfr-ally-" + a.state);
      var row = el("div", "dvfr-grid-3");
      row.appendChild(textField("Name", a.name, "Sam", function (v) {
        a.name = v;
        changed();
      }));
      row.appendChild(textField("Role or level", a.role, "SVP Product", function (v) {
        a.role = v;
        changed();
      }));
      row.appendChild(selectField("Commitment", content.coalition.states.map(function (s) {
        return { key: s.key, label: s.label };
      }), a.state, function (v) {
        a.state = v;
        card.className = "dvfr-card dvfr-ally-" + v;
        changed();
      }));
      card.appendChild(row);
      card.appendChild(removeButton("Remove", function () {
        state.coalition = state.coalition.filter(function (x) { return x !== a; });
        renderCoalition();
        changed();
      }));
      host.appendChild(card);
    });
  }

  function renderCoalitionReadout() {
    var host = byId("dvfr-coalition-read");
    clear(host);
    var target = content.coalition.target;
    var n = coalitionCount();
    var meter = el("div", "dvfr-meter" + (n >= target ? " is-met" : ""));
    meter.appendChild(el("p", "dvfr-meter-count", n + " of " + target + " all in"));
    var pips = el("div", "dvfr-pips");
    for (var i = 0; i < Math.max(target, n); i++) {
      pips.appendChild(el("span", "dvfr-pip" + (i < n ? " is-on" : "")));
    }
    meter.appendChild(pips);
    meter.appendChild(el("p", "dvfr-meter-note",
      n >= target ? content.coalition.met : content.coalition.short));
    host.appendChild(meter);
    host.appendChild(el("p", "dvfr-help", content.coalition.state_note));
    host.appendChild(el("p", "dvfr-help", content.coalition.levels_note));
  }

  /* ------------------------------------------------------------ step seven */

  function renderSteps() {
    var host = byId("dvfr-steps");
    clear(host);
    if (!state.steps.length) {
      host.appendChild(el("p", "dvfr-empty", content.first_steps.empty));
    }
    state.steps.forEach(function (t) {
      var card = el("article", "dvfr-card");
      card.appendChild(textField("First step", t.text,
        "Turn on the automated test suite in CI", function (v) {
          t.text = v;
          changed();
        }, { rows: 2 }));
      var row = el("div", "dvfr-grid-2");
      row.appendChild(textField("Owner", t.owner, "Dana", function (v) {
        t.owner = v;
        changed();
      }));
      row.appendChild(textField("Date", t.date, "", function (v) {
        t.date = v;
        changed();
      }, { type: "date" }));
      card.appendChild(row);
      card.appendChild(removeButton("Remove", function () {
        state.steps = state.steps.filter(function (x) { return x !== t; });
        renderSteps();
        changed();
      }));
      host.appendChild(card);
    });
  }

  function renderStepsReadout() {
    var host = byId("dvfr-steps-read");
    clear(host);
    var live = state.steps.filter(function (t) { return t.text.trim(); });
    if (!live.length) return;
    var undated = live.filter(function (t) { return !t.date || !t.owner.trim(); });
    if (undated.length) {
      host.appendChild(el("p", "dvfr-warning", content.first_steps.undated));
    }
    if (live.length > 5) {
      host.appendChild(el("p", "dvfr-warning",
        live.length + " first steps is a roadmap, not a first step. Pick the three that start this week."));
    }
  }

  function renderWins() {
    var host = byId("dvfr-wins");
    clear(host);
    if (!state.wins.length) {
      host.appendChild(el("p", "dvfr-empty", "No early wins named yet."));
    }
    state.wins.forEach(function (win) {
      var card = el("article", "dvfr-card");
      var row = el("div", "dvfr-grid-2");
      row.appendChild(textField("The win", win.text, "First weekly release ships", function (v) {
        win.text = v;
        changed();
      }));
      row.appendChild(textField("Who gets named for it", win.who, "The release crew", function (v) {
        win.who = v;
        changed();
      }));
      card.appendChild(row);
      card.appendChild(removeButton("Remove", function () {
        state.wins = state.wins.filter(function (x) { return x !== win; });
        renderWins();
        changed();
      }));
      host.appendChild(card);
    });
  }

  /* ------------------------------------------------------------- the plan */

  function planLine(host, label, value) {
    if (!value) return;
    var p = el("p", "dvfr-plan-line");
    p.appendChild(el("span", "dvfr-plan-label", label));
    p.appendChild(document.createTextNode(value));
    host.appendChild(p);
  }

  function renderPlan() {
    var host = byId("dvfr-plan");
    clear(host);
    var a = analyse();
    var copy = verdictCopy(a.verdict);

    host.appendChild(el("h3", "dvfr-plan-title", state.title.trim() || "Untitled change"));
    planLine(host, "The change", state.sentence.trim());
    planLine(host, "Who has to change", state.who.trim());
    planLine(host, "True by", state.by);

    var vsec = el("div", "dvfr-plan-block");
    vsec.appendChild(el("h4", null, "Verdict: " + copy.label));
    vsec.appendChild(el("p", null,
      "D " + a.s.d + " x V " + a.s.v + " x F " + a.s.f + " = " + a.product +
      ". Change force " + one(a.force) + " against resistance " + a.s.r + "."));
    vsec.appendChild(el("p", null, a.verdict === "zero"
      ? factor(a.zeros[0]).name + " is at zero. Nothing moves until that changes."
      : "Weakest factor: " + factor(a.weakest).name + " (" + a.s[a.weakest] + ")."));
    host.appendChild(vsec);

    var vision = content.vision_prompts.filter(function (p) {
      return str(state.vision[p.key]).trim();
    });
    if (vision.length) {
      var vb = el("div", "dvfr-plan-block");
      vb.appendChild(el("h4", null, "Vision"));
      var oneLine = str(state.vision.one_sentence).trim();
      if (oneLine) vb.appendChild(el("blockquote", "dvfr-plan-quote", oneLine));
      vision.forEach(function (p) {
        if (p.key === "one_sentence") return;
        var block = el("div", "dvfr-plan-sub");
        block.appendChild(el("p", "dvfr-plan-label", p.label));
        block.appendChild(el("p", null, str(state.vision[p.key]).trim()));
        vb.appendChild(block);
      });
      host.appendChild(vb);
    }

    var people = namedPeople();
    if (people.length) {
      var pb = el("div", "dvfr-plan-block");
      pb.appendChild(el("h4", null, "Stakeholders, in the order they get your attention"));
      content.buckets.slice().sort(function (x, y) { return x.priority - y.priority; })
        .forEach(function (b) {
          var inBucket = people.filter(function (p) { return p.bucket === b.key; });
          if (!inBucket.length) return;
          pb.appendChild(el("h5", null, b.name + " (" + inBucket.length + ")"));
          var ul = el("ul");
          inBucket.forEach(function (p) {
            var li = el("li");
            li.appendChild(el("strong", null, p.name.trim() || "(unnamed)"));
            var meta = [];
            if (p.role.trim()) meta.push(p.role.trim());
            meta.push(influenceLabel(p.influence).toLowerCase());
            li.appendChild(document.createTextNode(" — " + meta.join(", ")));
            if (p.concern.trim()) {
              li.appendChild(el("div", "dvfr-plan-note", "Afraid of losing: " + p.concern.trim()));
            }
            if (p.response.trim()) {
              li.appendChild(el("div", "dvfr-plan-note", "So the plan changes: " + p.response.trim()));
            }
            ul.appendChild(li);
          });
          pb.appendChild(ul);
        });
      host.appendChild(pb);
    }

    var allies = state.coalition.filter(function (x) { return x.name.trim() || x.role.trim(); });
    if (allies.length) {
      var cb = el("div", "dvfr-plan-block");
      cb.appendChild(el("h4", null,
        "Coalition (" + coalitionCount() + " of " + content.coalition.target + " all in)"));
      var cul = el("ul");
      allies.forEach(function (x) {
        var li = el("li");
        li.appendChild(el("strong", null, x.name.trim() || "(unnamed)"));
        var bits = [];
        if (x.role.trim()) bits.push(x.role.trim());
        bits.push(coalitionState(x.state).label);
        li.appendChild(document.createTextNode(" — " + bits.join(", ")));
        cul.appendChild(li);
      });
      cb.appendChild(cul);
      host.appendChild(cb);
    }

    var steps = state.steps.filter(function (t) { return t.text.trim(); });
    if (steps.length) {
      var sb = el("div", "dvfr-plan-block");
      sb.appendChild(el("h4", null, "First steps"));
      var sul = el("ul", "dvfr-plan-steps");
      steps.forEach(function (t) {
        var li = el("li");
        li.appendChild(document.createTextNode(t.text.trim()));
        var bits = [];
        bits.push(t.owner.trim() ? t.owner.trim() : "no owner");
        bits.push(t.date ? t.date : "no date");
        li.appendChild(el("span", "dvfr-plan-meta", bits.join(" · ")));
        sul.appendChild(li);
      });
      sb.appendChild(sul);
      host.appendChild(sb);
    }

    var wins = state.wins.filter(function (w) { return w.text.trim(); });
    if (wins.length) {
      var wb = el("div", "dvfr-plan-block");
      wb.appendChild(el("h4", null, "Early wins to celebrate in public"));
      var wul = el("ul");
      wins.forEach(function (w) {
        var li = el("li", null, w.text.trim());
        if (w.who.trim()) li.appendChild(el("span", "dvfr-plan-meta", "name " + w.who.trim()));
        wul.appendChild(li);
      });
      wb.appendChild(wul);
      host.appendChild(wb);
    }
  }

  /* ---------------------------------------------------------------- export */

  function markdown() {
    var a = analyse();
    var copy = verdictCopy(a.verdict);
    var out = [];
    out.push("# " + (state.title.trim() || "Untitled change"));
    out.push("");
    if (state.sentence.trim()) out.push("**The change:** " + state.sentence.trim());
    if (state.who.trim()) out.push("**Who has to change:** " + state.who.trim());
    if (state.by) out.push("**True by:** " + state.by);
    out.push("");
    out.push("## Verdict: " + copy.label);
    out.push("");
    out.push("`D " + a.s.d + " x V " + a.s.v + " x F " + a.s.f + " = " + a.product + "` — change force " +
      one(a.force) + " against resistance " + a.s.r + ".");
    out.push("");
    out.push(a.verdict === "zero"
      ? factor(a.zeros[0]).name + " is at zero, so the left side is zero. Nothing moves until that changes."
      : "Weakest factor: " + factor(a.weakest).name + " (" + a.s[a.weakest] + ").");
    out.push("");
    out.push("| Factor | Score |");
    out.push("| --- | --- |");
    content.factors.forEach(function (f) {
      out.push("| " + f.letter + " — " + f.name + " | " + a.s[f.key] + " |");
    });
    out.push("");
    out.push("### What to do next");
    out.push("");
    var weak = factor(a.verdict === "zero" ? a.zeros[0] : a.weakest);
    weak.plays.forEach(function (p) { out.push("- " + p); });
    if (a.s.r >= a.force || a.s.r >= 7) {
      out.push("");
      out.push("Resistance is " + a.s.r + ":");
      out.push("");
      factor("r").plays.forEach(function (p) { out.push("- " + p); });
    }

    var visionUsed = content.vision_prompts.filter(function (p) {
      return str(state.vision[p.key]).trim();
    });
    if (visionUsed.length) {
      out.push("");
      out.push("## Vision");
      var oneLine = str(state.vision.one_sentence).trim();
      if (oneLine) {
        out.push("");
        out.push("> " + oneLine);
      }
      visionUsed.forEach(function (p) {
        if (p.key === "one_sentence") return;
        out.push("");
        out.push("**" + p.label + "**");
        out.push("");
        out.push(str(state.vision[p.key]).trim());
      });
    }

    var people = namedPeople();
    if (people.length) {
      out.push("");
      out.push("## Stakeholders");
      content.buckets.slice().sort(function (x, y) { return x.priority - y.priority; })
        .forEach(function (b) {
          var inBucket = people.filter(function (p) { return p.bucket === b.key; });
          if (!inBucket.length) return;
          out.push("");
          out.push("### " + b.priority + ". " + b.name + " (" + inBucket.length + ")");
          out.push("");
          inBucket.forEach(function (p) {
            var bits = [];
            if (p.role.trim()) bits.push(p.role.trim());
            bits.push(influenceLabel(p.influence).toLowerCase());
            out.push("- **" + (p.name.trim() || "(unnamed)") + "** — " + bits.join(", "));
            if (p.concern.trim()) out.push("  - Afraid of losing: " + p.concern.trim());
            if (p.response.trim()) out.push("  - So the plan changes: " + p.response.trim());
          });
        });
    }

    var allies = state.coalition.filter(function (x) { return x.name.trim() || x.role.trim(); });
    if (allies.length) {
      out.push("");
      out.push("## Coalition (" + coalitionCount() + " of " + content.coalition.target + " all in)");
      out.push("");
      allies.forEach(function (x) {
        var bits = [];
        if (x.role.trim()) bits.push(x.role.trim());
        bits.push(coalitionState(x.state).label);
        out.push("- **" + (x.name.trim() || "(unnamed)") + "** — " + bits.join(", "));
      });
    }

    var steps = state.steps.filter(function (t) { return t.text.trim(); });
    if (steps.length) {
      out.push("");
      out.push("## First steps");
      out.push("");
      steps.forEach(function (t) {
        out.push("- [ ] " + t.text.trim() + " — " + (t.owner.trim() || "no owner") +
          " — " + (t.date || "no date"));
      });
    }

    var wins = state.wins.filter(function (w) { return w.text.trim(); });
    if (wins.length) {
      out.push("");
      out.push("## Early wins to celebrate in public");
      out.push("");
      wins.forEach(function (w) {
        out.push("- " + w.text.trim() + (w.who.trim() ? " — name " + w.who.trim() : ""));
      });
    }

    out.push("");
    out.push("---");
    out.push("");
    out.push("Worked through D x V x F > R. " + content.model.source.url);
    out.push("");
    return out.join("\n");
  }

  function slug() {
    var base = state.title.trim() || "change-plan";
    return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
      "change-plan";
  }

  var statusTimer = null;
  function setStatus(text) {
    var node = byId("dvfr-status");
    if (!node) return;
    node.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { node.textContent = ""; }, 4000);
  }

  function downloadBlob(text, filename, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setStatus("Copied the plan as Markdown.");
      }, function () {
        legacyCopy(text);
      });
      return;
    }
    legacyCopy(text);
  }

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(area);
    setStatus(ok ? "Copied the plan as Markdown." : "Could not copy. Use Download .md instead.");
  }

  function bindExports() {
    byId("dvfr-copy").addEventListener("click", function () {
      copyText(markdown());
      track("dvfr_export", { dvfr_kind: "copy" });
    });
    byId("dvfr-download").addEventListener("click", function () {
      downloadBlob(markdown(), slug() + ".md", "text/markdown;charset=utf-8");
      setStatus("Downloaded " + slug() + ".md");
      track("dvfr_export", { dvfr_kind: "markdown" });
    });
    byId("dvfr-print").addEventListener("click", function () {
      track("dvfr_export", { dvfr_kind: "print" });
      window.print();
    });
    byId("dvfr-export").addEventListener("click", function () {
      downloadBlob(JSON.stringify(state, null, 2), slug() + ".json", "application/json");
      setStatus("Exported " + slug() + ".json");
      track("dvfr_export", { dvfr_kind: "json" });
    });

    var file = byId("dvfr-import-file");
    byId("dvfr-import").addEventListener("click", function () {
      file.click();
    });
    file.addEventListener("change", function () {
      var chosen = file.files && file.files[0];
      if (!chosen) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          state = coerce(JSON.parse(String(reader.result)));
          renderAll();
          save();
          setStatus("Imported " + chosen.name);
          track("dvfr_export", { dvfr_kind: "import" });
        } catch (e) {
          setStatus("That file is not a workbook export.");
        }
      };
      reader.onerror = function () { setStatus("Could not read that file."); };
      reader.readAsText(chosen);
      file.value = "";
    });

    byId("dvfr-reset").addEventListener("click", function () {
      if (!window.confirm("Clear this workbook? Export it first if you want to keep it.")) return;
      state = emptyState();
      try {
        localStorage.removeItem(STORE_KEY);
      } catch (e) {}
      renderAll();
      setStatus("Workbook cleared.");
    });
  }

  /* ------------------------------------------------------------------ rail */

  function renderRail() {
    var rail = byId("dvfr-rail");
    clear(rail);
    var list = el("ol", "dvfr-rail-list");
    var steps = document.querySelectorAll(".dvfr-step");
    for (var i = 0; i < steps.length; i++) {
      var section = steps[i];
      var heading = section.querySelector("h2");
      if (!heading) continue;
      var li = el("li");
      var link = el("a", "dvfr-rail-link", heading.textContent);
      link.href = "#" + section.id;
      link.addEventListener("click", function (e) {
        var target = document.querySelector(this.getAttribute("href"));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        var focusable = target.querySelector("input, textarea, select, button");
        if (focusable) focusable.focus({ preventScroll: true });
        track("dvfr_step", { dvfr_step: target.id });
      });
      li.appendChild(link);
      list.appendChild(li);
    }
    rail.appendChild(list);
  }

  /* ---------------------------------------------------------------- render */

  function renderDerived() {
    renderVerdict();
    renderPeopleReadout();
    renderCoalitionReadout();
    renderStepsReadout();
    renderPlan();
  }

  function renderAll() {
    byId("dvfr-title").value = state.title;
    byId("dvfr-sentence").value = state.sentence;
    byId("dvfr-who").value = state.who;
    byId("dvfr-by").value = state.by;
    renderFactors();
    renderVision();
    renderPeople();
    renderCoalition();
    renderSteps();
    renderWins();
    renderDerived();
  }

  function boot() {
    state = load();

    bindText("dvfr-title", "title");
    bindText("dvfr-sentence", "sentence");
    bindText("dvfr-who", "who");
    bindText("dvfr-by", "by");

    byId("dvfr-coalition-rule").textContent = content.coalition.rule;
    byId("dvfr-steps-help").textContent = content.first_steps.help;
    byId("dvfr-wins-help").textContent = content.first_steps.wins_help;

    var link = byId("dvfr-guide-link");
    if (link) {
      var u = new URL(guidePage, document.baseURI || window.location.href);
      link.href = u.origin === window.location.origin ? u.pathname + u.search : u.href;
    }

    renderBucketLegend();

    byId("dvfr-add-person").addEventListener("click", function () {
      state.people.push({
        id: uid("p"), name: "", role: "", bucket: "non_supportive",
        influence: "medium", concern: "", response: ""
      });
      renderPeople();
      changed();
      focusLast("dvfr-people");
    });
    byId("dvfr-add-ally").addEventListener("click", function () {
      state.coalition.push({ id: uid("a"), name: "", role: "", state: "not_asked" });
      renderCoalition();
      changed();
      focusLast("dvfr-coalition");
    });
    byId("dvfr-add-step").addEventListener("click", function () {
      state.steps.push({ id: uid("s"), text: "", owner: "", date: "" });
      renderSteps();
      changed();
      focusLast("dvfr-steps");
    });
    byId("dvfr-add-win").addEventListener("click", function () {
      state.wins.push({ id: uid("w"), text: "", who: "" });
      renderWins();
      changed();
      focusLast("dvfr-wins");
    });

    bindExports();
    renderAll();
    renderRail();
  }

  function focusLast(hostId) {
    var cards = byId(hostId).querySelectorAll(".dvfr-card");
    if (!cards.length) return;
    var field = cards[cards.length - 1].querySelector("input, textarea, select");
    if (field) field.focus();
  }

  fetch(contentUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("content missing");
      return r.json();
    })
    .then(function (data) {
      content = data;
      boot();
    })
    .catch(function () {
      var host = byId("dvfr-factors");
      if (host) {
        clear(host);
        host.appendChild(el("p", "dvfr-empty", "Could not load the model content."));
      }
    });
})();
