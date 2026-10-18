// When Microsoft sign-in finishes in the popup, the popup comes back to this page's address
// with the response in the URL. MSAL Browser 5 needs that window to pass the response to the
// main page (over a BroadcastChannel) and close, without starting the app.
(function () {
  "use strict";

  function hasAuthResponse(part) {
    var params = new URLSearchParams(part.replace(/^[#?]/, ""));
    return params.has("state") && (params.has("code") || params.has("error"));
  }

  window.TF_IS_AUTH_POPUP = hasAuthResponse(window.location.hash) || hasAuthResponse(window.location.search);
  if (!window.TF_IS_AUTH_POPUP) return;

  document.documentElement.classList.add("auth-popup");
  window.msalRedirectBridge.broadcastResponseToMainFrame().catch(function (error) {
    document.body.textContent = "Sign-in could not be passed back to the test page: " + String(error);
  });
})();
