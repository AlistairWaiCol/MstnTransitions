// The school list and the signed-in teacher's identity: reading data/schools.csv, refusing
// personal accounts, and matching a teacher to a school. No page dependencies.
(function (root) {
  "use strict";

  var REQUIRED_COLUMNS = ["school_name", "email_domains", "sends", "receives"];

  // Backstop list from DECISIONS.md (Personal-account check). Provider signals are checked first.
  var PERSONAL_DOMAINS = [
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com",
    "xtra.co.nz", "yahoo.co.nz", "hotmail.co.nz", "outlook.co.nz"
  ];

  function domainOf(address) {
    var text = String(address || "").trim().toLowerCase();
    var at = text.lastIndexOf("@");
    return at === -1 ? "" : text.slice(at + 1);
  }

  function yes(value) {
    return String(value).trim().toLowerCase() === "yes";
  }

  // Reads the school list. Throws with a plain message if the file is not usable.
  function parseSchoolList(text) {
    var table = root.TF.csv.readRecords(text);
    REQUIRED_COLUMNS.forEach(function (name) {
      if (table.columns.indexOf(name) === -1) throw new Error("The school list has no " + name + " column.");
    });
    return table.records.map(function (record, index) {
      var domains = record.email_domains.split(";").map(function (d) { return d.trim().toLowerCase(); }).filter(Boolean);
      if (!record.school_name.trim() || domains.length === 0) {
        throw new Error("Row " + (index + 2) + " of the school list has no name or no email domain.");
      }
      return {
        name: record.school_name.trim(),
        domains: domains,
        canonical: domains[0],
        sends: yes(record.sends),
        receives: yes(record.receives)
      };
    });
  }

  function findByDomain(schools, domain) {
    domain = String(domain || "").toLowerCase();
    for (var i = 0; i < schools.length; i++) {
      if (schools[i].domains.indexOf(domain) !== -1) return schools[i];
    }
    return null;
  }

  // Destination choices: schools that receive, sorted by name with en-NZ rules so that
  // Ōpaki and Tīnui sort under O and T.
  function destinations(schools) {
    return schools.filter(function (s) { return s.receives; }).slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, "en-NZ", { sensitivity: "base" });
    });
  }

  function isPersonalDomain(domain) {
    return PERSONAL_DOMAINS.indexOf(String(domain || "").toLowerCase()) !== -1;
  }

  // Why an account must be refused, or null if it may sign in. Provider signals first, then the
  // domain list as a backstop. account is what js/microsoft.js or js/google.js returns.
  function refusalReason(account) {
    if (account.provider === "Microsoft") {
      if (account.isConsumerTenant) return "Microsoft personal account (consumer tenant)";
      if (!account.tenantId) return "Microsoft did not say which organisation the account belongs to";
    }
    if (account.provider === "Google") {
      if (!account.hostedDomain) return "not a Google Workspace account (no hd)";
      if (!account.emailVerified) return "Google says the email address is not verified";
    }
    var addresses = [account.email, account.userPrincipalName].filter(Boolean);
    if (addresses.length === 0) return "the account has no email address";
    for (var i = 0; i < addresses.length; i++) {
      if (isPersonalDomain(domainOf(addresses[i]))) return "personal email domain " + domainOf(addresses[i]);
    }
    return null;
  }

  // Works out the sending school. signInName is Microsoft's user principal name (absent for
  // Google), mail is the mail address. Matches on either domain; if they match different schools
  // the sign-in name wins, because only it is tied to a domain verified in the tenant. If neither
  // matches, the teacher is from an unlisted school and their mail domain is the sending school.
  function identifySchool(schools, signInName, mail) {
    var bySignIn = signInName ? findByDomain(schools, domainOf(signInName)) : null;
    var byMail = findByDomain(schools, domainOf(mail));
    var school = bySignIn || byMail;
    return {
      school: school,
      sendingDomain: school ? school.canonical : domainOf(mail),
      listed: Boolean(school),
      conflict: Boolean(bySignIn && byMail && bySignIn !== byMail)
    };
  }

  root.TF = root.TF || {};
  root.TF.schools = {
    PERSONAL_DOMAINS: PERSONAL_DOMAINS,
    domainOf: domainOf,
    parseSchoolList: parseSchoolList,
    findByDomain: findByDomain,
    destinations: destinations,
    isPersonalDomain: isPersonalDomain,
    refusalReason: refusalReason,
    identifySchool: identifySchool
  };
})(typeof window !== "undefined" ? window : globalThis);
