// The Phase B page: sign-in, the roll, the student form, and saving and opening the working file.
// Roll data lives in page memory and in the file the teacher saves. Nothing about students goes
// into browser storage of any kind, and nothing is sent.
(function () {
  "use strict";

  if (window.TF_IS_AUTH_POPUP) return;

  var VERSION = "2026-10-20b";
  var F = TF.fields;
  var R = TF.rules;
  var RF = TF.rollfile;
  var S = TF.schools;
  var SAVE = TF.savefile;
  var AUTOSAVE_DELAY = 800;

  var config = window.TF_CONFIG || {};
  var providers = { Microsoft: TF.microsoft, Google: TF.google };

  var state = {
    account: null,       // what the provider returned, plus canSend
    provider: null,
    teacherName: "",
    identity: null,      // from TF.schools.identifySchool
    schools: [],
    destinations: [],    // receiving schools, sorted
    schoolListError: null,
    roll: null,
    handle: null,        // File System Access handle, memory only
    fileName: "",
    permissionNeeded: false,
    canAdd: false,       // students may be added only once the roll is saved to a file
    changeCount: 0,
    savedCount: 0,
    dirty: false,
    saving: false,
    saveError: "",
    lastSavedAt: null,
    lastCopyAt: null,
    openedAt: null,
    autosaveTimer: null,
    editingId: null,
    stash: {}            // answers cleared by hiding, kept until the student form closes
  };

  var el = function (id) { return document.getElementById(id); };

  // ---- Small helpers ----

  function nzYear() {
    return Number(new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric" }).format(new Date()));
  }

  function clockTime(date) {
    return new Intl.DateTimeFormat("en-NZ", { hour: "numeric", minute: "2-digit", hour12: true }).format(date);
  }

  function context() {
    return { destinations: state.destinations.map(function (s) { return s.canonical; }) };
  }

  function studentName(student) {
    var name = String(student.fields.student_name || "").trim();
    return name || "(no name yet)";
  }

  function destinationText(domain) {
    if (!domain) return "Not chosen yet";
    if (domain === F.OTHER_DESTINATION) return F.OTHER_DESTINATION_LABEL;
    var school = S.findByDomain(state.schools, domain);
    return school && school.receives && school.canonical === domain ? school.name : domain + " (not on the school list)";
  }

  function findStudent(id) {
    return state.roll ? state.roll.students.find(function (s) { return s.record_id === id; }) : null;
  }

  function fillYearSelect(select) {
    select.replaceChildren();
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Choose a year";
    select.appendChild(blank);
    F.YEARS.forEach(function (y) {
      var option = document.createElement("option");
      option.value = y;
      option.textContent = y;
      select.appendChild(option);
    });
  }

  function readYear(input) {
    var text = String(input.value).trim();
    return /^\d{4}$/.test(text) && Number(text) >= 2000 && Number(text) <= 2999 ? Number(text) : null;
  }

  // ---- Views ----

  var VIEWS = ["signin", "setup", "roll", "student"];

  function showView(name, focusTarget) {
    VIEWS.forEach(function (v) { el(v + "-view").hidden = v !== name; });
    el("teacher-panel").hidden = !(state.account && (name === "setup" || name === "roll"));
    var target = focusTarget || el(name + "-heading");
    window.scrollTo(0, 0);
    if (target) target.focus();
  }

  function showBanner(text) {
    el("banner").textContent = text;
    el("banner").hidden = !text;
  }

  // ---- Dialogs ----

  // Shows a modal dialog and resolves with the chosen button's value, or "cancel" on Escape.
  function ask(heading, paragraphs, buttons) {
    var dialog = el("dialog");
    el("dialog-heading").textContent = heading;
    var body = el("dialog-body");
    body.replaceChildren();
    paragraphs.forEach(function (text) {
      var p = document.createElement("p");
      p.textContent = text;
      body.appendChild(p);
    });
    var row = el("dialog-buttons");
    row.replaceChildren();
    return new Promise(function (resolve) {
      function finish(value) {
        dialog.removeEventListener("cancel", onCancel);
        if (dialog.open) dialog.close();
        resolve(value);
      }
      function onCancel(event) {
        event.preventDefault();
        finish("cancel");
      }
      buttons.forEach(function (b, i) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = b.label;
        if (!b.primary) button.className = "secondary";
        button.addEventListener("click", function () { finish(b.value); });
        row.appendChild(button);
        if (i === 0) setTimeout(function () { button.focus(); }, 0);
      });
      dialog.addEventListener("cancel", onCancel);
      dialog.showModal();
    });
  }

  function tell(heading, paragraphs) {
    return ask(heading, paragraphs, [{ label: "OK", value: "ok", primary: true }]);
  }

  // ---- Saving ----

  function updateSaveStatus() {
    var text;
    var name = state.fileName;
    if (state.saveError) {
      text = state.saveError;
    } else if (state.dirty) {
      if (state.handle && !state.permissionNeeded) text = "Saving…";
      else if (state.handle) text = "Unsaved changes. Choose Continue saving to this file to save them to " + name + ".";
      else if (SAVE.supportsHandles) text = "Unsaved changes. Choose Save to pick where to keep this roll.";
      else text = "Unsaved changes. Choose Save a copy to download the roll.";
    } else if (state.lastSavedAt && state.handle) {
      text = "Saved at " + clockTime(state.lastSavedAt) + " to " + name + ".";
    } else if (state.lastCopyAt) {
      text = "Copy downloaded at " + clockTime(state.lastCopyAt) + ". Look in your Downloads folder.";
    } else if (state.openedAt && state.handle) {
      text = state.permissionNeeded
        ? "Opened " + name + ". Choose Continue saving to this file so your changes are saved to it."
        : "Opened " + name + ". Changes are saved to this file as you go.";
    } else if (state.openedAt) {
      text = "Opened " + name + ". No changes yet.";
    } else {
      text = SAVE.supportsHandles ? "Not saved yet. Choose Save to pick where to keep this roll." : "Not saved yet.";
    }
    el("save-status").textContent = text;
    el("save-status").classList.toggle("unsaved", state.dirty || Boolean(state.saveError));
    el("student-save-status").textContent = text;
    el("save").hidden = !SAVE.supportsHandles;
    el("save").textContent = saveLabel();
    updateAddLock();
  }

  // What the save action is called right now: after opening a file the browser has not yet
  // allowed writing to, it is "Continue saving to this file".
  function saveLabel() {
    if (state.handle && state.permissionNeeded) return "Continue saving to this file";
    return SAVE.supportsHandles ? "Save" : "Save a copy";
  }

  // The save offered beside a locked Add button: Save (Chrome and Edge) or Save a copy.
  function saveFromLock() {
    if (SAVE.supportsHandles) saveToFile();
    else saveCopy();
  }

  // "Add student" and "Save and add another student" stay disabled, with a plain reason and a
  // save button beside them, until the roll has been saved to a file (DECISIONS.md).
  function updateAddLock() {
    var locked = Boolean(state.roll) && !state.canAdd;
    el("add-student").disabled = locked;
    el("save-add-another").disabled = locked;
    el("add-lock").hidden = !locked;
    el("student-lock").hidden = !locked;
    el("add-lock-save").textContent = saveLabel();
    el("student-lock-save").textContent = saveLabel();
  }

  function markChanged() {
    state.changeCount++;
    state.dirty = true;
    state.saveError = "";
    scheduleAutosave();
    updateSaveStatus();
  }

  function scheduleAutosave() {
    clearTimeout(state.autosaveTimer);
    if (!state.handle) return;
    state.autosaveTimer = setTimeout(function () {
      SAVE.hasWritePermission(state.handle).then(function (granted) {
        state.permissionNeeded = !granted;
        if (granted) writeNow(); else updateSaveStatus();
      });
    }, AUTOSAVE_DELAY);
  }

  // Writes the roll to the chosen file. If more changes arrive while writing, writes again.
  async function writeNow() {
    if (!state.handle || !state.roll) return false;
    if (state.saving) { state.writeAgain = true; return false; }
    clearTimeout(state.autosaveTimer);
    state.saving = true;
    var snapshot = state.changeCount;
    var ok = false;
    try {
      await SAVE.write(state.handle, RF.serialise(state.roll));
      state.savedCount = snapshot;
      state.lastSavedAt = new Date();
      state.dirty = state.changeCount !== state.savedCount;
      state.saveError = "";
      state.canAdd = RF.canAddAfter(state.canAdd, "saved-to-file");
      ok = true;
    } catch (error) {
      state.saveError = "Could not save to " + state.fileName + ": " + (error && error.message ? error.message : error) +
        ". Your work is still on this page. Try Save again, or use Save a copy.";
    } finally {
      state.saving = false;
    }
    if (state.writeAgain || (ok && state.dirty)) {
      state.writeAgain = false;
      if (ok) scheduleAutosave();
    }
    updateSaveStatus();
    return ok && !state.dirty;
  }

  // The Save button (Chrome and Edge). Asks where to save the first time, then saves to that file.
  async function saveToFile() {
    if (!state.roll) return false;
    try {
      if (!state.handle) {
        var handle = await SAVE.pickSave(RF.fileName(state.roll));
        if (!handle) return false;
        state.handle = handle;
        state.fileName = handle.name;
      }
      var allowed = await SAVE.requestWritePermission(state.handle);
      state.permissionNeeded = !allowed;
      if (!allowed) {
        state.saveError = "Saving to " + state.fileName + " was not allowed. Choose Save again and allow it, or use Save a copy.";
        updateSaveStatus();
        return false;
      }
    } catch (error) {
      state.saveError = "Could not save: " + (error && error.message ? error.message : error) + ". Use Save a copy instead.";
      updateSaveStatus();
      return false;
    }
    return writeNow();
  }

  // Save a copy: downloads the file. Works in every browser.
  function saveCopy() {
    if (!state.roll) return;
    var name = RF.fileName(state.roll);
    SAVE.download(name, RF.serialise(state.roll));
    state.savedCount = state.changeCount;
    state.dirty = false;
    state.saveError = "";
    state.lastCopyAt = new Date();
    state.canAdd = RF.canAddAfter(state.canAdd, "copy-downloaded");
    if (!state.handle) state.fileName = name;
    updateSaveStatus();
  }

  // When there are unsaved changes, asks what to do. Resolves true if it is fine to carry on.
  async function settleUnsaved(action) {
    if (!state.dirty) return true;
    var saveLabel = SAVE.supportsHandles ? "Save, then " + action : "Save a copy, then " + action;
    var choice = await ask("You have unsaved changes", [
      "Your roll has changes that are not saved to a file yet.",
      "Save them first, or carry on without saving and lose them."
    ], [
      { label: saveLabel, value: "save", primary: true },
      { label: action.charAt(0).toUpperCase() + action.slice(1) + " without saving", value: "discard" },
      { label: "Cancel", value: "cancel" }
    ]);
    if (choice === "cancel") return false;
    if (choice === "discard") return true;
    if (SAVE.supportsHandles) return saveToFile();
    saveCopy();
    return true;
  }

  // ---- The roll ----

  function setRoll(roll, handle, fileName, opened) {
    clearTimeout(state.autosaveTimer);
    state.roll = roll;
    state.handle = handle || null;
    state.fileName = fileName || "";
    state.permissionNeeded = false;
    state.canAdd = false;
    state.changeCount = 0;
    state.savedCount = 0;
    state.dirty = false;
    state.saveError = "";
    state.lastSavedAt = null;
    state.lastCopyAt = null;
    state.openedAt = opened ? new Date() : null;
    state.editingId = null;
    state.stash = {};
  }

  function clearRoll() {
    setRoll(null, null, "", false);
  }

  function renderRoll() {
    var roll = state.roll;
    el("roll-year").value = String(roll.roll.transition_year);
    el("roll-year-problem").hidden = true;
    el("roll-student-year").value = roll.roll.default_student_year;
    el("roll-heading").textContent = "Your leaving roll for " + roll.roll.transition_year;

    var rows = el("roll-rows");
    rows.replaceChildren();
    var complete = 0;
    var ctx = context();
    roll.students.forEach(function (student) {
      var problems = R.checkStudent(student, ctx);
      if (problems.length === 0) complete++;
      var tr = document.createElement("tr");
      var name = studentName(student);

      var th = document.createElement("th");
      th.scope = "row";
      th.textContent = name;
      var year = document.createElement("td");
      year.textContent = student.fields.student_year || "";
      var dest = document.createElement("td");
      dest.textContent = destinationText(student.destination_school_domain);
      var status = document.createElement("td");
      status.textContent = problems.length === 0 ? "Complete" : problems.length + " missing";
      status.className = problems.length === 0 ? "status-complete" : "status-missing";

      var actions = document.createElement("td");
      actions.className = "actions";
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary small";
      edit.textContent = "Edit";
      edit.setAttribute("aria-label", "Edit " + name);
      edit.addEventListener("click", function () { openStudent(student.record_id); });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary small danger";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", "Remove " + name);
      remove.addEventListener("click", function () { confirmRemove(student.record_id); });
      actions.append(edit, remove);

      tr.append(th, year, dest, status, actions);
      rows.appendChild(tr);
    });
    var count = roll.students.length;
    el("roll-total").textContent = count === 0 ? "" :
      count + (count === 1 ? " student" : " students") + " on this roll, " + complete + " complete.";
    el("roll-table").hidden = count === 0;
    el("roll-empty").hidden = count !== 0;
    updateSaveStatus();
  }

  function showRoll(focusTarget) {
    renderRoll();
    showView("roll", focusTarget);
  }

  function startRoll() {
    var year = readYear(el("setup-year"));
    if (year === null) {
      tell("Check the transition year", ["Enter the transition year as four digits, for example " + nzYear() + "."]);
      return;
    }
    clearRoll();
    setRoll(RF.newRoll({
      transitionYear: year,
      defaultStudentYear: el("setup-student-year").value,
      teacherEmail: state.account.email,
      sendingSchoolDomain: state.identity.sendingDomain
    }), null, "", false);
    state.canAdd = RF.canAddAfter(state.canAdd, "new-roll");
    showRoll();
  }

  async function newRollFromRoll() {
    if (!(await settleUnsaved("start a new roll"))) return;
    clearRoll();
    el("setup-year").value = String(nzYear());
    el("setup-student-year").value = "";
    showView("setup");
  }

  async function openRoll() {
    if (!(await settleUnsaved("open another roll"))) return;
    var picked;
    try {
      picked = await SAVE.pickOpen(el("file-input"));
    } catch (error) {
      await tell("The file could not be opened", [String(error && error.message ? error.message : error)]);
      return;
    }
    if (!picked) return;

    var roll;
    try {
      roll = RF.parse(picked.text);
    } catch (error) {
      var unchanged = state.roll ? "Your current roll has not been changed." : "Nothing has been loaded.";
      await tell("This file could not be opened", [picked.name + ": " + error.message, unchanged]);
      return;
    }

    var addresses = [state.account.email, state.account.userPrincipalName];
    var handle = picked.handle;
    var takenOver = false;
    if (!RF.belongsTo(roll, addresses)) {
      var choice = await ask("This roll belongs to a different teacher", [
        "This roll was saved by " + roll.roll.teacher_email + ". You are signed in as " + state.account.email + ".",
        "Open as a new roll for me (recommended): the students become your own roll, with new record IDs, and nothing on it counts as sent. Save it as a new file.",
        "Open anyway: only if this is your own file and you saved it with a different account."
      ], [
        { label: "Open as a new roll for me", value: "new", primary: true },
        { label: "Open anyway, this is my own file", value: "anyway" },
        { label: "Cancel", value: "cancel" }
      ]);
      if (choice === "cancel") return;
      if (choice === "new") {
        RF.takeOver(roll, state.account.email, state.identity.sendingDomain);
        handle = null;
        takenOver = true;
      }
    }

    setRoll(roll, handle, takenOver ? "" : picked.name, true);
    if (takenOver) {
      state.openedAt = null;
      state.canAdd = RF.canAddAfter(state.canAdd, "taken-over");
      markChanged();
    } else if (handle) {
      state.permissionNeeded = !(await SAVE.hasWritePermission(handle));
      state.canAdd = RF.canAddAfter(state.canAdd, state.permissionNeeded ? "opened-not-writable" : "opened-writable");
    } else {
      state.canAdd = RF.canAddAfter(state.canAdd, "opened-by-upload");
    }
    showRoll();
  }

  async function confirmRemove(id) {
    var student = findStudent(id);
    if (!student) return;
    var name = studentName(student);
    var paragraphs = ["This removes " + name + " and all their answers from your roll."];
    if (student.last_sent) {
      paragraphs.push("They have already been sent to " + destinationText(student.last_sent.destination_school_domain) +
        ". That school will be told to remove the record when you next send.");
    }
    var choice = await ask("Remove " + name + "?", paragraphs, [
      { label: "Remove", value: "remove", primary: true },
      { label: "Cancel", value: "cancel" }
    ]);
    if (choice !== "remove") return;
    RF.removeStudent(state.roll, id);
    markChanged();
    renderRoll();
    el("roll-heading").focus();
  }

  // ---- The student form ----

  var studentForm = null;

  function currentStudent() {
    return findStudent(state.editingId);
  }

  // Gives back answers cleared by hiding when their question shows again, then empties any
  // hidden field, keeping what it cleared until the form is closed.
  function applyShowHide(student) {
    var restored = true;
    while (restored) {
      restored = false;
      F.STUDENT_KEYS.forEach(function (key) {
        if (key in state.stash && R.isShown(key, student.fields) && R.isBlank(student.fields[key])) {
          student.fields[key] = state.stash[key];
          delete state.stash[key];
          restored = true;
        }
      });
    }
    var result = R.clearHidden(student.fields);
    Object.assign(state.stash, result.cleared);
    student.fields = result.fields;
  }

  function refreshStudent() {
    var student = currentStudent();
    if (!student) return;
    var problems = R.checkStudent(student, context());
    studentForm.show(student, problems);
    var name = String(student.fields.student_name || "").trim();
    el("student-heading").textContent = name ? "Student: " + name : "New student";
    renderSummary(problems);
  }

  function renderSummary(problems) {
    var box = el("student-summary");
    box.replaceChildren();
    box.classList.toggle("complete", problems.length === 0);
    var p = document.createElement("p");
    if (problems.length === 0) {
      p.textContent = "Complete. Every required question is answered.";
      box.appendChild(p);
      return;
    }
    p.textContent = problems.length === 1 ? "1 question still to answer or check:" : problems.length + " questions still to answer or check:";
    box.appendChild(p);
    var list = document.createElement("ul");
    problems.forEach(function (problem) {
      var li = document.createElement("li");
      var link = document.createElement("a");
      link.href = "#f-" + problem.key;
      link.textContent = problem.label + (problem.kind === "invalid" ? " (check this answer)" : "");
      link.addEventListener("click", function (event) {
        event.preventDefault();
        studentForm.focus(problem.key);
      });
      li.appendChild(link);
      list.appendChild(li);
    });
    box.appendChild(list);
  }

  function onAnswer(key, value) {
    var student = currentStudent();
    if (!student) return;
    if (key === "destination_school_domain") student.destination_school_domain = value;
    else student.fields[key] = value;
    applyShowHide(student);
    markChanged();
    refreshStudent();
  }

  function onToggle(key, option, checked) {
    var student = currentStudent();
    if (!student) return;
    student.fields[key] = R.toggleOption(key, student.fields[key], option, checked);
    applyShowHide(student);
    markChanged();
    refreshStudent();
  }

  function openStudent(id, isNew) {
    var student = findStudent(id);
    if (!student) return;
    state.editingId = id;
    state.stash = {};
    studentForm.setDestinations(state.destinations, student.destination_school_domain);
    refreshStudent();
    updateSaveStatus();
    showView("student", isNew ? el("in-student_name") : el("student-heading"));
  }

  function addStudent() {
    if (!state.canAdd) return;
    var student = RF.newStudent(state.roll);
    state.roll.students.push(student);
    markChanged();
    openStudent(student.record_id, true);
  }

  function closeStudent() {
    state.editingId = null;
    state.stash = {};
    showRoll();
  }

  function saveAndAddAnother() {
    if (!state.canAdd) return;
    // Answers are kept as they are typed; with a chosen file, write now rather than waiting.
    if (state.handle && state.dirty && !state.permissionNeeded) writeNow();
    addStudent();
  }

  // ---- Sign-in ----

  var schoolListReady;

  function loadSchoolList() {
    schoolListReady = fetch("data/schools.csv?v=" + VERSION, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.text();
    }).then(function (text) {
      state.schools = S.parseSchoolList(text);
      state.destinations = S.destinations(state.schools);
    }).catch(function (error) {
      state.schools = [];
      state.destinations = [];
      state.schoolListError = String(error && error.message ? error.message : error);
      showBanner("The school list could not be loaded (" + state.schoolListError + "), so only \"" +
        F.OTHER_DESTINATION_LABEL + "\" can be chosen as a destination for now. Students who already have a school keep it. " +
        "You can carry on, or reload the page later to try again.");
    });
  }

  function updateSignInButtons() {
    var ticked = el("privacy-tick").checked;
    el("ms-signin").disabled = !ticked;
    el("google-signin").disabled = !ticked;
    el("signin-help").hidden = ticked;
  }

  function showTeacher() {
    var account = state.account;
    el("teacher-name").value = state.teacherName;
    el("teacher-name-problem").hidden = Boolean(state.teacherName.trim());
    el("teacher-email").value = account.email;
    var identity = state.identity;
    var school;
    if (state.schoolListError) school = "The school list could not be loaded, so your school could not be identified.";
    else if (identity.listed) school = "Your school: " + identity.school.name;
    else school = "Your school is not on the list; that is fine.";
    el("teacher-school").textContent = school;

    var notes = [];
    if (identity.conflict) {
      notes.push("Your sign-in name and your mail address belong to different schools on the list. " +
        "The page has used your sign-in name, " + account.userPrincipalName + ".");
    }
    if (!account.canSend) {
      notes.push("The permission to send email was not granted. That does not matter yet: sending comes in a later version of this page.");
    }
    el("teacher-notes").textContent = notes.join(" ");
    el("teacher-notes").hidden = notes.length === 0;
    el("header-teacher").textContent = account.email;
    el("header-account").hidden = false;
  }

  function signIn(name) {
    var provider = providers[name];
    var message = el("signin-message");
    message.hidden = true;
    el("ms-signin").disabled = true;
    el("google-signin").disabled = true;
    // provider.signIn opens its popup straight away, inside this click.
    provider.signIn().then(async function (account) {
      var reason = S.refusalReason(account);
      if (reason) {
        message.replaceChildren();
        var main = document.createElement("strong");
        main.textContent = "Please sign in with your school account.";
        var detail = document.createElement("span");
        detail.className = "small";
        detail.textContent = " (" + account.email + ": " + reason + ".)";
        message.append(main, detail);
        message.hidden = false;
        await provider.signOut().catch(function () {});
        return;
      }
      await schoolListReady;
      account.canSend = account.provider === "Google"
        ? Boolean(account.canSend)
        : (account.grantedScopes || []).some(function (s) { return String(s).toLowerCase() === "mail.send"; });
      state.account = account;
      state.provider = provider;
      state.teacherName = account.name || "";
      // Microsoft: the sign-in name is the user principal name. Google has only the address.
      state.identity = S.identifySchool(state.schools, account.provider === "Microsoft" ? account.userPrincipalName : null, account.email);
      showTeacher();
      el("setup-year").value = String(nzYear());
      el("setup-student-year").value = "";
      showView("setup");
    }).catch(function (error) {
      message.textContent = name + " sign-in did not finish: " + (error && (error.errorMessage || error.message) ? (error.errorMessage || error.message) : String(error));
      message.hidden = false;
    }).finally(updateSignInButtons);
  }

  async function signOut() {
    if (!state.account) return;
    if (!(await settleUnsaved("sign out"))) return;
    var provider = state.provider;
    clearRoll();
    state.account = null;
    state.provider = null;
    state.teacherName = "";
    state.identity = null;
    el("header-account").hidden = true;
    el("teacher-name").value = "";
    el("teacher-email").value = "";
    el("privacy-tick").checked = false;
    updateSignInButtons();
    showView("signin");
    try { await provider.signOut(); } catch (e) { /* the page has forgotten the account either way */ }
  }

  // ---- Start-up ----

  function start() {
    el("privacy-text").textContent = F.PRIVACY_TEXT;
    el("privacy-nb").textContent = F.PRIVACY_NB;
    el("privacy-legend").textContent = F.PRIVACY_LABEL;
    el("privacy-tick-text").textContent = F.PRIVACY_TICKBOX;
    el("teacher-name-label").textContent = F.TEACHER_NAME_LABEL;
    el("teacher-email-label").textContent = F.TEACHER_EMAIL_LABEL;
    el("student-nb").textContent = F.PRIVACY_NB;
    fillYearSelect(el("setup-student-year"));
    fillYearSelect(el("roll-student-year"));

    studentForm = new TF.StudentForm(el("student-form"), { onAnswer: onAnswer, onToggle: onToggle });

    el("privacy-tick").checked = false;
    el("privacy-tick").addEventListener("change", updateSignInButtons);
    el("ms-signin").addEventListener("click", function () { signIn("Microsoft"); });
    el("google-signin").addEventListener("click", function () { signIn("Google"); });
    el("sign-out").addEventListener("click", signOut);

    el("teacher-name").addEventListener("input", function () {
      state.teacherName = el("teacher-name").value;
      el("teacher-name-problem").hidden = Boolean(state.teacherName.trim());
    });

    el("start-roll").addEventListener("click", startRoll);
    el("open-roll-setup").addEventListener("click", openRoll);
    el("open-roll").addEventListener("click", openRoll);
    el("new-roll").addEventListener("click", newRollFromRoll);
    el("add-student").addEventListener("click", addStudent);
    el("save").addEventListener("click", saveToFile);
    el("save-copy").addEventListener("click", saveCopy);
    el("add-lock-save").addEventListener("click", saveFromLock);
    el("student-lock-save").addEventListener("click", saveFromLock);

    el("roll-year").addEventListener("change", function () {
      var year = readYear(el("roll-year"));
      el("roll-year-problem").hidden = year !== null;
      if (year === null || year === state.roll.roll.transition_year) return;
      state.roll.roll.transition_year = year;
      markChanged();
      el("roll-heading").textContent = "Your leaving roll for " + year;
    });
    el("roll-student-year").addEventListener("change", function () {
      state.roll.roll.default_student_year = el("roll-student-year").value;
      markChanged();
    });

    el("back-top").addEventListener("click", closeStudent);
    el("back-bottom").addEventListener("click", closeStudent);
    el("save-add-another").addEventListener("click", saveAndAddAnother);

    window.addEventListener("beforeunload", function (event) {
      if (state.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    loadSchoolList();
    updateSignInButtons();
    showView("signin", null);

    var msId = (config.microsoftClientId || "").trim();
    var googleId = (config.googleClientId || "").trim();
    var pending = 0;
    el("no-providers").hidden = Boolean(msId || googleId);
    function ready() {
      pending--;
      if (pending <= 0) el("signin-loading").hidden = true;
    }
    if (!msId && !googleId) el("signin-loading").hidden = true;
    // The address the Microsoft popup returns to: the site root, which is the redirect address IT registered.
    var redirectUri = new URL("./", window.location.href).href;
    if (msId) {
      pending++;
      TF.microsoft.init(msId, redirectUri).then(function () {
        el("ms-signin").hidden = false;
      }).catch(function (error) {
        showBanner("Microsoft sign-in could not start: " + (error && error.message ? error.message : error));
      }).finally(ready);
    }
    if (googleId) {
      pending++;
      TF.google.init(googleId).then(function () {
        el("google-signin").hidden = false;
      }).catch(function (error) {
        showBanner("Google sign-in could not start: " + (error && error.message ? error.message : error));
      }).finally(ready);
    }
  }

  start();
})();
