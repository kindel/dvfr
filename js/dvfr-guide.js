(function () {
  var cfg = window.DVFR || {};
  // Relative by default so a subdirectory mount works without configuration.
  var contentUrl = new URL(cfg.content || "data/dvfr.json",
    document.baseURI || window.location.href).href;
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

  // A host that supplies its own page chrome will not have every element this
  // script fills, so nothing here may assume an element exists. Each block is
  // guarded on its own: a missing one must not stop the blocks after it.
  function setText(id, text) {
    var node = byId(id);
    if (node) node.textContent = text;
  }

  function withHost(id, fn) {
    var host = byId(id);
    if (!host) return;
    clear(host);
    fn(host);
  }

  function render(content) {
    setText("dvfr-tagline", content.model.tagline);

    withHost("dvfr-formula", function (formula) {
      var row = el("p", "dvfr-formula-row");
      ["D", "x", "V", "x", "F", ">", "R"].forEach(function (part) {
        row.appendChild(el("span",
          /[DVFR]/.test(part) ? "dvfr-formula-letter" : "dvfr-formula-op", part));
      });
      formula.appendChild(row);
      formula.appendChild(el("p", "dvfr-formula-statement", content.model.statement));
      formula.appendChild(el("p", "dvfr-formula-note", content.model.why_multiply));
    });

    withHost("dvfr-guide-factors", function (factors) {
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
    });

    withHost("dvfr-guide-buckets", function (buckets) {
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
    });

    withHost("dvfr-guide-sections", function (sections) {
      sections.appendChild(el("p", "dvfr-guide-intro", content.guide.intro));
      content.guide.sections.forEach(function (part) {
        var block = el("section", "dvfr-guide-section");
        block.appendChild(el("h2", null, part.title));
        block.appendChild(el("p", null, part.body));
        sections.appendChild(block);
      });
    });

    withHost("dvfr-source", function (source) {
      source.appendChild(document.createTextNode("From "));
      var a = el("a", null, content.model.source.title);
      a.href = content.model.source.url;
      a.rel = "noopener";
      source.appendChild(a);
      source.appendChild(document.createTextNode(" by " + content.model.source.author + "."));
    });

    ["dvfr-workbook-link", "dvfr-workbook-cta"].forEach(function (id) {
      var link = byId(id);
      if (link) link.href = localHref(workbookPage);
    });
  }

  function showError(message) {
    var host = byId("dvfr-guide-sections") || document.querySelector(".dvfr-app");
    if (!host) return;
    clear(host);
    host.appendChild(el("p", "dvfr-empty dvfr-load-error", message));
  }

  fetch(contentUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("content missing");
      return r.json();
    })
    .then(
      function (data) {
        // Kept out of the fetch catch so a rendering bug is never reported as a
        // failed download.
        try {
          render(data);
        } catch (e) {
          showError("The model content loaded but this page could not render it.");
          throw e;
        }
      },
      function () {
        showError("Could not load the model content. Reload the page, and if it keeps failing " +
          "check that data/dvfr.json is being served.");
      }
    );
})();
