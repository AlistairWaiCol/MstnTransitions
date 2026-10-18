// Base64 helpers and the multipart/mixed MIME message used for the Gmail API.
(function () {
  "use strict";

  function bytesToBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function utf8Base64(text) {
    return bytesToBase64(new TextEncoder().encode(text));
  }

  function base64Url(base64) {
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function wrap76(base64) {
    return base64.match(/.{1,76}/g).join("\r\n");
  }

  // RFC 2047 encoded-word subject, split so each encoded word stays within 75 characters
  // and no character is cut in half. Plain ASCII subjects are left as they are.
  function encodeSubject(subject) {
    if (/^[\x20-\x7e]*$/.test(subject)) return subject;
    var words = [];
    var chunk = "";
    Array.from(subject).forEach(function (ch) {
      if (new TextEncoder().encode(chunk + ch).length > 45) {
        words.push(chunk);
        chunk = "";
      }
      chunk += ch;
    });
    if (chunk) words.push(chunk);
    return words.map(function (word) { return "=?UTF-8?B?" + utf8Base64(word) + "?="; }).join("\r\n ");
  }

  function randomBoundary() {
    var bytes = crypto.getRandomValues(new Uint8Array(12));
    return "tf_" + Array.from(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  // Returns the whole message as a base64url string for the Gmail API "raw" field.
  function buildRawMessage(options) {
    var boundary = randomBoundary();
    var lines = [
      "To: " + options.to,
      "Subject: " + encodeSubject(options.subject),
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      "",
      "--" + boundary,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(utf8Base64(options.body)),
      "--" + boundary,
      'Content-Type: text/csv; charset="UTF-8"; name="' + options.attachmentName + '"',
      'Content-Disposition: attachment; filename="' + options.attachmentName + '"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(bytesToBase64(options.attachmentBytes)),
      "--" + boundary + "--",
      ""
    ];
    return base64Url(utf8Base64(lines.join("\r\n")));
  }

  window.TF = window.TF || {};
  window.TF.mime = { bytesToBase64: bytesToBase64, encodeSubject: encodeSubject, buildRawMessage: buildRawMessage };
})();
