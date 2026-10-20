// The per-student fields, as data. field-list.md is the specification and csv-format.md gives the
// keys. The student form, the completeness check and (in Phase C) the CSV writer all read this list,
// so a field is described once, here.
//
// Each field:
//   key       the csv-format.md column name (destination is `destination_school_domain`, which is
//             column 9, not a student column)
//   number    the field's number in field-list.md
//   section   the id of the section it sits in
//   label     exactly as in field-list.md
//   type      text | longtext | number | year | destination | choice | multi | tickbox | rating
//   options   for choice and multi
//   exclusive for multi: the option that clears the others ("Nothing to report", "N/A", ...)
//   required  true if it must be answered whenever it is shown
//   limit     for longtext: maximum characters, or absent for no limit
//   shownWhen absent for always shown, otherwise { key, equals } / { key, includes } / { key, hasOtherThan }.
//             A field is shown only if its rule holds and the field it depends on is shown too.
//   tickboxText, hint, helper  extra wording shown with the field
(function (root) {
  "use strict";

  var YES_NO = ["Yes", "No"];

  var YEARS = [];
  for (var y = 0; y <= 13; y++) YEARS.push("Year " + y);

  var FLAGS = [
    "Learning needs", "Health & Wellbeing needs", "Behaviour needs", "Agency involvement",
    "Assistive technology support", "ORS funded", "Recent LSC Intervention", "ESOL", "ESOL funded",
    "Refugee status", "Nothing to report"
  ];

  var INTERESTS = ["N/A", "Cultural", "Sports", "Arts", "Leadership", "Digital / Technology", "Other"];

  var LEVELS = ["Emerging", "Developing", "Consolidating", "Proficient", "Exceeding"];

  var DIAGNOSES = [
    "ADHD", "ASD", "Dyslexia", "Dysgraphia", "Dyscalculia", "Dyspraxia", "Speech and Language needs",
    "Sensory needs", "Other - please explain", "None of the above"
  ];

  var AGENCIES = [
    "N/A", "RTLB", "Severe Behaviour", "Educational Psychologist", "Occupational Therapist",
    "Speech/Language Therapist", "CAMHS", "Oranga Tamariki", "Open Home Foundation", "Other"
  ];

  var RATINGS = ["1", "2", "3", "4", "5"];

  var CONTACT_TEXT = "Please contact the contributing school for further detailed information.";
  var FURTHER_INFO = "Further information can be added to the comment box at the end of this form.";

  var SECTIONS = [
    { id: "student", title: "Student" },
    { id: "flags", title: "Flags" },
    { id: "attendance", title: "Attendance" },
    { id: "strengths", title: "Student Strengths and Interests" },
    { id: "curriculum", title: "Curriculum Achievement (Progress Descriptors – Term Two Data)" },
    { id: "learning", title: "Students Needs - Learning" },
    { id: "health", title: "Students Needs - Health/Wellbeing" },
    { id: "behaviour", title: "Students Needs - Behaviour" },
    { id: "agency", title: "Agency Involvement" },
    { id: "assistive", title: "Assistive technology support" },
    { id: "competencies", title: "Key Competencies - Ngā pūkenga matua",
      intro: "Please rate the student in how they achieve the key competencies" },
    { id: "other", title: "Other Information - Ētahi atu mōhiohio" }
  ];

  var LEARNING = { key: "flags", includes: "Learning needs" };
  var HEALTH = { key: "flags", includes: "Health & Wellbeing needs" };
  var BEHAVIOUR = { key: "flags", includes: "Behaviour needs" };
  var AGENCY = { key: "flags", includes: "Agency involvement" };
  var ASSISTIVE = { key: "flags", includes: "Assistive technology support" };

  function rating(key, number, label) {
    return { key: key, number: number, section: "competencies", label: label, type: "rating",
      options: RATINGS, required: true, hint: "1=Low, 5=high" };
  }

  var FIELDS = [
    { key: "student_name", number: 1, section: "student", label: "Student Name, Te ingoa o te ākonga",
      type: "text", required: true },
    { key: "student_year", number: 2, section: "student", label: "Student Year",
      type: "year", options: YEARS, required: false },
    { key: "destination_school_domain", number: 3, section: "student", label: "School Transitioning to, Te kura hōu",
      type: "destination", required: true },

    { key: "enrolment_completed", number: 4, section: "flags", label: "Enrolment completed, Kua oti te whakauru",
      type: "choice", options: ["Yes", "No", "Unknown"], required: true },
    { key: "flags", number: 5, section: "flags", label: "Flags, Kia mataara",
      type: "multi", options: FLAGS, exclusive: "Nothing to report", required: true },

    { key: "truancy_issues", number: 6, section: "attendance", label: "Has there been truancy issues with this student?",
      type: "choice", options: YES_NO, required: true },
    { key: "attendance_percent", number: 7, section: "attendance",
      label: "The last 2 years the students attendance has been (please enter percentage %)",
      type: "number", min: 0, max: 100, required: true, hint: "A number from 0 to 100. Decimals are fine." },
    { key: "truancy_services_involved", number: 8, section: "attendance", label: "Have truancy services been involved?",
      type: "choice", options: YES_NO, required: true, shownWhen: { key: "truancy_issues", equals: "Yes" } },
    { key: "truancy_interventions", number: 9, section: "attendance", label: "What interventions have been put in place?",
      type: "longtext", required: true, shownWhen: { key: "truancy_issues", equals: "Yes" } },

    { key: "gifted_learner", number: 10, section: "strengths", label: "Has this student been identified as a Gifted Learner?",
      type: "choice", options: YES_NO, required: true },
    { key: "gifted_details", number: 11, section: "strengths", label: "Please provide Gifted Learner details",
      type: "longtext", limit: 650, required: true, shownWhen: { key: "gifted_learner", equals: "Yes" } },
    { key: "special_interests", number: 12, section: "strengths",
      label: "Does the student have special interest areas and/or strengths?",
      type: "multi", options: INTERESTS, exclusive: "N/A", required: true },
    { key: "special_interest_details", number: 13, section: "strengths", label: "Special Interest or Strength Details",
      type: "longtext", limit: 650, required: true, shownWhen: { key: "special_interests", hasOtherThan: "N/A" } },

    { key: "reading", number: 14, section: "curriculum", label: "Academic Information - Reading",
      type: "choice", options: LEVELS, required: true },
    { key: "writing", number: 15, section: "curriculum", label: "Academic Information - Writing",
      type: "choice", options: LEVELS, required: true },
    { key: "maths", number: 16, section: "curriculum", label: "Academic Information - Maths",
      type: "choice", options: LEVELS, required: true },

    { key: "learning_support_diagnosis", number: 17, section: "learning",
      label: "Has the student previously received support for, or has been diagnosed with any of the following?",
      type: "multi", options: DIAGNOSES, exclusive: "None of the above", required: true, shownWhen: LEARNING },
    { key: "learning_other_details", number: 18, section: "learning", label: "Other support received or diagnosis",
      type: "longtext", required: true, helper: FURTHER_INFO,
      shownWhen: { key: "learning_support_diagnosis", includes: "Other - please explain" } },
    { key: "has_iep", number: 19, section: "learning", label: "Does the student have an Individual Education Plan?",
      type: "choice", options: YES_NO, required: true, shownWhen: LEARNING },
    { key: "learning_contact_school", number: 20, section: "learning", label: "Contact School (re. Needs - Learning)",
      type: "tickbox", tickboxText: CONTACT_TEXT, required: false, shownWhen: LEARNING },

    { key: "health_needs", number: 21, section: "health", label: "Does this student have any known health or wellbeing needs?",
      type: "choice", options: YES_NO, required: true, shownWhen: HEALTH },
    { key: "health_plan", number: 22, section: "health", label: "Does the student have a health/wellbeing plan?",
      type: "choice", options: YES_NO, required: true, shownWhen: HEALTH },
    { key: "health_transition_info", number: 23, section: "health",
      label: "Any relevant information that would help the student transition to a new school",
      type: "longtext", required: false, helper: FURTHER_INFO, shownWhen: HEALTH },
    { key: "health_contact_school", number: 24, section: "health", label: "Contact School (re. Needs - Health/Wellbeing)",
      type: "tickbox", tickboxText: CONTACT_TEXT, required: false, shownWhen: HEALTH },

    { key: "behaviour_risk", number: 25, section: "behaviour",
      label: "Does this student have any behavioural issues that may put themselves or others at risk?",
      type: "choice", options: YES_NO, required: true, shownWhen: BEHAVIOUR },
    { key: "behaviour_plan", number: 26, section: "behaviour", label: "Does the student have a behaviour plan?",
      type: "choice", options: YES_NO, required: true, shownWhen: BEHAVIOUR },
    { key: "behaviour_contact_school", number: 27, section: "behaviour", label: "Contact School (re. Needs - Behaviour)",
      type: "tickbox", tickboxText: CONTACT_TEXT, required: false, helper: FURTHER_INFO, shownWhen: BEHAVIOUR },

    { key: "agencies", number: 28, section: "agency",
      label: "Please indicate any current or previous outside agencies involved with this student",
      type: "multi", options: AGENCIES, exclusive: "N/A", required: true, shownWhen: AGENCY },
    { key: "agencies_other", number: 29, section: "agency", label: "Other Agencies",
      type: "longtext", limit: 650, required: true, shownWhen: { key: "agencies", includes: "Other" } },

    { key: "assistive_technology_details", number: 30, section: "assistive", label: "Details of assistive technology support",
      type: "longtext", limit: 650, required: true, shownWhen: ASSISTIVE },

    rating("kc_thinking", 31, "Thinking - Whakaaro"),
    rating("kc_using_language", 32, "Using language symbols and text - Whakaako"),
    rating("kc_managing_self", 33, "Managing Self - Whakahaere"),
    rating("kc_relating_to_others", 34, "Relating to others - Whakawhanaungatanga"),
    rating("kc_participating", 35, "Participating and contributing - Whakaurunga"),

    { key: "other_information", number: 36, section: "other",
      label: "Please provide any other information that may be of use to support this student",
      type: "longtext", limit: 650, required: true }
  ];

  // The 35 student columns of csv-format.md (columns 11 to 45), which are the keys of a working
  // file's `fields`. Destination is kept separately, as `destination_school_domain`.
  var STUDENT_KEYS = FIELDS.filter(function (f) { return f.type !== "destination"; }).map(function (f) { return f.key; });

  var BY_KEY = {};
  FIELDS.forEach(function (f) { BY_KEY[f.key] = f; });

  root.TF = root.TF || {};
  root.TF.fields = {
    SECTIONS: SECTIONS,
    FIELDS: FIELDS,
    STUDENT_KEYS: STUDENT_KEYS,
    YEARS: YEARS,
    byKey: function (key) { return BY_KEY[key]; },
    isMulti: function (key) { return BY_KEY[key] && BY_KEY[key].type === "multi"; },
    OTHER_DESTINATION: "other",
    OTHER_DESTINATION_LABEL: "Other / not listed",
    PRIVACY_TEXT: "To support positive and transparent communication, please remember that parents and caregivers " +
      "may request access to this document under the Privacy Act. We ask that comments remain objective, " +
      "respectful, and focused on information that supports the student's learning and wellbeing.",
    PRIVACY_NB: "NB: Parents/Caregivers may obtain access to this information.",
    PRIVACY_LABEL: "Privacy Protocols Acknowledged, Kua tūtohu ngā tikanga noho matatapu",
    PRIVACY_TICKBOX: "The privacy protocols have been acknowledged",
    TEACHER_NAME_LABEL: "Teacher Name, Te ingoa o te kaiako",
    TEACHER_EMAIL_LABEL: "Teacher Email"
  };
})(typeof window !== "undefined" ? window : globalThis);
