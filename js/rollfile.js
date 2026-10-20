// The working file: a teacher's roll saved as JSON (format "transition-roll", version 1).
// Creating a roll and students, checking and reading a file, writing it, removing students
// (with withdrawals) and taking over another teacher's roll. No page dependencies.
(function (root) {
  "use strict";

  var F = root.TF.fields;
  var FORMAT = "transition-roll";
  var VERSION = 1;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // UTC in ISO 8601 to the second.
  function utcNow(date) {
    return (date || new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  // Never a counter or Math.random(): see csv-format.md, Record IDs.
  function newRecordId() {
    return root.crypto.randomUUID();
  }

  function emptyFields() {
    var fields = {};
    F.STUDENT_KEYS.forEach(function (key) { fields[key] = F.isMulti(key) ? [] : ""; });
    return fields;
  }

  function newRoll(settings) {
    return {
      roll: {
        transition_year: settings.transitionYear,
        default_student_year: settings.defaultStudentYear || "",
        teacher_email: settings.teacherEmail,
        sending_school_domain: settings.sendingSchoolDomain
      },
      withdrawals: [],
      students: []
    };
  }

  // A new student gets its record ID the moment it is added, and the roll's Year.
  function newStudent(roll) {
    var fields = emptyFields();
    fields.student_year = roll.roll.default_student_year || "";
    return { record_id: newRecordId(), destination_school_domain: "", last_sent: null, fields: fields };
  }

  // Removes a student. One never sent is simply deleted. One already sent (last_sent set) moves to
  // the withdrawals list, so Phase C can tell the original school to remove the record.
  // Returns true if a withdrawal was recorded.
  function removeStudent(roll, recordId, date) {
    var index = roll.students.findIndex(function (s) { return s.record_id === recordId; });
    if (index === -1) return false;
    var student = roll.students[index];
    roll.students.splice(index, 1);
    if (student.last_sent === null || student.last_sent === undefined) return false;
    roll.withdrawals.push({
      record_id: student.record_id,
      student_name: student.fields.student_name,
      last_sent: student.last_sent,
      removed_at: utcNow(date)
    });
    return true;
  }

  // "Open as a new roll for me": every student gets a new record ID, nothing counts as sent,
  // and the roll belongs to the signed-in teacher. The other teacher's withdrawals are theirs to
  // send, not this teacher's, so they are dropped too.
  function takeOver(roll, teacherEmail, sendingSchoolDomain) {
    roll.roll.teacher_email = teacherEmail;
    roll.roll.sending_school_domain = sendingSchoolDomain;
    roll.withdrawals = [];
    roll.students.forEach(function (s) {
      s.record_id = newRecordId();
      s.last_sent = null;
    });
    return roll;
  }

  // True if the file's teacher is the signed-in teacher: its teacher_email matches, ignoring case,
  // either the account's mail address or its sign-in name.
  function belongsTo(roll, addresses) {
    var owner = String(roll.roll.teacher_email || "").trim().toLowerCase();
    return addresses.some(function (a) { return a && String(a).trim().toLowerCase() === owner; });
  }

  // ---- Reading ----

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function fail(message) {
    var error = new Error(message);
    error.rollFile = true;
    throw error;
  }

  // Checks a whole file and returns the roll, or throws with a plain message saying what is wrong.
  // Nothing is half-loaded: either every part is understood, or the file is refused.
  function parse(text) {
    if (typeof text !== "string" || text.trim() === "") fail("The file is empty.");
    if (text.charAt(0) === "﻿") text = text.slice(1);
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      fail("This is not a saved roll. It could not be read as a roll file at all, so it may be a different kind of file or it may be damaged.");
    }
    if (!isPlainObject(data) || data.format !== FORMAT) {
      fail("This is not a saved roll from the transition form.");
    }
    if (typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1) {
      fail("The roll file has no proper version number, so it may be damaged.");
    }
    if (data.version > VERSION) {
      fail("This roll was saved by a newer version of the transition form (file version " + data.version +
        "). This page understands version " + VERSION + ". Reload the page to get the latest version, then try again.");
    }

    var r = data.roll;
    if (!isPlainObject(r)) fail("The roll file is damaged: the roll settings are missing.");
    var year = r.transition_year;
    if (!(Number.isInteger(year) && year >= 2000 && year <= 2999)) {
      fail("The roll file is damaged: the transition year is missing or not a four-digit year.");
    }
    if (typeof r.default_student_year !== "string" || (r.default_student_year && F.YEARS.indexOf(r.default_student_year) === -1)) {
      fail("The roll file is damaged: the roll's Year is not one of Year 0 to Year 13.");
    }
    if (typeof r.teacher_email !== "string" || r.teacher_email.indexOf("@") === -1) {
      fail("The roll file is damaged: the teacher's email address is missing.");
    }
    if (typeof r.sending_school_domain !== "string" || !r.sending_school_domain) {
      fail("The roll file is damaged: the sending school is missing.");
    }

    if (!Array.isArray(data.withdrawals) || !data.withdrawals.every(isPlainObject)) {
      fail("The roll file is damaged: the list of removed students is not readable.");
    }
    if (!Array.isArray(data.students)) fail("The roll file is damaged: the list of students is missing.");

    var seen = {};
    var students = data.students.map(function (s, index) {
      var where = "student " + (index + 1);
      if (!isPlainObject(s)) fail("The roll file is damaged: " + where + " is not readable.");
      if (isPlainObject(s.fields) && typeof s.fields.student_name === "string" && s.fields.student_name.trim()) {
        where += " (" + s.fields.student_name.trim() + ")";
      }
      if (typeof s.record_id !== "string" || !UUID.test(s.record_id)) {
        fail("The roll file is damaged: " + where + " has no proper record ID.");
      }
      var id = s.record_id.toLowerCase();
      if (seen[id]) fail("The roll file is damaged: " + where + " has the same record ID as another student.");
      seen[id] = true;
      if (typeof s.destination_school_domain !== "string") {
        fail("The roll file is damaged: " + where + " has no destination value.");
      }
      if (!(s.last_sent === null || isPlainObject(s.last_sent))) {
        fail("The roll file is damaged: " + where + " has an unreadable sent record.");
      }
      if (!isPlainObject(s.fields)) fail("The roll file is damaged: " + where + " has no answers.");
      Object.keys(s.fields).forEach(function (key) {
        if (F.STUDENT_KEYS.indexOf(key) === -1) fail("The roll file is damaged: " + where + " has an unknown field, " + key + ".");
      });
      var fields = {};
      F.STUDENT_KEYS.forEach(function (key) {
        var value = s.fields[key];
        if (!(key in s.fields)) fail("The roll file is damaged: " + where + " is missing the field " + key + ".");
        if (F.isMulti(key)) {
          if (!Array.isArray(value) || !value.every(function (v) { return typeof v === "string"; })) {
            fail("The roll file is damaged: " + where + " has an unreadable " + key + " (it should be a list).");
          }
          fields[key] = value.slice();
        } else {
          if (typeof value !== "string") {
            fail("The roll file is damaged: " + where + " has an unreadable " + key + " (it should be text).");
          }
          fields[key] = value;
        }
      });
      // Values are kept exactly as saved. Anything not allowed shows in the completeness check.
      return {
        record_id: s.record_id,
        destination_school_domain: s.destination_school_domain,
        last_sent: s.last_sent,
        fields: fields
      };
    });

    return {
      roll: {
        transition_year: year,
        default_student_year: r.default_student_year,
        teacher_email: r.teacher_email,
        sending_school_domain: r.sending_school_domain
      },
      // Kept untouched for Phase C.
      withdrawals: data.withdrawals,
      students: students
    };
  }

  // ---- Writing ----

  // Pretty-printed JSON with two-space indents, readable in Notepad. Fields are written in
  // csv-format.md column order.
  function serialise(roll, date) {
    var out = {
      format: FORMAT,
      version: VERSION,
      saved_at: utcNow(date),
      roll: {
        transition_year: roll.roll.transition_year,
        default_student_year: roll.roll.default_student_year,
        teacher_email: roll.roll.teacher_email,
        sending_school_domain: roll.roll.sending_school_domain
      },
      withdrawals: roll.withdrawals,
      students: roll.students.map(function (s) {
        var fields = {};
        F.STUDENT_KEYS.forEach(function (key) { fields[key] = s.fields[key]; });
        return {
          record_id: s.record_id,
          destination_school_domain: s.destination_school_domain,
          last_sent: s.last_sent,
          fields: fields
        };
      })
    };
    return JSON.stringify(out, null, 2) + "\n";
  }

  // transition-roll_<transition year>_<YYYYMMDD-HHMM>.json, in New Zealand time.
  function fileName(roll, date) {
    var parts = {};
    new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date || new Date()).forEach(function (p) { parts[p.type] = p.value; });
    return "transition-roll_" + roll.roll.transition_year + "_" + parts.year + parts.month + parts.day +
      "-" + parts.hour + parts.minute + ".json";
  }

  root.TF = root.TF || {};
  root.TF.rollfile = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    newRoll: newRoll,
    newStudent: newStudent,
    emptyFields: emptyFields,
    removeStudent: removeStudent,
    takeOver: takeOver,
    belongsTo: belongsTo,
    parse: parse,
    serialise: serialise,
    fileName: fileName
  };
})(typeof window !== "undefined" ? window : globalThis);
