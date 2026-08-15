(function () {
  var cfg = window.DVFR || {};
  var contentUrl = cfg.content || "/data/dvfr.json";
  var workbookPage = cfg.workbookPage || "index.html";

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

  function localHref(page) {
    var u = new URL(page, document.baseURI || window.location.href);
    return u.origin === window.location.origin ? u.pathname + u.search : u.href;
  }

  function render(content) {
    byId("dvfr-tagline").textContent = content.model.tagline;

    var formula = byId("dvfr-formula");
    clear(formula);
    var row = el("p", "dvfr-formula-row");
    ["D", "x", "V", "x", "F", ">", "R"].forEach(function (part) {
      row.appendChild(el("span", /[DVFR]/.test(part) ? "dvfr-formula-letter" : "dvfr-formula-op", part));
    });
    formula.appendChild(row);
    formula.appendChild(el("p", "dvfr-formula-statement", content.model.statement));
    formula.appendChild(el("p", "dvfr-formula-note", content.model.why_multiply));

    var factors = byId("dvfr-guide-factors");
    clear(factors);
    factors.appendChild(el("h2", null, "The four factors"));
    var grid = el("div", "dvfr-guide-grid");
    content.factors.forEach(function (f) {
      var card = el("article", "dvfr-guide-card dvfr-factor-" + f.key);
      card.appendChild(el("span", "dvfr-factor-letter", f.letter));
      card.appendChild(el("h3", null, f.name));
      card.appendChild(el("p", "dvfr-factor-def", f.definition));
      card.appendChild(el("p", null, f.help));
      grid.appendChild(card);
    });
    factors.appendChild(grid);

    var buckets = byId("dvfr-guide-buckets");
    clear(buckets);
    buckets.appendChild(el("h2", null, "The four buckets, in the order they get your attention"));
    var list = el("ol", "dvfr-guide-buckets-list");
    content.buckets.slice().sort(function (a, b) { return a.priority - b.priority; })
      .forEach(function (b) {
        var li = el("li", "dvfr-bucket-" + b.key);
        li.appendChild(el("h3", null, b.name));
        li.appendChild(el("p", "dvfr-legend-def", b.definition));
        li.appendChild(el("p", null, b.guidance));
        list.appendChild(li);
      });
    buckets.appendChild(list);

    var sections = byId("dvfr-guide-sections");
    clear(sections);
    sections.appendChild(el("p", "dvfr-guide-intro", content.guide.intro));
    content.guide.sections.forEach(function (s) {
      var block = el("section", "dvfr-guide-section");
      block.appendChild(el("h2", null, s.title));
      block.appendChild(el("p", null, s.body));
      sections.appendChild(block);
    });

    var source = byId("dvfr-source");
    clear(source);
    source.appendChild(document.createTextNode("From "));
    var a = el("a", null, content.model.source.title);
    a.href = content.model.source.url;
    a.rel = "noopener";
    source.appendChild(a);
    source.appendChild(document.createTextNode(" by " + content.model.source.author + "."));

    ["dvfr-workbook-link", "dvfr-workbook-cta"].forEach(function (id) {
      var link = byId(id);
      if (link) link.href = localHref(workbookPage);
    });
  }

  fetch(contentUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("content missing");
      return r.json();
    })
    .then(render)
    .catch(function () {
      var host = byId("dvfr-guide-sections");
      if (host) {
        clear(host);
        host.appendChild(el("p", "dvfr-empty", "Could not load the model content."));
      }
    });
})();
