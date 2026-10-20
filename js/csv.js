// Reads and writes CSV to csv-format.md (version 1), and builds the Phase A fictional test file.
// It has no page dependencies, so the rules test page can load it on its own.
(function (root) {
  "use strict";

  var COLUMNS = [
    // Identifying columns 1 to 10
    "format_version", "record_id", "record_status", "transition_year", "sent_at",
    "sending_school_domain", "teacher_name", "teacher_email", "destination_school_domain",
    "privacy_acknowledged",
    // Student columns 11 to 45, in form order
    "student_name", "student_year", "enrolment_completed", "flags", "truancy_issues",
    "attendance_percent", "truancy_services_involved", "truancy_interventions", "gifted_learner",
    "gifted_details", "special_interests", "special_interest_details", "reading", "writing", "maths",
    "learning_support_diagnosis", "learning_other_details", "has_iep", "learning_contact_school",
    "health_needs", "health_plan", "health_transition_info", "health_contact_school",
    "behaviour_risk", "behaviour_plan", "behaviour_contact_school", "agencies", "agencies_other",
    "assistive_technology_details", "kc_thinking", "kc_using_language", "kc_managing_self",
    "kc_relating_to_others", "kc_participating", "other_information"
  ];

  var MULTI_SELECT = ["flags", "special_interests", "learning_support_diagnosis", "agencies"];
  var ROW_END = "\r\n";
  var BOM = "﻿";

  // ---- Rule 4: spreadsheet safety ----

  // A value needs protecting if it starts with zero or more apostrophes followed by
  // =, +, -, @, a tab or a carriage return.
  function needsProtecting(value) {
    return /^'*[=+\-@\t\r]/.test(value);
  }

  // Writing adds one apostrophe to a value that needs protecting.
  function protect(value) {
    return needsProtecting(value) ? "'" + value : value;
  }

  // Reading strips exactly one apostrophe, and only from a value that needs protecting.
  // So "'=Needs" reads as "=Needs", "''=x" as "'=x", and "'hello" is left alone.
  function unprotect(value) {
    return value.charAt(0) === "'" && needsProtecting(value) ? value.slice(1) : value;
  }

  // ---- Writing ----

  // Rule 2: quote a field containing a comma, double quote or line break; double inner quotes.
  function quote(value) {
    return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function cell(column, value) {
    if (value === undefined || value === null) return "";
    if (MULTI_SELECT.indexOf(column) !== -1 && Array.isArray(value)) value = value.join("; ");
    // Rule 8: a line break inside a cell is a single LF. Done before rule 4, so the
    // protected value is exactly what a reader sees.
    return quote(protect(String(value).replace(/\r\n?/g, "\n")));
  }

  function buildCsv(rows) {
    var lines = [COLUMNS.join(",")];
    rows.forEach(function (row) {
      Object.keys(row).forEach(function (key) {
        if (COLUMNS.indexOf(key) === -1) throw new Error("Unknown CSV column: " + key);
      });
      lines.push(COLUMNS.map(function (column) { return cell(column, row[column]); }).join(","));
    });
    return lines.join(ROW_END) + ROW_END;
  }

  // Rule 1: UTF-8 with a byte-order mark.
  function toBytes(csvText) {
    var body = new TextEncoder().encode(csvText);
    var bytes = new Uint8Array(body.length + 3);
    bytes.set([0xef, 0xbb, 0xbf], 0);
    bytes.set(body, 3);
    return bytes;
  }

  // ---- Reading ----

  // Splits CSV text into rows of raw cells: a proper parser, never splitting on commas or lines.
  // Strips a byte-order mark, accepts CRLF or LF anywhere, keeps line breaks inside quoted cells
  // and undoubles quotes. Throws on a quote that is never closed, or stray text after a closing
  // quote, rather than guessing.
  function parse(text) {
    text = String(text);
    if (text.charAt(0) === BOM) text = text.slice(1);
    var rows = [];
    var row = [];
    var value = "";
    var i = 0;
    var line = 1;
    var atCellStart = true;

    function endCell() { row.push(value); value = ""; atCellStart = true; }
    function endRow() { endCell(); rows.push(row); row = []; }

    while (i < text.length) {
      var ch = text.charAt(i);
      if (atCellStart && ch === '"') {
        // A quoted cell runs to the next quote that is not doubled.
        var startLine = line;
        i++;
        for (;;) {
          if (i >= text.length) throw new Error("A quoted value starting on line " + startLine + " is never closed.");
          var c = text.charAt(i);
          if (c === '"') {
            if (text.charAt(i + 1) === '"') { value += '"'; i += 2; continue; }
            i++;
            break;
          }
          if (c === "\r") {
            value += "\n";
            i += text.charAt(i + 1) === "\n" ? 2 : 1;
            line++;
            continue;
          }
          if (c === "\n") line++;
          value += c;
          i++;
        }
        var next = text.charAt(i);
        if (i < text.length && next !== "," && next !== "\r" && next !== "\n") {
          throw new Error("Unexpected text after a closing quote on line " + line + ".");
        }
        atCellStart = false;
        continue;
      }
      if (ch === ",") { endCell(); i++; continue; }
      if (ch === "\r" || ch === "\n") {
        endRow();
        i += ch === "\r" && text.charAt(i + 1) === "\n" ? 2 : 1;
        line++;
        continue;
      }
      value += ch;
      atCellStart = false;
      i++;
    }
    // The last row, unless the text ended with a line break.
    if (!atCellStart || row.length > 0) endRow();
    return rows;
  }

  // Reads CSV text with a header row into objects keyed by column name. Cell values are trimmed
  // of the rule 4 apostrophe, and blank lines are skipped. A row with the wrong number of cells
  // is an error, not a guess.
  function readRecords(text) {
    var rows = parse(text).filter(function (cells) {
      return !(cells.length === 1 && cells[0] === "");
    });
    if (rows.length === 0) throw new Error("The file is empty.");
    var header = rows[0].map(function (name) { return name.trim(); });
    return {
      columns: header,
      records: rows.slice(1).map(function (cells, index) {
        if (cells.length !== header.length) {
          throw new Error("Row " + (index + 2) + " has " + cells.length + " values; the header has " + header.length + ".");
        }
        var record = {};
        header.forEach(function (name, n) { record[name] = unprotect(cells[n]); });
        return record;
      })
    };
  }

  // ---- Phase A test file ----

  // Rule 6: UTC in ISO 8601 to the second, for example 2026-10-16T02:30:00Z.
  function utcTimestamp(date) {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  // transition_<sending domain>_to_<destination domain>_<YYYYMMDD-HHMM>.csv, time in UTC.
  function fileName(sendingDomain, destinationDomain, date) {
    var iso = date.toISOString();
    var stamp = iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) + "-" + iso.slice(11, 13) + iso.slice(14, 16);
    return "transition_" + sendingDomain + "_to_" + destinationDomain + "_" + stamp + ".csv";
  }

  function currentNzYear(date) {
    return new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric" }).format(date);
  }

  // Three fictional students. Hidden fields are left empty, as the form's rules require.
  function fictionalStudents() {
    return [
      {
        student_name: "Māia Tāne-O'Brien",
        student_year: "Year 8",
        enrolment_completed: "Yes",
        flags: ["Learning needs", "ESOL"],
        truancy_issues: "No",
        attendance_percent: 94,
        gifted_learner: "No",
        special_interests: ["Cultural", "Sports"],
        special_interest_details: "Kapa haka leader, and plays netball for the school.",
        reading: "Developing",
        writing: "Emerging",
        maths: "Consolidating",
        learning_support_diagnosis: ["Dyslexia", "Other - please explain"],
        learning_other_details: "Reading support with the RTLB in Terms 1 and 2.",
        has_iep: "Yes",
        learning_contact_school: "Yes",
        kc_thinking: 3, kc_using_language: 2, kc_managing_self: 4, kc_relating_to_others: 5, kc_participating: 4,
        other_information: 'Loves the "Matariki" projects, and reads to the juniors.\nWorks best near the front of the class.'
      },
      {
        student_name: "Ruby Ngata",
        student_year: "Year 8",
        enrolment_completed: "Unknown",
        flags: ["Nothing to report"],
        truancy_issues: "No",
        attendance_percent: 88,
        gifted_learner: "Yes",
        gifted_details: "Working well beyond expected level in maths.",
        special_interests: ["N/A"],
        reading: "Proficient",
        writing: "Proficient",
        maths: "Exceeding",
        kc_thinking: 5, kc_using_language: 4, kc_managing_self: 4, kc_relating_to_others: 3, kc_participating: 4,
        other_information: "- Settles quickly after breaks\n- Enjoys group work"
      },
      {
        student_name: "Sione Fifita",
        student_year: "Year 8",
        enrolment_completed: "No",
        flags: ["Health & Wellbeing needs", "Agency involvement"],
        truancy_issues: "Yes",
        attendance_percent: 71,
        truancy_services_involved: "No",
        truancy_interventions: "Weekly check-ins with whānau, and a morning breakfast club place.",
        gifted_learner: "No",
        special_interests: ["Arts"],
        special_interest_details: "Draws comics; ask about the class mural.",
        reading: "Consolidating",
        writing: "Developing",
        maths: "Developing",
        health_needs: "Yes",
        health_plan: "Yes",
        health_transition_info: "Asthma. Inhaler kept in the office.",
        health_contact_school: "Yes",
        agencies: ["RTLB", "Other"],
        agencies_other: "Local mentoring programme",
        kc_thinking: 3, kc_using_language: 3, kc_managing_self: 2, kc_relating_to_others: 4, kc_participating: 3,
        other_information: "=Needs a quiet space for tests"
      }
    ];
  }

  // Builds the test file for a signed-in teacher. The teacher's domain is used for both ends.
  function buildTestFile(teacher) {
    var now = new Date();
    var identifying = {
      format_version: 1,
      record_status: "sent",
      transition_year: currentNzYear(now),
      sent_at: utcTimestamp(now),
      sending_school_domain: teacher.domain,
      teacher_name: teacher.name,
      teacher_email: teacher.email,
      destination_school_domain: teacher.domain,
      privacy_acknowledged: "Yes"
    };
    var rows = fictionalStudents().map(function (student) {
      return Object.assign({ record_id: crypto.randomUUID() }, identifying, student);
    });
    var text = buildCsv(rows);
    return {
      name: fileName(teacher.domain, teacher.domain, now),
      text: text,
      bytes: toBytes(text),
      rowCount: rows.length
    };
  }

  root.TF = root.TF || {};
  root.TF.csv = {
    COLUMNS: COLUMNS,
    MULTI_SELECT: MULTI_SELECT,
    needsProtecting: needsProtecting,
    protect: protect,
    unprotect: unprotect,
    buildCsv: buildCsv,
    toBytes: toBytes,
    parse: parse,
    readRecords: readRecords,
    buildTestFile: buildTestFile,
    fileName: fileName,
    utcTimestamp: utcTimestamp
  };
})(typeof window !== "undefined" ? window : globalThis);
