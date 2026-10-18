// Google sign-in (Google Identity Services token client) and sending through the Gmail API.
(function () {
  "use strict";

  var GIS_URL = "https://accounts.google.com/gsi/client";
  var SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
  var SCOPES = ["openid", "email", "profile", SEND_SCOPE];

  var tokenClient = null;
  var pending = null;
  var accessToken = null;
  var expiresAt = 0;

  async function httpError(response) {
    var text = await response.text();
    return new Error("HTTP " + response.status + " " + response.statusText + "\n" + text);
  }

  // Google does not publish versioned copies of this library, so it is loaded from Google.
  function loadLibrary() {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = GIS_URL;
      script.onload = resolve;
      script.onerror = function () { reject(new Error("Could not load Google Identity Services from " + GIS_URL)); };
      document.head.appendChild(script);
    });
  }

  function settle(error, response) {
    var p = pending;
    pending = null;
    if (!p) return;
    if (error) p.reject(error); else p.resolve(response);
  }

  async function init(clientId) {
    await loadLibrary();
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES.join(" "),
      callback: function (response) {
        if (response.error) {
          settle(new Error("Google returned an error: " + response.error +
            (response.error_description ? "\n" + response.error_description : "") +
            (response.error_uri ? "\n" + response.error_uri : "")));
        } else {
          settle(null, response);
        }
      },
      error_callback: function (error) {
        settle(new Error("Google sign-in popup error: " + error.type + (error.message ? "\n" + error.message : "")));
      }
    });
  }

  // Must be called directly from a click, before any await, so the popup is not blocked.
  function requestToken(prompt) {
    return new Promise(function (resolve, reject) {
      if (pending) pending.reject(new Error("A newer Google sign-in request replaced this one."));
      pending = { resolve: resolve, reject: reject };
      tokenClient.requestAccessToken({ prompt: prompt });
    }).then(function (response) {
      accessToken = response.access_token;
      expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
      return response;
    });
  }

  async function signIn() {
    var response = await requestToken("select_account");
    var userInfo = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + accessToken }
    });
    if (!userInfo.ok) throw await httpError(userInfo);
    var info = await userInfo.json();
    var granted = (response.scope || "").split(" ").filter(Boolean);
    return {
      provider: "Google",
      name: info.name,
      email: info.email,
      emailVerified: info.email_verified === true,
      hostedDomain: info.hd || "",
      grantedScopes: granted,
      canSend: google.accounts.oauth2.hasGrantedAllScopes(response, SEND_SCOPE)
    };
  }

  async function sendMail(message) {
    // Asks again, from the same click, only if the token has expired.
    if (!accessToken || Date.now() >= expiresAt) await requestToken("");
    var response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: TF.mime.buildRawMessage(message) })
    });
    if (!response.ok) throw await httpError(response);
    var sent = await response.json();
    return "Gmail accepted the message (HTTP " + response.status + ", message ID " + sent.id + ").";
  }

  // Revokes the token with Google, so the next sign-in asks for consent again.
  function signOut() {
    return new Promise(function (resolve) {
      if (!accessToken) return resolve();
      var token = accessToken;
      accessToken = null;
      expiresAt = 0;
      google.accounts.oauth2.revoke(token, function () { resolve(); });
    });
  }

  window.TF = window.TF || {};
  window.TF.google = {
    init: init,
    signIn: signIn,
    sendMail: sendMail,
    signOut: signOut,
    tokenStorage: "Page memory only (a JavaScript variable). Google Identity Services does not store the access token."
  };
})();
