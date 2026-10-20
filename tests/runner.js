// A very small test runner for tests/rules.html. Tests register with test(name, fn); fn may be
// async. Results are shown on the page as a pass or fail list.
(function () {
  "use strict";

  var tests = [];

  window.test = function (name, fn) { tests.push({ name: name, fn: fn }); };

  function show(value) {
    return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
  }

  window.assert = {
    ok: function (value, message) {
      if (!value) throw new Error(message || "Expected a true value.");
    },
    equal: function (actual, expected, message) {
      if (actual !== expected) {
        throw new Error((message ? message + ": " : "") + "expected " + show(expected) + ", got " + show(actual));
      }
    },
    deepEqual: function (actual, expected, message) {
      var a = JSON.stringify(actual);
      var b = JSON.stringify(expected);
      if (a !== b) throw new Error((message ? message + ": " : "") + "expected " + b + ", got " + a);
    },
    throws: function (fn, pattern, message) {
      try {
        fn();
      } catch (error) {
        if (pattern && !pattern.test(error.message)) {
          throw new Error((message ? message + ": " : "") + "threw \"" + error.message + "\", expected it to match " + pattern);
        }
        return error;
      }
      throw new Error((message ? message + ": " : "") + "expected an error, but none was thrown.");
    }
  };

  // A test that cannot run here (for example a file that needs the page served over http).
  function Skip(message) { this.message = message; }
  window.skip = function (message) { throw new Skip(message); };

  window.runTests = async function () {
    var list = document.getElementById("results");
    var summary = document.getElementById("summary");
    var passed = 0;
    var failed = 0;
    var skipped = 0;
    for (var i = 0; i < tests.length; i++) {
      var t = tests[i];
      var item = document.createElement("li");
      var title = document.createElement("span");
      title.className = "name";
      title.textContent = t.name;
      var detail = null;
      try {
        await t.fn();
        item.className = "pass";
        title.textContent = "PASS  " + t.name;
        passed++;
      } catch (error) {
        detail = document.createElement("pre");
        if (error instanceof Skip) {
          item.className = "skip";
          title.textContent = "SKIPPED  " + t.name;
          detail.textContent = error.message;
          skipped++;
        } else {
          item.className = "fail";
          title.textContent = "FAIL  " + t.name;
          detail.textContent = error && error.message ? error.message : String(error);
          failed++;
        }
      }
      item.appendChild(title);
      if (detail) item.appendChild(detail);
      list.appendChild(item);
    }
    summary.textContent = failed === 0
      ? "All " + passed + " tests passed" + (skipped ? ", " + skipped + " skipped." : ".")
      : failed + " of " + (passed + failed) + " tests failed" + (skipped ? ", " + skipped + " skipped." : ".");
    summary.className = failed === 0 ? "pass" : "fail";
    document.title = (failed === 0 ? "PASS" : "FAIL") + ": transition form rules tests";
  };
})();
