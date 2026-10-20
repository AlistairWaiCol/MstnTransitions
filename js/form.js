// Builds the student form from the field definitions in js/fields.js and keeps it in step with
// a student's answers. It holds no data of its own: every change goes to the callbacks, and the
// page calls show() with the updated student.
(function () {
  "use strict";

  var F = TF.fields;
  var R = TF.rules;

  function make(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) {
      if (name === "className") node.className = attrs[name];
      else node.setAttribute(name, attrs[name]);
    });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function controlId(key) { return "in-" + key; }

  // options.onAnswer(key, value) for a single answer; options.onToggle(key, option, checked)
  // for a tick in a multi-select.
  function StudentForm(formElement, options) {
    this.form = formElement;
    this.options = options;
    this.wrappers = {};
    this.sections = {};
    this.controls = {};
    this.build();
    this.listen();
  }

  StudentForm.prototype.build = function () {
    var self = this;
    var form = this.form;
    form.replaceChildren();
    F.SECTIONS.forEach(function (section) {
      var box = make("section", { className: "form-section", id: "s-" + section.id, "aria-labelledby": "s-" + section.id + "-h" });
      box.appendChild(make("h2", { id: "s-" + section.id + "-h" }, section.title));
      if (section.intro) box.appendChild(make("p", { className: "intro" }, section.intro));
      F.FIELDS.filter(function (f) { return f.section === section.id; }).forEach(function (field) {
        box.appendChild(self.buildField(field));
      });
      self.sections[section.id] = box;
      form.appendChild(box);
    });
  };

  StudentForm.prototype.buildField = function (field) {
    var key = field.key;
    var wrapper = make("div", { className: "field", id: "f-" + key });
    var describedBy = [];
    var hint = null;
    var helper = null;
    var counter = null;
    var problem = make("p", { className: "problem", id: "p-" + key, hidden: "" });

    if (field.hint) hint = make("p", { className: "hint small", id: "h-" + key }, field.hint);
    if (field.helper) helper = make("p", { className: "hint small", id: "x-" + key }, field.helper);
    if (field.limit) counter = make("p", { className: "counter small", id: "c-" + key });
    [hint, helper, counter].forEach(function (n) { if (n) describedBy.push(n.id); });
    describedBy.push(problem.id);

    function labelText(parent) {
      parent.appendChild(document.createTextNode(field.label));
      if (field.required) parent.appendChild(make("span", { className: "req" }, " (required)"));
      return parent;
    }

    var grouped = ["choice", "rating", "multi", "tickbox"].indexOf(field.type) !== -1;
    var control;

    if (grouped) {
      var fieldset = make("fieldset", { "aria-describedby": describedBy.join(" ") });
      fieldset.appendChild(labelText(make("legend")));
      if (hint) fieldset.appendChild(hint);
      var list = make("div", { className: field.type === "rating" ? "options rating" : "options" });
      var choices = field.type === "tickbox" ? ["Yes"] : field.options;
      choices.forEach(function (option, i) {
        var id = controlId(key) + "-" + i;
        var input = make("input", {
          type: field.type === "multi" || field.type === "tickbox" ? "checkbox" : "radio",
          id: id, name: controlId(key), value: option
        });
        input.dataset.key = key;
        var label = make("label", { className: "option", "for": id });
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + (field.type === "tickbox" ? field.tickboxText : option)));
        list.appendChild(label);
      });
      fieldset.appendChild(list);
      if (helper) fieldset.appendChild(helper);
      fieldset.appendChild(problem);
      wrapper.appendChild(fieldset);
      control = list;
    } else {
      var label = labelText(make("label", { "for": controlId(key) }));
      wrapper.appendChild(label);
      if (hint) wrapper.appendChild(hint);
      if (field.type === "longtext") {
        control = make("textarea", { id: controlId(key), rows: "5" });
        if (field.limit) control.setAttribute("maxlength", String(field.limit));
      } else if (field.type === "year" || field.type === "destination") {
        control = make("select", { id: controlId(key) });
      } else if (field.type === "number") {
        control = make("input", { type: "text", id: controlId(key), inputmode: "decimal", autocomplete: "off", className: "short" });
      } else {
        control = make("input", { type: "text", id: controlId(key), autocomplete: "off", spellcheck: "false" });
      }
      control.dataset.key = key;
      control.setAttribute("aria-describedby", describedBy.join(" "));
      wrapper.appendChild(control);
      if (counter) wrapper.appendChild(counter);
      if (helper) wrapper.appendChild(helper);
      wrapper.appendChild(problem);
    }

    if (field.type === "year") {
      control.appendChild(make("option", { value: "" }, "Choose a year"));
      field.options.forEach(function (y) { control.appendChild(make("option", { value: y }, y)); });
    }

    this.wrappers[key] = wrapper;
    this.controls[key] = { field: field, control: control, problem: problem, counter: counter };
    return wrapper;
  };

  StudentForm.prototype.listen = function () {
    var self = this;
    function handle(event) {
      var target = event.target;
      var key = target.dataset && target.dataset.key;
      if (!key) return;
      var field = F.byKey(key);
      if (target.type === "radio") {
        if (event.type === "change" && target.checked) self.options.onAnswer(key, target.value);
      } else if (target.type === "checkbox") {
        if (event.type !== "change") return;
        if (field.type === "tickbox") self.options.onAnswer(key, target.checked ? "Yes" : "");
        else self.options.onToggle(key, target.value, target.checked);
      } else if (target.tagName === "SELECT") {
        if (event.type === "change") self.options.onAnswer(key, target.value);
      } else if (event.type === "input") {
        var value = target.value;
        if (field.limit && R.textLength(value) > field.limit) {
          // A paste over the limit is cut, not refused. Text that was already over the limit
          // (possible only in an edited file) is left for the teacher to shorten.
          var before = self.current ? self.current.fields[key] : "";
          if (R.textLength(before) <= field.limit) {
            value = R.cutToLimit(value, field.limit);
            target.value = value;
          }
        }
        self.options.onAnswer(key, value);
      }
    }
    this.form.addEventListener("input", handle);
    this.form.addEventListener("change", handle);
    this.form.addEventListener("submit", function (event) { event.preventDefault(); });
  };

  // Destination choices for this student: the receiving schools, then Other. A saved destination
  // that is no longer on the list is kept and shown as such, never cleared.
  StudentForm.prototype.setDestinations = function (schools, current) {
    var select = this.controls.destination_school_domain.control;
    select.replaceChildren();
    select.appendChild(make("option", { value: "" }, "Choose a school"));
    var known = false;
    schools.forEach(function (school) {
      if (school.canonical === current) known = true;
      select.appendChild(make("option", { value: school.canonical }, school.name));
    });
    select.appendChild(make("option", { value: F.OTHER_DESTINATION }, F.OTHER_DESTINATION_LABEL));
    if (current && current !== F.OTHER_DESTINATION && !known) {
      select.appendChild(make("option", { value: current }, current + " (not on the school list)"));
    }
  };

  // Brings every control, show/hide state, counter and problem message into line with the student.
  StudentForm.prototype.show = function (student, problems) {
    var self = this;
    this.current = student;
    var answers = R.answersOf(student);
    var shown = R.visibility(answers);
    var byKey = {};
    problems.forEach(function (p) { byKey[p.key] = p; });

    F.SECTIONS.forEach(function (section) {
      self.sections[section.id].hidden = !R.isSectionShown(section.id, answers);
    });

    F.FIELDS.forEach(function (field) {
      var key = field.key;
      var entry = self.controls[key];
      var value = answers[key];
      self.wrappers[key].hidden = !shown[key];

      if (field.type === "multi" || field.type === "choice" || field.type === "rating" || field.type === "tickbox") {
        var list = Array.isArray(value) ? value : [value];
        entry.control.querySelectorAll("input").forEach(function (input) {
          var on = field.type === "tickbox" ? value === "Yes" : list.indexOf(input.value) !== -1;
          if (input.checked !== on) input.checked = on;
        });
      } else {
        var text = typeof value === "string" ? value : (value === undefined || value === null ? "" : String(value));
        if (entry.control.value !== text) entry.control.value = text;
      }

      if (entry.counter) {
        var length = R.textLength(entry.control.value);
        entry.counter.textContent = length + " of " + field.limit + " characters" +
          (length >= field.limit ? ". That is the limit." : "");
        entry.counter.classList.toggle("at-limit", length >= field.limit);
      }

      var problem = byKey[key];
      self.wrappers[key].classList.toggle("is-missing", Boolean(problem && problem.kind === "missing"));
      self.wrappers[key].classList.toggle("is-invalid", Boolean(problem && problem.kind === "invalid"));
      entry.problem.hidden = !problem;
      entry.problem.textContent = problem ? (problem.kind === "missing" && problem.message === "Not answered." ? "Not answered yet." : problem.message) : "";
      var target = entry.control.tagName === "DIV" ? entry.control.closest("fieldset") : entry.control;
      if (problem && problem.kind === "invalid") target.setAttribute("aria-invalid", "true");
      else target.removeAttribute("aria-invalid");
    });
  };

  // Moves focus to a field's first control.
  StudentForm.prototype.focus = function (key) {
    var entry = this.controls[key];
    if (!entry) return;
    var target = entry.control.tagName === "DIV" ? entry.control.querySelector("input") : entry.control;
    this.wrappers[key].scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  };

  window.TF = window.TF || {};
  window.TF.StudentForm = StudentForm;
})();
