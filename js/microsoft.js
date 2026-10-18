// Microsoft sign-in (MSAL Browser, auth code flow with PKCE, popup) and sending through Microsoft Graph.
(function () {
  "use strict";

  var SCOPES = ["User.Read", "Mail.Send"];
  // Tenant ID Microsoft uses for personal (consumer) accounts.
  var CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

  var pca = null;
  var account = null;

  async function httpError(response) {
    var text = await response.text();
    return new Error("HTTP " + response.status + " " + response.statusText + "\n" + text);
  }

  async function init(clientId, redirectUri) {
    pca = new msal.PublicClientApplication({
      auth: {
        clientId: clientId,
        // Work and school accounts only.
        authority: "https://login.microsoftonline.com/organizations",
        redirectUri: redirectUri
      },
      cache: {
        // Tokens are held in page memory only and are gone when the tab closes.
        cacheLocation: "memoryStorage"
      },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
          logLevel: msal.LogLevel.Warning,
          loggerCallback: function (level, message, containsPii) {
            if (!containsPii) console.warn("[MSAL] " + message);
          }
        }
      }
    });
    await pca.initialize();
  }

  // Must be called directly from a click, before any await, so the popup is not blocked.
  async function signIn() {
    var result = await pca.loginPopup({ scopes: SCOPES, prompt: "select_account" });
    account = result.account;

    var response = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
      headers: { Authorization: "Bearer " + result.accessToken }
    });
    if (!response.ok) throw await httpError(response);
    var me = await response.json();

    var claims = account.idTokenClaims || {};
    var email = me.mail || me.userPrincipalName;
    return {
      provider: "Microsoft",
      name: me.displayName || account.name,
      email: email,
      userPrincipalName: me.userPrincipalName,
      tenantId: claims.tid || account.tenantId,
      isConsumerTenant: (claims.tid || account.tenantId) === CONSUMER_TENANT_ID,
      grantedScopes: result.scopes
    };
  }

  async function getMailToken() {
    var request = { scopes: ["Mail.Send"], account: account };
    try {
      return (await pca.acquireTokenSilent(request)).accessToken;
    } catch (error) {
      if (error instanceof msal.InteractionRequiredAuthError) {
        return (await pca.acquireTokenPopup(request)).accessToken;
      }
      throw error;
    }
  }

  async function sendMail(message) {
    var token = await getMailToken();
    var response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: message.subject,
          body: { contentType: "Text", content: message.body },
          toRecipients: [{ emailAddress: { address: message.to } }],
          attachments: [{
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: message.attachmentName,
            contentType: "text/csv",
            contentBytes: TF.mime.bytesToBase64(message.attachmentBytes)
          }]
        },
        saveToSentItems: true
      })
    });
    if (!response.ok) throw await httpError(response);
    return "Microsoft Graph accepted the message (HTTP " + response.status + ").";
  }

  // Clears this page's tokens. It does not sign the browser out of Microsoft 365.
  async function signOut() {
    if (pca && account) await pca.clearCache({ account: account });
    account = null;
  }

  window.TF = window.TF || {};
  window.TF.microsoft = {
    init: init,
    signIn: signIn,
    sendMail: sendMail,
    signOut: signOut,
    tokenStorage: "MSAL memory cache (cacheLocation \"memoryStorage\"). MSAL keeps short-lived sign-in state (not tokens) in session storage while the popup is open."
  };
})();
