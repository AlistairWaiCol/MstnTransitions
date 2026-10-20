// Tests for the form rules, the completeness check, the working file, the school list and the
// CSV apostrophe rule. Fictional data only.
(function () {
  "use strict";

  var F = TF.fields;
  var R = TF.rules;
  var RF = TF.rollfile;
  var S = TF.schools;
  var CSV = TF.csv;

  var CONTEXT = { destinations: ["mis.school.nz", "waicol.nz"] };

  // A complete student with nothing to report.
  function plainStudent(changes) {
    var fields = RF.emptyFields();
    Object.assign(fields, {
      student_name: "Testy McTestface",
      student_year: "Year 6",
      enrolment_completed: "Yes",
      flags: ["Nothing to report"],
      truancy_issues: "No",
      attendance_percent: "95",
      gifted_learner: "No",
      special_interests: ["N/A"],
      reading: "Proficient",
      writing: "Proficient",
      maths: "Proficient",
      kc_thinking: "3", kc_using_language: "3", kc_managing_self: "3", kc_relating_to_others: "3", kc_participating: "3",
      other_information: "A plain fictional record."
    }, changes || {});
    return { record_id: crypto.randomUUID(), destination_school_domain: "mis.school.nz", last_sent: null, fields: fields };
  }

  function problemKeys(student) {
    return R.checkStudent(student, CONTEXT).map(function (p) { return p.key; });
  }

  function shown(changes) {
    return R.visibility(R.answersOf(plainStudent(changes)));
  }

  function only(shownMap, keys) {
    return keys.map(function (k) { return shownMap[k]; });
  }

  // ---- The field list ----

  test("Field list: 36 per-student fields, numbered 1 to 36 in order", function () {
    assert.equal(F.FIELDS.length, 36);
    F.FIELDS.forEach(function (f, i) { assert.equal(f.number, i + 1, f.key); });
  });

  test("Field list: the 35 student keys are csv-format.md columns 11 to 45, in order", function () {
    assert.deepEqual(F.STUDENT_KEYS, CSV.COLUMNS.slice(10));
  });

  test("Field list: option lists match field-list.md", function () {
    assert.equal(F.byKey("flags").options.length, 11);
    assert.equal(F.byKey("special_interests").options.length, 7);
    assert.equal(F.byKey("learning_support_diagnosis").options.length, 10);
    assert.equal(F.byKey("agencies").options.length, 10);
    assert.deepEqual(F.YEARS[0], "Year 0");
    assert.deepEqual(F.YEARS[13], "Year 13");
    assert.equal(F.YEARS.length, 14);
    F.FIELDS.forEach(function (f) {
      (f.options || []).forEach(function (o) { assert.ok(o.indexOf(";") === -1, "no semicolon in " + o); });
    });
  });

  test("Field list: limits of 650 on #11, #13, #29, #30 and #36 only", function () {
    var limited = F.FIELDS.filter(function (f) { return f.limit; }).map(function (f) { return f.number; });
    assert.deepEqual(limited, [11, 13, 29, 30, 36]);
    F.FIELDS.filter(function (f) { return f.limit; }).forEach(function (f) { assert.equal(f.limit, 650); });
    [9, 18, 23].forEach(function (n) { assert.equal(F.FIELDS[n - 1].type, "longtext"); assert.ok(!F.FIELDS[n - 1].limit); });
  });

  // ---- Conditional rules ----

  test("#8 and #9 show only when #6 truancy issues is Yes", function () {
    assert.deepEqual(only(shown({ truancy_issues: "Yes" }), ["truancy_services_involved", "truancy_interventions"]), [true, true]);
    assert.deepEqual(only(shown({ truancy_issues: "No" }), ["truancy_services_involved", "truancy_interventions"]), [false, false]);
    assert.deepEqual(only(shown({ truancy_issues: "" }), ["truancy_services_involved", "truancy_interventions"]), [false, false]);
  });

  test("#11 shows only when #10 gifted learner is Yes", function () {
    assert.equal(shown({ gifted_learner: "Yes" }).gifted_details, true);
    assert.equal(shown({ gifted_learner: "No" }).gifted_details, false);
  });

  test("#13 shows when #12 has anything other than N/A", function () {
    assert.equal(shown({ special_interests: ["N/A"] }).special_interest_details, false);
    assert.equal(shown({ special_interests: [] }).special_interest_details, false);
    assert.equal(shown({ special_interests: ["Sports"] }).special_interest_details, true);
    assert.equal(shown({ special_interests: ["Other"] }).special_interest_details, true);
  });

  var SECTIONS = {
    "Learning needs": ["learning_support_diagnosis", "has_iep", "learning_contact_school"],
    "Health & Wellbeing needs": ["health_needs", "health_plan", "health_transition_info", "health_contact_school"],
    "Behaviour needs": ["behaviour_risk", "behaviour_plan", "behaviour_contact_school"],
    "Agency involvement": ["agencies"],
    "Assistive technology support": ["assistive_technology_details"]
  };

  Object.keys(SECTIONS).forEach(function (flag) {
    test("Flag \"" + flag + "\" shows its section, and only its section", function () {
      var map = shown({ flags: [flag] });
      Object.keys(SECTIONS).forEach(function (other) {
        SECTIONS[other].forEach(function (key) {
          assert.equal(map[key], other === flag, key + " with flag " + flag);
        });
      });
      assert.deepEqual(only(shown({ flags: ["ESOL"] }), SECTIONS[flag]), SECTIONS[flag].map(function () { return false; }));
    });
  });

  test("The six other flags have no section", function () {
    ["ORS funded", "Recent LSC Intervention", "ESOL", "ESOL funded", "Refugee status"].forEach(function (flag) {
      var map = shown({ flags: [flag] });
      Object.keys(SECTIONS).forEach(function (f) {
        SECTIONS[f].forEach(function (key) { assert.equal(map[key], false, key + " with " + flag); });
      });
    });
  });

  test("#18 shows only when #17 includes \"Other - please explain\", and only while Learning needs is ticked", function () {
    assert.equal(shown({ flags: ["Learning needs"], learning_support_diagnosis: ["ADHD"] }).learning_other_details, false);
    assert.equal(shown({ flags: ["Learning needs"], learning_support_diagnosis: ["Other - please explain"] }).learning_other_details, true);
    assert.equal(shown({ flags: ["ESOL"], learning_support_diagnosis: ["Other - please explain"] }).learning_other_details, false);
  });

  test("#29 shows only when #28 includes \"Other\", and only while Agency involvement is ticked", function () {
    assert.equal(shown({ flags: ["Agency involvement"], agencies: ["RTLB"] }).agencies_other, false);
    assert.equal(shown({ flags: ["Agency involvement"], agencies: ["RTLB", "Other"] }).agencies_other, true);
    assert.equal(shown({ flags: ["ESOL"], agencies: ["Other"] }).agencies_other, false);
  });

  test("\"Nothing to report\" hides all five conditional sections", function () {
    var all = Object.keys(SECTIONS);
    var flags = all.slice();
    flags = R.toggleOption("flags", flags, "Nothing to report", true);
    assert.deepEqual(flags, ["Nothing to report"]);
    var answers = R.answersOf(plainStudent({ flags: flags }));
    ["learning", "health", "behaviour", "agency", "assistive"].forEach(function (id) {
      assert.equal(R.isSectionShown(id, answers), false, id);
    });
  });

  test("Sections always shown stay shown", function () {
    var answers = R.answersOf(plainStudent());
    ["student", "flags", "attendance", "strengths", "curriculum", "competencies", "other"].forEach(function (id) {
      assert.equal(R.isSectionShown(id, answers), true, id);
    });
  });

  test("A conditional field is required only while shown", function () {
    assert.deepEqual(problemKeys(plainStudent({ truancy_issues: "No" })), []);
    assert.deepEqual(problemKeys(plainStudent({ truancy_issues: "Yes" })), ["truancy_services_involved", "truancy_interventions"]);
  });

  test("Hidden fields are cleared, the input is not changed, and the cleared values are returned", function () {
    var fields = plainStudent({ flags: ["Learning needs"], learning_support_diagnosis: ["Other - please explain"],
      learning_other_details: "Fictional details", has_iep: "Yes", learning_contact_school: "Yes" }).fields;
    var untick = Object.assign({}, fields, { flags: [] });
    var result = R.clearHidden(untick);
    assert.deepEqual(result.fields.learning_support_diagnosis, []);
    assert.equal(result.fields.learning_other_details, "");
    assert.equal(result.fields.has_iep, "");
    assert.equal(result.fields.learning_contact_school, "");
    assert.equal(result.cleared.learning_other_details, "Fictional details");
    assert.deepEqual(result.cleared.learning_support_diagnosis, ["Other - please explain"]);
    assert.equal(untick.learning_other_details, "Fictional details", "input unchanged");
  });

  test("Hidden-field clearing reaches nested fields (#18 when #17 loses Other)", function () {
    var fields = plainStudent({ flags: ["Learning needs"], learning_support_diagnosis: ["ADHD", "Other - please explain"],
      learning_other_details: "Fictional" }).fields;
    fields.learning_support_diagnosis = ["ADHD"];
    var result = R.clearHidden(fields);
    assert.equal(result.fields.learning_other_details, "");
    assert.deepEqual(result.fields.learning_support_diagnosis, ["ADHD"]);
  });

  // ---- Exclusive options ----

  [["flags", "Nothing to report", "ESOL"], ["special_interests", "N/A", "Sports"],
   ["learning_support_diagnosis", "None of the above", "ADHD"], ["agencies", "N/A", "RTLB"]].forEach(function (c) {
    var key = c[0], exclusive = c[1], other = c[2];
    test("Exclusive \"" + exclusive + "\" on " + key + " clears the others, and the others clear it", function () {
      var others = F.byKey(key).options.filter(function (o) { return o !== exclusive; }).slice(0, 3);
      assert.deepEqual(R.toggleOption(key, others, exclusive, true), [exclusive], "choosing it");
      assert.deepEqual(R.toggleOption(key, [exclusive], other, true), [other], "ticking another");
      assert.deepEqual(R.toggleOption(key, [exclusive], exclusive, false), [], "unticking it");
    });
  });

  test("Ticks keep the listed order, and unticking removes only that option", function () {
    var flags = R.toggleOption("flags", [], "ESOL", true);
    flags = R.toggleOption("flags", flags, "Learning needs", true);
    assert.deepEqual(flags, ["Learning needs", "ESOL"]);
    assert.deepEqual(R.toggleOption("flags", flags, "ESOL", false), ["Learning needs"]);
  });

  // ---- Limits ----

  test("Characters are counted as the browser counts them: macrons are one, a line break is one", function () {
    assert.equal(R.textLength("Tāne"), 4);
    assert.equal(R.textLength("a\r\nb"), 3);
    assert.equal(R.textLength("a\nb"), 3);
  });

  test("Text over the limit is cut, not refused", function () {
    var long = new Array(701).join("x");
    assert.equal(R.cutToLimit(long, 650).length, 650);
    assert.equal(R.cutToLimit("short", 650), "short");
  });

  test("Cutting never splits a two-part character", function () {
    var text = new Array(650).join("x") + "😀";
    assert.equal(text.length, 651);
    assert.equal(R.cutToLimit(text, 650), new Array(650).join("x"));
  });

  test("650 characters is fine; 651 is invalid", function () {
    var ok = new Array(651).join("ā");
    assert.equal(ok.length, 650);
    assert.deepEqual(problemKeys(plainStudent({ other_information: ok })), []);
    var problems = R.checkStudent(plainStudent({ other_information: ok + "x" }), CONTEXT);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "invalid");
  });

  test("#9, #18 and #23 have no limit", function () {
    var long = new Array(2001).join("y");
    var student = plainStudent({ truancy_issues: "Yes", truancy_services_involved: "No", truancy_interventions: long,
      flags: ["Learning needs", "Health & Wellbeing needs"], learning_support_diagnosis: ["Other - please explain"],
      learning_other_details: long, has_iep: "No", health_needs: "Yes", health_plan: "No", health_transition_info: long });
    assert.deepEqual(problemKeys(student), []);
  });

  // ---- Completeness and invalid values ----

  test("A complete student has no problems", function () {
    assert.deepEqual(R.checkStudent(plainStudent(), CONTEXT), []);
    assert.equal(R.isComplete(plainStudent(), CONTEXT), true);
  });

  test("A brand-new student is missing the 17 always-required fields, and Student Year is not required", function () {
    var student = RF.newStudent(RF.newRoll({ transitionYear: 2026, defaultStudentYear: "", teacherEmail: "t@example.school.nz", sendingSchoolDomain: "example.school.nz" }));
    var problems = R.checkStudent(student, CONTEXT);
    assert.equal(problems.length, 17);
    assert.ok(problems.every(function (p) { return p.kind === "missing"; }));
    assert.ok(problemKeys(student).indexOf("student_year") === -1);
  });

  test("Attendance: 0 to 100, decimals fine, no % sign", function () {
    ["0", "100", "71.5", "100.0", "95"].forEach(function (v) {
      assert.deepEqual(problemKeys(plainStudent({ attendance_percent: v })), [], v);
    });
    ["150", "-1", "abc", "95%", "100.1", "1e2", " 95"].forEach(function (v) {
      var p = R.checkStudent(plainStudent({ attendance_percent: v }), CONTEXT);
      assert.equal(p.length, 1, v);
      assert.equal(p[0].kind, "invalid", v);
    });
    assert.equal(R.checkStudent(plainStudent({ attendance_percent: "" }), CONTEXT)[0].kind, "missing");
  });

  test("Ratings outside 1 to 5 are invalid", function () {
    ["0", "6", "3.5", "high"].forEach(function (v) {
      var p = R.checkStudent(plainStudent({ kc_thinking: v }), CONTEXT);
      assert.equal(p.length, 1, v);
      assert.equal(p[0].kind, "invalid", v);
    });
  });

  test("A pick-one value that is not a listed option is invalid", function () {
    assert.equal(R.checkStudent(plainStudent({ enrolment_completed: "Maybe" }), CONTEXT)[0].kind, "invalid");
    assert.equal(R.checkStudent(plainStudent({ reading: "Excellent" }), CONTEXT)[0].kind, "invalid");
    assert.equal(R.checkStudent(plainStudent({ student_year: "Year 14" }), CONTEXT)[0].kind, "invalid");
  });

  test("A multi-select with an unknown option, a repeat, or an exclusive option mixed in is invalid", function () {
    assert.equal(R.checkStudent(plainStudent({ special_interests: ["Chess"] }), CONTEXT)[0].kind, "invalid");
    assert.equal(R.checkStudent(plainStudent({ special_interests: ["N/A", "Sports"] }), CONTEXT).length >= 1, true);
    assert.equal(R.checkStudent(plainStudent({ flags: ["ESOL", "ESOL"] }), CONTEXT)[0].kind, "invalid");
    assert.equal(R.checkStudent(plainStudent({ flags: ["ESOL", "Nothing to report"] }), CONTEXT)[0].kind, "invalid");
  });

  test("A contact-school tickbox is Yes or empty", function () {
    var base = { flags: ["Learning needs"], learning_support_diagnosis: ["ADHD"], has_iep: "No" };
    assert.deepEqual(problemKeys(plainStudent(Object.assign({ learning_contact_school: "" }, base))), []);
    assert.deepEqual(problemKeys(plainStudent(Object.assign({ learning_contact_school: "Yes" }, base))), []);
    assert.equal(R.checkStudent(plainStudent(Object.assign({ learning_contact_school: "No" }, base)), CONTEXT)[0].kind, "invalid");
  });

  test("A hidden field holding an answer (an edited file) is reported, not changed", function () {
    var student = plainStudent({ gifted_learner: "No", gifted_details: "Fictional" });
    var p = R.checkStudent(student, CONTEXT);
    assert.equal(p.length, 1);
    assert.equal(p[0].key, "gifted_details");
    assert.equal(p[0].kind, "invalid");
    assert.equal(student.fields.gifted_details, "Fictional");
  });

  test("Destination: a listed school or Other is fine; empty or not on the list is missing and kept", function () {
    var student = plainStudent();
    student.destination_school_domain = "other";
    assert.deepEqual(problemKeys(student), []);
    student.destination_school_domain = "";
    assert.deepEqual(problemKeys(student), ["destination_school_domain"]);
    student.destination_school_domain = "closed.school.nz";
    var p = R.checkStudent(student, CONTEXT);
    assert.equal(p[0].kind, "missing");
    assert.equal(student.destination_school_domain, "closed.school.nz");
  });

  test("Values that are not text, or not a list, are invalid", function () {
    var student = plainStudent();
    student.fields.kc_thinking = 4;
    student.fields.flags = "ESOL";
    assert.deepEqual(R.checkStudent(student, CONTEXT).map(function (p) { return p.kind; }), ["invalid", "invalid"]);
  });

  // ---- Students and the roll ----

  function sampleRoll() {
    return RF.newRoll({ transitionYear: 2026, defaultStudentYear: "Year 6", teacherEmail: "tui.testwell@masterton.school.nz", sendingSchoolDomain: "masterton.school.nz" });
  }

  test("New students get a version 4 UUID from crypto.randomUUID() and the roll's Year", function () {
    var roll = sampleRoll();
    var a = RF.newStudent(roll);
    var b = RF.newStudent(roll);
    assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.record_id), a.record_id);
    assert.ok(a.record_id !== b.record_id);
    assert.equal(a.fields.student_year, "Year 6");
    assert.equal(a.last_sent, null);
    roll.roll.default_student_year = "Year 8";
    assert.equal(a.fields.student_year, "Year 6", "changing the roll Year does not touch students already added");
    assert.equal(RF.newStudent(roll).fields.student_year, "Year 8");
  });

  test("Removing a student never sent simply deletes them", function () {
    var roll = sampleRoll();
    var s = RF.newStudent(roll);
    roll.students.push(s);
    assert.equal(RF.removeStudent(roll, s.record_id), false);
    assert.equal(roll.students.length, 0);
    assert.equal(roll.withdrawals.length, 0);
  });

  test("Removing a student already sent moves them to withdrawals", function () {
    var roll = sampleRoll();
    var s = RF.newStudent(roll);
    s.fields.student_name = "Sent Student";
    s.last_sent = { destination_school_domain: "mis.school.nz", sent_at: "2026-11-02T01:00:00Z" };
    roll.students.push(s, RF.newStudent(roll));
    assert.equal(RF.removeStudent(roll, s.record_id, new Date("2026-11-03T02:30:00Z")), true);
    assert.equal(roll.students.length, 1);
    assert.deepEqual(roll.withdrawals, [{
      record_id: s.record_id, student_name: "Sent Student",
      last_sent: { destination_school_domain: "mis.school.nz", sent_at: "2026-11-02T01:00:00Z" },
      removed_at: "2026-11-03T02:30:00Z"
    }]);
  });

  test("Opening as a new roll gives new record IDs, clears last_sent and changes the owner", function () {
    var roll = sampleRoll();
    var s = RF.newStudent(roll);
    var oldId = s.record_id;
    s.last_sent = { destination_school_domain: "mis.school.nz", sent_at: "2026-11-02T01:00:00Z" };
    roll.students.push(s);
    roll.withdrawals.push({ record_id: "x" });
    RF.takeOver(roll, "amorrison@waicol.nz", "waicol.nz");
    assert.ok(roll.students[0].record_id !== oldId);
    assert.equal(roll.students[0].last_sent, null);
    assert.equal(roll.roll.teacher_email, "amorrison@waicol.nz");
    assert.equal(roll.roll.sending_school_domain, "waicol.nz");
    assert.deepEqual(roll.withdrawals, []);
  });

  test("A roll belongs to the signed-in teacher if either address matches, ignoring case", function () {
    var roll = sampleRoll();
    assert.equal(RF.belongsTo(roll, ["Tui.Testwell@Masterton.school.nz"]), true);
    assert.equal(RF.belongsTo(roll, ["someone@else.nz", "tui.testwell@masterton.school.nz"]), true);
    assert.equal(RF.belongsTo(roll, ["someone@else.nz", undefined]), false);
  });

  // ---- The working file ----

  function savedRoll() {
    var roll = sampleRoll();
    var s = plainStudent({ student_name: "Mia O'Donnell", other_information: "- Starts with a dash\nand has a line break" });
    s.last_sent = { destination_school_domain: "mis.school.nz", sent_at: "2026-11-02T01:00:00Z" };
    roll.students.push(s, plainStudent({ flags: ["Learning needs", "ESOL"], learning_support_diagnosis: ["ADHD"], has_iep: "No" }));
    roll.withdrawals.push({ record_id: crypto.randomUUID(), student_name: "Gone", last_sent: { destination_school_domain: "waicol.nz", sent_at: "2026-11-01T00:00:00Z" }, removed_at: "2026-11-02T00:00:00Z" });
    return roll;
  }

  test("Saving then opening gives back exactly the same roll, record IDs and all", function () {
    var roll = savedRoll();
    var text = RF.serialise(roll, new Date("2026-10-20T01:14:00Z"));
    var back = RF.parse(text);
    assert.deepEqual(back, roll);
    assert.equal(RF.serialise(back, new Date("2026-10-20T01:14:00Z")), text);
  });

  test("The saved file is pretty-printed JSON with the agreed shape", function () {
    var text = RF.serialise(savedRoll(), new Date("2026-10-20T01:14:00Z"));
    var data = JSON.parse(text);
    assert.equal(data.format, "transition-roll");
    assert.equal(data.version, 1);
    assert.equal(data.saved_at, "2026-10-20T01:14:00Z");
    assert.deepEqual(Object.keys(data), ["format", "version", "saved_at", "roll", "withdrawals", "students"]);
    assert.deepEqual(Object.keys(data.students[0]), ["record_id", "destination_school_domain", "last_sent", "fields"]);
    assert.deepEqual(Object.keys(data.students[0].fields), F.STUDENT_KEYS);
    assert.ok(text.indexOf('\n  "roll": {\n    "transition_year": 2026,') !== -1, "two-space indents");
  });

  test("last_sent and withdrawals are kept untouched through open and save", function () {
    var roll = savedRoll();
    var back = RF.parse(RF.serialise(roll));
    assert.deepEqual(back.students[0].last_sent, roll.students[0].last_sent);
    assert.deepEqual(back.withdrawals, roll.withdrawals);
  });

  test("A file from a newer version is refused with a clear message", function () {
    var data = JSON.parse(RF.serialise(savedRoll()));
    data.version = 2;
    assert.throws(function () { RF.parse(JSON.stringify(data)); }, /newer version/);
  });

  test("A file that is not JSON, or not a roll, is refused in plain words", function () {
    assert.throws(function () { RF.parse("Dear diary, today we did fractions."); }, /not a saved roll/);
    assert.throws(function () { RF.parse(""); }, /empty/);
    assert.throws(function () { RF.parse('{"format":"something-else","version":1}'); }, /not a saved roll/);
    assert.throws(function () { RF.parse("[1,2,3]"); }, /not a saved roll/);
    assert.throws(function () { RF.parse(RF.serialise(savedRoll()).slice(0, 400)); }, /not a saved roll/);
  });

  test("A damaged roll file is refused, never half-loaded", function () {
    function damaged(change, pattern) {
      var data = JSON.parse(RF.serialise(savedRoll()));
      change(data);
      assert.throws(function () { RF.parse(JSON.stringify(data)); }, pattern);
    }
    damaged(function (d) { delete d.students[1].fields.maths; }, /missing the field maths/);
    damaged(function (d) { d.students[1].fields.nsn = "123"; }, /unknown field, nsn/);
    damaged(function (d) { d.students[1].record_id = "7"; }, /record ID/);
    damaged(function (d) { d.students[1].record_id = d.students[0].record_id; }, /same record ID/);
    damaged(function (d) { d.students[0].fields.flags = "ESOL"; }, /flags/);
    damaged(function (d) { d.students[0].fields.kc_thinking = 3; }, /kc_thinking/);
    damaged(function (d) { d.roll.transition_year = "next year"; }, /transition year/);
    damaged(function (d) { delete d.withdrawals; }, /removed students/);
    damaged(function (d) { d.students = {}; }, /list of students/);
    damaged(function (d) { d.students[0].last_sent = "yesterday"; }, /sent record/);
  });

  test("A version 1 file with values that are not allowed opens, keeps them, and reports them", function () {
    var data = JSON.parse(RF.serialise(savedRoll()));
    data.students[0].fields.attendance_percent = "150";
    var back = RF.parse(JSON.stringify(data));
    assert.equal(back.students[0].fields.attendance_percent, "150");
    assert.equal(R.checkStudent(back.students[0], CONTEXT)[0].kind, "invalid");
  });

  test("The suggested file name uses New Zealand time", function () {
    assert.equal(RF.fileName(sampleRoll(), new Date("2026-10-20T01:14:00Z")), "transition-roll_2026_20261020-1414.json");
    assert.equal(RF.fileName(sampleRoll(), new Date("2026-06-30T13:05:00Z")), "transition-roll_2026_20260701-0105.json");
  });

  // ---- CSV and the apostrophe rule (csv-format.md rule 4) ----

  test("Apostrophe rule: values that need protecting", function () {
    ["=Needs", "+1", "-dash", "@home", "\tTab", "\rCR", "'=x", "''=x", "'-x"].forEach(function (v) {
      assert.equal(CSV.needsProtecting(v), true, JSON.stringify(v));
    });
    ["hello", "'hello", "", "Kia ora = hello", "''hi"].forEach(function (v) {
      assert.equal(CSV.needsProtecting(v), false, JSON.stringify(v));
    });
  });

  test("Apostrophe rule: writing adds one, reading strips exactly one", function () {
    assert.equal(CSV.protect("=Needs"), "'=Needs");
    assert.equal(CSV.protect("'=Needs"), "''=Needs");
    assert.equal(CSV.protect("'hello"), "'hello");
    assert.equal(CSV.unprotect("'=Needs"), "=Needs");
    assert.equal(CSV.unprotect("''=Needs"), "'=Needs");
    assert.equal(CSV.unprotect("'hello"), "'hello");
    assert.equal(CSV.unprotect("hello"), "hello");
  });

  test("Apostrophe rule: every awkward value survives writing and reading", function () {
    ["=Needs", "'=Needs", "''=x", "'hello", "- line one\nline two", "+ plus", "@home", "\tTab first", "plain, with \"quotes\""].forEach(function (v) {
      assert.equal(CSV.unprotect(CSV.protect(v)), v, JSON.stringify(v));
    });
  });

  test("CSV writer and reader round-trip quoting, line breaks, macrons and multi-selects", function () {
    var row = { format_version: 1, record_id: "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90", student_name: "Tāne Whitcombe",
      flags: ["Learning needs", "ESOL"], other_information: "Has a comma, \"quotes\"\r\nand a line break",
      truancy_interventions: "=formula", gifted_details: "''=two" };
    var text = CSV.buildCsv([row]);
    assert.ok(/\r\n$/.test(text), "rows end with CRLF");
    var back = CSV.readRecords(text).records[0];
    assert.equal(back.student_name, "Tāne Whitcombe");
    assert.equal(back.flags, "Learning needs; ESOL");
    assert.equal(back.other_information, "Has a comma, \"quotes\"\nand a line break");
    assert.equal(back.truancy_interventions, "=formula");
    assert.equal(back.gifted_details, "''=two");
    assert.equal(back.maths, "");
  });

  test("CSV reader: strips the byte-order mark, accepts CRLF or LF, refuses an unclosed quote", function () {
    var t = CSV.readRecords("﻿a,b\r\n1,\"x\ny\"\n2,3");
    assert.deepEqual(t.columns, ["a", "b"]);
    assert.deepEqual(t.records, [{ a: "1", b: "x\ny" }, { a: "2", b: "3" }]);
    assert.throws(function () { CSV.parse('a,"never closed\n1,2'); }, /never closed/);
    assert.throws(function () { CSV.readRecords("a,b\n1,2,3"); }, /3 values/);
  });

  // ---- The school list and identity ----

  var SAMPLE_LIST = "﻿school_name,email_domains,sends,receives\r\n" +
    "Wairarapa College,waicol.nz;waicol.school.nz,Yes,Yes\r\n" +
    "Tīnui School,tinui.school.nz,yes,YES\r\n" +
    "Ōpaki School,opaki.school.nz,Yes,Yes\r\n" +
    "Masterton Intermediate,mis.school.nz,Yes,Yes\r\n" +
    "Sender Only School,sender.school.nz,Yes,no\r\n";

  test("School list: reads the byte-order mark, macrons, several domains, and yes/no in any case", function () {
    var list = S.parseSchoolList(SAMPLE_LIST);
    assert.equal(list.length, 5);
    assert.equal(list[0].name, "Wairarapa College");
    assert.deepEqual(list[0].domains, ["waicol.nz", "waicol.school.nz"]);
    assert.equal(list[0].canonical, "waicol.nz");
    assert.equal(list[1].name, "Tīnui School");
    assert.equal(list[1].receives, true);
    assert.equal(list[4].receives, false);
  });

  test("School list: destinations are receiving schools sorted with macrons under their letter", function () {
    var names = S.destinations(S.parseSchoolList(SAMPLE_LIST)).map(function (s) { return s.name; });
    assert.deepEqual(names, ["Masterton Intermediate", "Ōpaki School", "Tīnui School", "Wairarapa College"]);
  });

  test("School list: a file without the needed columns is refused", function () {
    assert.throws(function () { S.parseSchoolList("name,domain\nA,a.nz\n"); }, /no school_name column/);
  });

  test("The repo's data/schools.csv reads correctly and has no address columns", async function () {
    var response;
    try { response = await fetch("../data/schools.csv", { cache: "no-store" }); } catch (e) { response = null; }
    if (!response || !response.ok) skip("Needs the page opened from the web address (or a local web server), not as a file.");
    var text = await response.text();
    var table = CSV.readRecords(text);
    assert.deepEqual(table.columns, ["school_name", "email_domains", "sends", "receives"]);
    assert.ok(text.indexOf("@") === -1, "no email addresses in the repo copy");
    var list = S.parseSchoolList(text);
    assert.ok(list.length > 0);
    assert.ok(list.some(function (s) { return s.name === "Ōpaki School"; }), "macrons read as UTF-8");
  });

  test("Personal accounts are refused; school accounts are not", function () {
    assert.ok(S.refusalReason({ provider: "Google", email: "someone@gmail.com", emailVerified: true, hostedDomain: "" }));
    assert.ok(/hd/.test(S.refusalReason({ provider: "Google", email: "someone@example.school.nz", emailVerified: true, hostedDomain: "" })));
    assert.ok(/not verified/.test(S.refusalReason({ provider: "Google", email: "t@waicol.school.nz", emailVerified: false, hostedDomain: "waicol.school.nz" })));
    assert.ok(S.refusalReason({ provider: "Google", email: "someone@gmail.com", emailVerified: true, hostedDomain: "gmail.com" }), "domain list backstop");
    assert.equal(S.refusalReason({ provider: "Google", email: "t@waicol.school.nz", emailVerified: true, hostedDomain: "waicol.school.nz" }), null);
    assert.ok(S.refusalReason({ provider: "Microsoft", email: "someone@outlook.com", tenantId: "9188040d-6c67-4c5b-b112-36a304b66dad", isConsumerTenant: true }));
    assert.ok(S.refusalReason({ provider: "Microsoft", email: "t@xtra.co.nz", userPrincipalName: "t@school.onmicrosoft.com", tenantId: "abc", isConsumerTenant: false }));
    assert.equal(S.refusalReason({ provider: "Microsoft", email: "amorrison@waicol.nz", userPrincipalName: "amorrison@waicol.nz", tenantId: "abc", isConsumerTenant: false }), null);
  });

  test("Matching a teacher to a school: either domain, the sign-in name wins, unlisted is fine", function () {
    var list = S.parseSchoolList(SAMPLE_LIST);
    var r = S.identifySchool(list, null, "teacher@waicol.school.nz");
    assert.equal(r.school.name, "Wairarapa College");
    assert.equal(r.sendingDomain, "waicol.nz", "second domain maps to the canonical one");
    r = S.identifySchool(list, "t@tinui.school.nz", "t@mis.school.nz");
    assert.equal(r.school.name, "Tīnui School");
    assert.equal(r.conflict, true);
    r = S.identifySchool(list, "t@school.onmicrosoft.com", "t@opaki.school.nz");
    assert.equal(r.school.name, "Ōpaki School");
    assert.equal(r.conflict, false);
    r = S.identifySchool(list, null, "Teacher@Faraway.School.NZ");
    assert.equal(r.listed, false);
    assert.equal(r.sendingDomain, "faraway.school.nz");
  });

  // ---- The fictional test rolls ----

  function rollTest(file, expectedCount) {
    test("Test roll " + file + ": opens, and every student is complete", async function () {
      var response;
      try { response = await fetch("../test-data/" + file, { cache: "no-store" }); } catch (e) { response = null; }
      if (!response || !response.ok) skip("Needs the page opened from the web address (or a local web server), not as a file.");
      var listResponse = await fetch("../data/schools.csv", { cache: "no-store" });
      var schools = S.parseSchoolList(await listResponse.text());
      var context = { destinations: S.destinations(schools).map(function (s) { return s.canonical; }) };
      var text = await response.text();
      var roll = RF.parse(text);
      assert.equal(roll.students.length, expectedCount);
      var report = [];
      roll.students.forEach(function (s) {
        R.checkStudent(s, context).forEach(function (p) {
          report.push(s.fields.student_name + ": " + p.label + ": " + p.message);
        });
      });
      if (report.length) throw new Error(report.join("\n"));
      assert.equal(RF.serialise(roll, new Date(JSON.parse(text).saved_at)), JSON.stringify(JSON.parse(text), null, 2) + "\n", "saves back unchanged");
    });
  }
  rollTest("test-roll.json", 25);
  rollTest("test-roll-other-teacher.json", 5);
})();
