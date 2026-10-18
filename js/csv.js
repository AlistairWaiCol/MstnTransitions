// Builds the fictional test file, following csv-format.md (version 1) rules 1 to 6.
(function () {
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

  // Rule 4: text starting with =, +, - or @ gets a leading apostrophe.
  function spreadsheetSafe(value) {
    return /^[=+\-@]/.test(value) ? "'" + value : value;
  }

  // Rule 2: quote a field containing a comma, double quote or line break; double inner quotes.
  // Line breaks inside a cell are kept as LF; rows end with CRLF.
  function quote(value) {
    return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function cell(column, value) {
    if (value === undefined || value === null) return "";
    if (MULTI_SELECT.indexOf(column) !== -1 && Array.isArray(value)) value = value.join("; ");
    var text = String(value).replace(/\r\n?/g, "\n");
    return quote(spreadsheetSafe(text));
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

  window.TF = window.TF || {};
  window.TF.csv = { COLUMNS: COLUMNS, buildCsv: buildCsv, buildTestFile: buildTestFile, fileName: fileName, utcTimestamp: utcTimestamp };
})();
