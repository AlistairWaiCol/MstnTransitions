// Page wiring: sign-in buttons, account panel, the send button and the results log.
(function () {
  "use strict";

  if (window.TF_IS_AUTH_POPUP) return;

  var PERSONAL_DOMAINS = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "yahoo.com", "icloud.com"];
  var MSAL_VERSION = "5.23.0";
  var config = window.TF_CONFIG || {};
  var providers = { Microsoft: TF.microsoft, Google: TF.google };
  var current = null; // { provider, account }

  var el = function (id) { return document.getElementById(id); };
  var msButton = el("ms-signin");
  var googleButton = el("google-signin");
  var sendButton = el("send-test");
  var signOutButton = el("sign-out");

  // The address the Microsoft popup returns to: this page's folder, with the trailing slash.
  var redirectUri = new URL("./", window.location.href).href;

  // ---- Results log ----

  function nzTime(date) {
    return new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).format(date);
  }

  function log(kind, heading, detail) {
    var item = document.createElement("li");
    item.className = "result " + kind;
    var title = document.createElement("strong");
    title.textContent = nzTime(new Date()) + "  " + heading;
    item.appendChild(title);
    if (detail) {
      var pre = document.createElement("pre");
      pre.textContent = detail;
      item.appendChild(pre);
    }
    el("results").prepend(item);
  }

  // Shows every part of an error, never a softened summary.
  function describeError(error) {
    if (!error) return "Unknown error (nothing was returned).";
    var parts = [];
    if (error.name) parts.push("Type: " + error.name);
    if (error.errorCode) parts.push("Error code: " + error.errorCode);
    if (error.errorMessage) parts.push("Message: " + error.errorMessage);
    if (error.subError) parts.push("Sub-error: " + error.subError);
    if (error.correlationId) parts.push("Correlation ID: " + error.correlationId);
    if (!error.errorCode && error.message) parts.push(error.message);
    if (parts.length === 0) parts.push(String(error));
    return parts.join("\n");
  }

  // ---- Panels ----

  function addRow(list, label, value) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = value;
    list.append(dt, dd);
  }

  function showAbout() {
    var about = el("about-details");
    addRow(about, "Microsoft library", "@azure/msal-browser " + MSAL_VERSION + ", vendored copy in this repo" +
      (window.msal && msal.version && msal.version !== MSAL_VERSION ? " (reports " + msal.version + ")" : ""));
    addRow(about, "Google library", "Google Identity Services, loaded from https://accounts.google.com/gsi/client (Google publishes no versioned copy)");
    addRow(about, "Microsoft tokens kept in", TF.microsoft.tokenStorage);
    addRow(about, "Google tokens kept in", TF.google.tokenStorage);
    addRow(about, "Microsoft redirect address", redirectUri);
    addRow(about, "Requests allowed", "Microsoft sign-in, Microsoft Graph, Google sign-in, Google userinfo and the Gmail API only (enforced by the page's Content Security Policy)");
  }

  function showAccount(account) {
    var list = el("account-details");
    list.replaceChildren();
    addRow(list, "Provider", account.provider);
    addRow(list, "Name", account.name || "(not given)");
    addRow(list, "Email address", account.email);
    addRow(list, "Email domain", account.domain);
    if (account.provider === "Microsoft") {
      addRow(list, "Tenant ID", account.tenantId || "(not given)");
      if (account.userPrincipalName && account.userPrincipalName.toLowerCase() !== account.email.toLowerCase()) {
        addRow(list, "User principal name", account.userPrincipalName);
      }
    } else {
      addRow(list, "Email verified by Google", account.emailVerified ? "Yes" : "No");
      addRow(list, "Google Workspace domain (hd)", account.hostedDomain || "None. This is not a Google Workspace account.");
    }
    addRow(list, "Permissions granted", account.grantedScopes.join(", ") || "(none reported)");
    el("account-section").hidden = false;
  }

  function setBusy(busy) {
    [msButton, googleButton, sendButton, signOutButton].forEach(function (button) { button.disabled = busy; });
  }

  // ---- Sign-in ----

  function domainOf(address) {
    return String(address || "").split("@").pop().toLowerCase();
  }

  function refusalReason(account) {
    var domains = [domainOf(account.email)];
    if (account.userPrincipalName) domains.push(domainOf(account.userPrincipalName));
    if (domains.some(function (d) { return PERSONAL_DOMAINS.indexOf(d) !== -1; })) return "personal email domain";
    if (account.isConsumerTenant) return "Microsoft personal account tenant";
    if (account.provider === "Google" && !account.emailVerified) return "Google says the email address is not verified";
    return null;
  }

  function signIn(providerName) {
    var provider = providers[providerName];
    setBusy(true);
    log("info", providerName + ": sign-in started");
    // provider.signIn opens its popup straight away, inside this click.
    provider.signIn().then(function (account) {
      account.domain = domainOf(account.email);
      var reason = refusalReason(account);
      if (reason) {
        log("error", "Please sign in with your school account.", "Refused: " + reason + " (" + account.email + ").");
        return provider.signOut();
      }
      current = { provider: provider, account: account };
      showAccount(account);
      msButton.hidden = true;
      googleButton.hidden = true;
      log("success", providerName + ": signed in as " + account.email);
      if (account.provider === "Google" && !account.canSend) {
        log("error", "Google: the Gmail send permission was not granted.", "Granted: " + account.grantedScopes.join(", "));
      }
    }).catch(function (error) {
      log("error", providerName + ": sign-in failed", describeError(error));
    }).finally(function () {
      setBusy(false);
    });
  }

  // ---- Sending ----

  function sendTest() {
    if (!current) return;
    var account = current.account;
    var file = TF.csv.buildTestFile(account);
    var message = {
      to: account.email,
      subject: "Transition Form sending test – ngā mihi",
      body: "Kia ora " + (account.name || "") + ",\n\n" +
        "This is a test email from the Transition Form sign-in and sending test (Phase A). " +
        "It was sent from your own mailbox by the test page at " + redirectUri + "\n\n" +
        "The attached file, " + file.name + ", holds " + file.rowCount + " fictional students. " +
        "It contains no real student information.\n\nNgā mihi",
      attachmentName: file.name,
      attachmentBytes: file.bytes
    };
    setBusy(true);
    log("info", account.provider + ": sending " + file.name + " to " + account.email);
    // sendMail may need to open a popup, so it is called inside this click before any await.
    current.provider.sendMail(message).then(function (result) {
      log("success", account.provider + ": test email sent", result + "\nCheck your inbox and Sent items for " + file.name + ".");
    }).catch(function (error) {
      log("error", account.provider + ": sending failed", describeError(error));
    }).finally(function () {
      setBusy(false);
    });
  }

  function signOut() {
    if (!current) return;
    var name = current.account.provider;
    var provider = current.provider;
    current = null;
    el("account-section").hidden = true;
    el("account-details").replaceChildren();
    provider.signOut().then(function () {
      log("info", name + ": signed out of this page",
        name === "Microsoft"
          ? "This page's tokens are cleared. Your browser stays signed in to Microsoft 365."
          : "The Google token is revoked. The next sign-in will ask for permission again.");
    }).catch(function (error) {
      log("error", name + ": sign-out failed", describeError(error));
    }).finally(showSignInButtons);
  }

  // ---- Start-up ----

  var ready = { Microsoft: false, Google: false };

  function showSignInButtons() {
    msButton.hidden = !ready.Microsoft;
    googleButton.hidden = !ready.Google;
  }

  function start() {
    showAbout();
    msButton.addEventListener("click", function () { signIn("Microsoft"); });
    googleButton.addEventListener("click", function () { signIn("Google"); });
    sendButton.addEventListener("click", sendTest);
    signOutButton.addEventListener("click", signOut);

    var msId = (config.microsoftClientId || "").trim();
    var googleId = (config.googleClientId || "").trim();
    el("no-providers").hidden = Boolean(msId || googleId);

    if (msId) {
      TF.microsoft.init(msId, redirectUri).then(function () {
        ready.Microsoft = true;
        if (!current) showSignInButtons();
      }).catch(function (error) {
        log("error", "Microsoft: could not start the sign-in library", describeError(error));
      });
    }
    if (googleId) {
      TF.google.init(googleId).then(function () {
        ready.Google = true;
        if (!current) showSignInButtons();
      }).catch(function (error) {
        log("error", "Google: could not start the sign-in library", describeError(error));
      });
    }
  }

  start();
})();
