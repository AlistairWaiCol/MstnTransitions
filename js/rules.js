// The form's rules as plain functions with no page dependencies: when a field is shown, the
// exclusive options, clearing hidden fields, the character limits, and the completeness check.
// The student form, the roll overview and (in Phase C) sending all use the same functions.
(function (root) {
  "use strict";

  var F = root.TF.fields;

  function isBlank(value) {
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || String(value).trim() === "";
  }

  function emptyValue(key) {
    return F.isMulti(key) ? [] : "";
  }

  // A student's answers, including destination, as one lookup keyed by field key.
  function answersOf(student) {
    var answers = Object.assign({}, student.fields);
    answers.destination_school_domain = student.destination_school_domain;
    return answers;
  }

  // ---- Shown or hidden ----

  function ruleHolds(rule, answers) {
    var value = answers[rule.key];
    if ("equals" in rule) return value === rule.equals;
    var list = Array.isArray(value) ? value : [];
    if ("includes" in rule) return list.indexOf(rule.includes) !== -1;
    if ("hasOtherThan" in rule) return list.some(function (v) { return v !== rule.hasOtherThan; });
    return false;
  }

  // A field is shown if its rule holds and the field the rule depends on is itself shown.
  function isShown(key, answers) {
    var field = F.byKey(key);
    if (!field || !field.shownWhen) return true;
    return ruleHolds(field.shownWhen, answers) && isShown(field.shownWhen.key, answers);
  }

  // { key: true/false } for every field.
  function visibility(answers) {
    var shown = {};
    F.FIELDS.forEach(function (f) { shown[f.key] = isShown(f.key, answers); });
    return shown;
  }

  function isSectionShown(sectionId, answers) {
    return F.FIELDS.some(function (f) { return f.section === sectionId && isShown(f.key, answers); });
  }

  // Empties every hidden field. Returns the new fields and the values it cleared, so the form can
  // give them back if the teacher re-ticks a flag in the same visit. The input is not changed.
  function clearHidden(fields) {
    var result = Object.assign({}, fields);
    var cleared = {};
    F.STUDENT_KEYS.forEach(function (key) {
      if (!isShown(key, fields) && !isBlank(fields[key])) {
        cleared[key] = fields[key];
        result[key] = emptyValue(key);
      }
    });
    return { fields: result, cleared: cleared };
  }

  // ---- Exclusive options ----

  // The new list of ticks after the teacher ticks or unticks one option. Choosing the field's
  // exclusive option ("Nothing to report", "N/A", "None of the above") clears the others, and
  // ticking any other option clears the exclusive one. Options stay in the field's listed order.
  function toggleOption(key, current, option, checked) {
    var field = F.byKey(key);
    var ticked = (Array.isArray(current) ? current : []).slice();
    if (checked) {
      if (field.exclusive && option === field.exclusive) {
        ticked = [option];
      } else {
        ticked = ticked.filter(function (v) { return v !== field.exclusive; });
        if (ticked.indexOf(option) === -1) ticked.push(option);
      }
    } else {
      ticked = ticked.filter(function (v) { return v !== option; });
    }
    return field.options.filter(function (o) { return ticked.indexOf(o) !== -1; });
  }

  // ---- Limits ----

  // Characters are counted as the browser counts them for maxlength: UTF-16 code units, with a
  // line break as one. Macrons such as ā are one each.
  function textLength(text) {
    return String(text).replace(/\r\n?/g, "\n").length;
  }

  // Cuts text to the limit without splitting an emoji or other two-part character.
  function cutToLimit(text, limit) {
    text = String(text).replace(/\r\n?/g, "\n");
    if (text.length <= limit) return text;
    var cut = text.slice(0, limit);
    var last = cut.charCodeAt(cut.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
    return cut;
  }

  // ---- Completeness ----

  var ATTENDANCE = /^\d{1,3}(\.\d+)?$/;

  function shortLabel(field) {
    return "#" + field.number + " " + field.label;
  }

  // Checks one value. Returns null if fine, or a problem { kind: "missing" | "invalid", message }.
  function checkValue(field, value, context) {
    var type = field.type;
    if (type === "multi") {
      if (!Array.isArray(value)) return { kind: "invalid", message: "Not a list of ticks." };
      if (value.length === 0) return field.required ? { kind: "missing", message: "Not answered." } : null;
      for (var i = 0; i < value.length; i++) {
        if (field.options.indexOf(value[i]) === -1) {
          return { kind: "invalid", message: "\"" + value[i] + "\" is not one of the options." };
        }
        if (value.indexOf(value[i]) !== i) return { kind: "invalid", message: "\"" + value[i] + "\" is ticked twice." };
      }
      if (field.exclusive && value.length > 1 && value.indexOf(field.exclusive) !== -1) {
        return { kind: "invalid", message: "\"" + field.exclusive + "\" cannot be ticked with other options." };
      }
      return null;
    }

    if (typeof value !== "string") return { kind: "invalid", message: "Not a text value." };
    if (value.trim() === "") return field.required ? { kind: "missing", message: "Not answered." } : null;

    switch (type) {
      case "destination":
        if (value === F.OTHER_DESTINATION) return null;
        if ((context.destinations || []).indexOf(value) === -1) {
          return { kind: "missing", message: "\"" + value + "\" is not a school on the school list. Choose the destination again." };
        }
        return null;
      case "year":
      case "choice":
      case "rating":
        if (field.options.indexOf(value) === -1) {
          return { kind: "invalid", message: "\"" + value + "\" is not one of the options." };
        }
        return null;
      case "tickbox":
        return value === "Yes" ? null : { kind: "invalid", message: "\"" + value + "\" should be ticked or empty." };
      case "number":
        var n = Number(value);
        if (!ATTENDANCE.test(value) || !(n >= field.min && n <= field.max)) {
          return { kind: "invalid", message: "Enter a number from " + field.min + " to " + field.max + ", without a % sign." };
        }
        return null;
      case "longtext":
        if (field.limit && textLength(value) > field.limit) {
          return { kind: "invalid", message: "Longer than " + field.limit + " characters (" + textLength(value) + ")." };
        }
        return null;
      default:
        return null;
    }
  }

  // The single completeness check. Phase C uses it to decide what can be sent.
  // context.destinations: the canonical domains of schools that receive (from the school list).
  // Returns a list of problems in form order: { key, number, label, kind, message }.
  // "missing" covers unanswered required fields and a destination that is not on the list;
  // "invalid" covers values that are not allowed. Both stop a student counting as complete.
  function checkStudent(student, context) {
    var answers = answersOf(student);
    var problems = [];
    F.FIELDS.forEach(function (field) {
      var value = answers[field.key];
      var problem;
      if (isShown(field.key, answers)) {
        problem = checkValue(field, value, context || {});
      } else if (!isBlank(value)) {
        // Possible only in an edited file: hidden fields are always saved empty.
        problem = { kind: "invalid", message: "Has an answer, but this question does not apply. It is removed when you next change this student." };
      }
      if (problem) {
        problems.push({ key: field.key, number: field.number, label: shortLabel(field), kind: problem.kind, message: problem.message });
      }
    });
    return problems;
  }

  function isComplete(student, context) {
    return checkStudent(student, context).length === 0;
  }

  root.TF = root.TF || {};
  root.TF.rules = {
    isBlank: isBlank,
    emptyValue: emptyValue,
    answersOf: answersOf,
    isShown: isShown,
    visibility: visibility,
    isSectionShown: isSectionShown,
    clearHidden: clearHidden,
    toggleOption: toggleOption,
    textLength: textLength,
    cutToLimit: cutToLimit,
    checkStudent: checkStudent,
    isComplete: isComplete
  };
})(typeof window !== "undefined" ? window : globalThis);
