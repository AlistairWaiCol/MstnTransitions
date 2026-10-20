// Saving and opening the working file on the teacher's computer. Chrome and Edge use the File
// System Access API, so after the first save (or after opening with the picker) the page can keep
// saving to the same file. Every browser can download a copy and open a file by upload.
// The file handle is kept in page memory only, never in browser storage.
(function () {
  "use strict";

  var TYPES = [{ description: "Transition roll", accept: { "application/json": [".json"] } }];

  var supportsHandles = typeof window.showSaveFilePicker === "function" &&
    typeof window.showOpenFilePicker === "function";

  function isCancel(error) {
    return error && error.name === "AbortError";
  }

  // Asks where to save. Resolves with a handle, or null if the teacher cancels.
  async function pickSave(suggestedName) {
    try {
      return await window.showSaveFilePicker({ suggestedName: suggestedName, types: TYPES });
    } catch (error) {
      if (isCancel(error)) return null;
      throw error;
    }
  }

  async function hasWritePermission(handle) {
    if (typeof handle.queryPermission !== "function") return true;
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  }

  // Must be called from a click: the browser may ask the teacher to allow saving to the file.
  async function requestWritePermission(handle) {
    if (await hasWritePermission(handle)) return true;
    if (typeof handle.requestPermission !== "function") return false;
    return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  }

  async function write(handle, text) {
    var writable = await handle.createWritable();
    try {
      await writable.write(new Blob([text], { type: "application/json" }));
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch (e) { /* already closed */ }
      throw error;
    }
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // Asks for a file to open. Resolves with { text, name, handle } (handle is null when the
  // browser has no file handles), or null if the teacher cancels.
  async function pickOpen(fileInput) {
    if (supportsHandles) {
      var handles;
      try {
        handles = await window.showOpenFilePicker({ types: TYPES, multiple: false });
      } catch (error) {
        if (isCancel(error)) return null;
        throw error;
      }
      var file = await handles[0].getFile();
      return { text: await file.text(), name: file.name, handle: handles[0] };
    }
    return new Promise(function (resolve, reject) {
      function cleanUp() {
        fileInput.removeEventListener("change", onChange);
        fileInput.removeEventListener("cancel", onCancel);
      }
      function onChange() {
        cleanUp();
        var chosen = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!chosen) return resolve(null);
        chosen.text().then(function (text) {
          resolve({ text: text, name: chosen.name, handle: null });
        }, reject);
      }
      function onCancel() {
        cleanUp();
        resolve(null);
      }
      fileInput.addEventListener("change", onChange);
      fileInput.addEventListener("cancel", onCancel);
      fileInput.click();
    });
  }

  window.TF = window.TF || {};
  window.TF.savefile = {
    supportsHandles: supportsHandles,
    pickSave: pickSave,
    pickOpen: pickOpen,
    hasWritePermission: hasWritePermission,
    requestWritePermission: requestWritePermission,
    write: write,
    download: download
  };
})();
