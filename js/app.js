import { parseChapters } from "./chapters.js";
import { formatEditor, insertPunctuation } from "./editor.js";
import { findMatches, renderHighlightedText } from "./search.js";
import { deleteBook, getBook, listBooks, loadSettings, putBook, saveSettings } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  home: $("#home-view"), reader: $("#reader-view"), list: $("#book-list"), empty: $("#empty-library"),
  count: $("#book-count"), fileInput: $("#file-input"), folderInput: $("#folder-input"), folderButton: $("#folder-button"),
  handleButton: $("#handle-button"), capability: $("#capability-note"), title: $("#reader-title"), status: $("#save-status"),
  scroller: $("#reading-scroller"), content: $("#reading-content"), editor: $("#text-editor"), editorToolbar: $("#editor-toolbar"),
  chapterDrawer: $("#chapter-drawer"), chapterList: $("#chapter-list"), scrim: $("#overlay-scrim"), settingsSheet: $("#settings-sheet"),
  searchPanel: $("#search-panel"), searchInput: $("#search-input"), searchCount: $("#search-count"), modeButton: $("#mode-button"),
  fontSize: $("#font-size"), fontSizeValue: $("#font-size-value"), toast: $("#toast"), saveButton: $("#save-button"),
};

const state = {
  book: null, chapters: [], mode: "read", dirty: false, matches: [], matchIndex: -1,
  settings: loadSettings(), progressTimer: 0, editTimer: 0,
};

function createId(file) {
  return `${file.name}:${file.size}:${file.lastModified || 0}:${crypto.randomUUID?.() || Date.now()}`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { elements.toast.hidden = true; }, 2400);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(timestamp);
}

function decodeFile(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes), encoding: "utf-16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes), encoding: "utf-16be" };
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  try { return { text: utf8.decode(bytes), encoding: "utf-8" }; } catch { /* try GB family */ }
  try { return { text: new TextDecoder("gb18030").decode(bytes), encoding: "gb18030" }; }
  catch { return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8-replacement" }; }
}

async function importFile(file, fileHandle = null) {
  if (!file.name.toLocaleLowerCase().endsWith(".txt") && file.type && file.type !== "text/plain") return false;
  const decoded = decodeFile(await file.arrayBuffer());
  const now = Date.now();
  await putBook({
    id: createId(file), name: file.name.replace(/\.txt$/i, ""), filename: file.name, text: decoded.text,
    encoding: decoded.encoding, size: file.size, relativePath: file.webkitRelativePath || "", fileHandle,
    importedAt: now, updatedAt: now, lastOpenedAt: now, progress: { ratio: 0, position: 0 },
  });
  return true;
}

async function importFiles(files) {
  let imported = 0;
  for (const file of Array.from(files)) imported += await importFile(file) ? 1 : 0;
  navigator.storage?.persist?.().catch(() => false);
  await renderLibrary();
  showToast(imported ? `已导入 ${imported} 本书` : "没有找到 TXT 文件");
}

async function renderLibrary() {
  const books = await listBooks();
  elements.count.textContent = `${books.length} 本`;
  elements.empty.hidden = books.length > 0;
  const fragment = document.createDocumentFragment();
  books.forEach((book) => {
    const item = document.createElement("article");
    item.className = "book-item";
    const open = document.createElement("button");
    open.className = "book-open";
    open.type = "button";
    const monogram = document.createElement("span");
    monogram.className = "book-monogram"; monogram.setAttribute("aria-hidden", "true"); monogram.textContent = book.name.slice(0, 1);
    const info = document.createElement("span"); info.className = "book-info";
    const name = document.createElement("strong"); name.textContent = book.name;
    const details = document.createElement("small"); info.append(name, details); open.append(monogram, info);
    const percent = Math.round((book.progress?.ratio || 0) * 100);
    details.textContent = `${percent ? `已读 ${percent}% · ` : ""}${formatDate(book.lastOpenedAt || book.importedAt)}`;
    open.addEventListener("click", () => openBook(book.id));
    const remove = document.createElement("button");
    remove.className = "delete-button"; remove.type = "button"; remove.textContent = "删除";
    remove.setAttribute("aria-label", `删除《${book.name}》`);
    remove.addEventListener("click", async () => {
      if (!confirm(`从本地书库删除《${book.name}》？原始文件不会被删除。`)) return;
      await deleteBook(book.id); await renderLibrary();
    });
    item.append(open, remove); fragment.append(item);
  });
  elements.list.replaceChildren(fragment);
}

function applyThemeAndFont() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--reader-font-size", `${state.settings.fontSize}px`);
  elements.fontSize.value = state.settings.fontSize;
  elements.fontSizeValue.textContent = `${state.settings.fontSize}px`;
  $("#light-theme").classList.toggle("active", state.settings.theme === "light");
  $("#dark-theme").classList.toggle("active", state.settings.theme === "dark");
  document.querySelector('meta[name="theme-color"]').content = state.settings.theme === "dark" ? "#171816" : "#f4efe5";
}

function renderReadingContent() {
  const query = elements.searchInput.value;
  const active = state.matches[state.matchIndex] ?? -1;
  if (query) state.matches = renderHighlightedText(elements.content, state.book.text, query, active, state.matches);
  else elements.content.textContent = state.book.text;
  elements.searchCount.textContent = `${state.matches.length} 项`;
}

function renderChapters() {
  const fragment = document.createDocumentFragment();
  const parents = [];
  state.chapters.forEach((chapter) => {
    while (parents.length && parents.at(-1).level >= chapter.level) parents.pop();
    const item = document.createElement("li");
    item.className = ["volume", "chapter", "section"][chapter.level];
    const button = document.createElement("button");
    button.type = "button"; button.textContent = chapter.title;
    button.addEventListener("click", () => { jumpToPosition(chapter.position); closeOverlays(); });
    item.append(button);
    const parent = parents.at(-1);
    if (parent) {
      if (!parent.children) {
        parent.children = document.createElement("ol");
        parent.item.append(parent.children);
      }
      parent.children.append(item);
    } else {
      fragment.append(item);
    }
    parents.push({ level: chapter.level, item, children: null });
  });
  if (!state.chapters.length) {
    const empty = document.createElement("li"); empty.className = "drawer-empty"; empty.textContent = "未识别到章节"; fragment.append(empty);
  }
  elements.chapterList.replaceChildren(fragment);
}

async function openBook(id) {
  state.book = await getBook(id);
  if (!state.book) return;
  state.book.lastOpenedAt = Date.now();
  state.chapters = parseChapters(state.book.text);
  state.mode = "read"; state.dirty = false; state.matches = []; state.matchIndex = -1;
  elements.title.textContent = state.book.name;
  elements.searchInput.value = "";
  elements.home.hidden = true; elements.reader.hidden = false;
  setMode("read"); renderReadingContent(); renderChapters();
  requestAnimationFrame(() => {
    const max = elements.scroller.scrollHeight - elements.scroller.clientHeight;
    elements.scroller.scrollTop = Math.round(max * (state.book.progress?.ratio || 0));
  });
  await putBook(state.book);
  history.pushState({ bookId: id }, "", `#book=${encodeURIComponent(id)}`);
}

function jumpToPosition(position) {
  if (state.mode === "edit") {
    elements.editor.focus(); elements.editor.setSelectionRange(position, position);
    const ratio = position / Math.max(1, state.book.text.length);
    elements.editor.scrollTop = ratio * (elements.editor.scrollHeight - elements.editor.clientHeight);
    return;
  }
  const ratio = position / Math.max(1, state.book.text.length);
  elements.scroller.scrollTo({ top: ratio * (elements.scroller.scrollHeight - elements.scroller.clientHeight), behavior: "smooth" });
}

async function persistBook() {
  if (!state.book) return;
  state.book.text = state.mode === "edit" ? elements.editor.value : state.book.text;
  state.book.updatedAt = Date.now();
  await putBook(state.book); state.dirty = false;
  elements.status.textContent = "已保存到本地书库";
}

function scheduleLocalSave() {
  state.dirty = true; elements.status.textContent = "正在保存本地副本…";
  clearTimeout(state.editTimer); state.editTimer = setTimeout(persistBook, 500);
}

function updateProgress() {
  if (!state.book || state.mode !== "read") return;
  const book = state.book;
  clearTimeout(state.progressTimer);
  state.progressTimer = setTimeout(async () => {
    if (!state.book || state.book.id !== book.id || state.mode !== "read") return;
    const max = Math.max(1, elements.scroller.scrollHeight - elements.scroller.clientHeight);
    const ratio = Math.max(0, Math.min(1, elements.scroller.scrollTop / max));
    book.progress = { ratio, position: Math.round(book.text.length * ratio) };
    await putBook(book);
  }, 300);
}

function setMode(mode) {
  const wasEditing = state.mode === "edit";
  const editing = mode === "edit";
  if (editing) elements.editor.value = state.book.text;
  else if (wasEditing) {
    state.book.text = elements.editor.value;
    state.chapters = parseChapters(state.book.text);
    renderChapters();
    renderReadingContent();
  }
  state.mode = mode;
  elements.scroller.hidden = editing; elements.editor.hidden = !editing; elements.editorToolbar.hidden = !editing;
  elements.modeButton.querySelector("b").textContent = editing ? "阅读" : "编辑";
  elements.modeButton.querySelector("span").textContent = editing ? "▤" : "✎";
  closeOverlays();
}

function closeOverlays() {
  elements.chapterDrawer.hidden = true; elements.settingsSheet.hidden = true; elements.scrim.hidden = true;
}

function openOverlay(element) {
  closeOverlays(); element.hidden = false; elements.scrim.hidden = false;
}

async function exportOrOverwrite() {
  if (state.mode === "edit") state.book.text = elements.editor.value;
  const localSave = persistBook();
  const blob = new Blob([state.book.text], { type: "text/plain;charset=utf-8" });
  const handle = state.book.fileHandle;
  if (handle?.createWritable) {
    try {
      const permission = await handle.queryPermission?.({ mode: "readwrite" });
      if (permission === "granted" || await handle.requestPermission?.({ mode: "readwrite" }) === "granted") {
        const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); await localSave;
        showToast("已写回原文件"); return;
      }
    } catch { /* export fallback */ }
  }
  const file = new File([blob], state.book.filename || `${state.book.name}.txt`, { type: blob.type });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: state.book.name }); await localSave; showToast("已打开系统分享"); return; }
    catch (error) { if (error.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = file.name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  await localSave;
  showToast("已导出新的 TXT 文件");
}

function navigateHome(push = true) {
  clearTimeout(state.progressTimer);
  persistBook(); state.book = null; elements.reader.hidden = true; elements.home.hidden = false; closeOverlays();
  renderLibrary(); if (push) history.pushState({}, "", location.pathname);
}

function updateSearch() {
  state.matches = findMatches(state.book.text, elements.searchInput.value);
  state.matchIndex = state.matches.length ? 0 : -1; renderReadingContent(); jumpActiveMatch();
}

function jumpActiveMatch() {
  const position = state.matches[state.matchIndex];
  if (position == null) return;
  renderReadingContent();
  elements.content.querySelector(`mark[data-position="${position}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function bindEvents() {
  $("#import-button").addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", (event) => importFiles(event.target.files).finally(() => { event.target.value = ""; }));
  elements.folderButton.addEventListener("click", () => elements.folderInput.click());
  elements.folderInput.addEventListener("change", (event) => importFiles(event.target.files).finally(() => { event.target.value = ""; }));
  elements.handleButton.addEventListener("click", async () => {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [{ description: "TXT 文本", accept: { "text/plain": [".txt"] } }] });
      await importFile(await handle.getFile(), handle); await renderLibrary(); showToast("已导入，可在授权有效时写回原文件");
    } catch (error) { if (error.name !== "AbortError") showToast("无法打开文件"); }
  });
  $("#back-button").addEventListener("click", () => navigateHome());
  elements.saveButton.addEventListener("click", exportOrOverwrite);
  $("#chapters-button").addEventListener("click", () => openOverlay(elements.chapterDrawer));
  $("#settings-button").addEventListener("click", () => openOverlay(elements.settingsSheet));
  $("#chapter-close").addEventListener("click", closeOverlays); elements.scrim.addEventListener("click", closeOverlays);
  $("#search-button").addEventListener("click", () => { elements.searchPanel.hidden = false; elements.searchInput.focus(); });
  $("#search-close").addEventListener("click", () => { elements.searchPanel.hidden = true; elements.searchInput.value = ""; state.matches = []; renderReadingContent(); });
  elements.searchInput.addEventListener("input", updateSearch);
  $("#search-next").addEventListener("click", () => { if (state.matches.length) state.matchIndex = (state.matchIndex + 1) % state.matches.length; jumpActiveMatch(); });
  $("#search-prev").addEventListener("click", () => { if (state.matches.length) state.matchIndex = (state.matchIndex - 1 + state.matches.length) % state.matches.length; jumpActiveMatch(); });
  elements.modeButton.addEventListener("click", async () => { if (state.mode === "edit") await persistBook(); setMode(state.mode === "read" ? "edit" : "read"); });
  elements.editor.addEventListener("input", scheduleLocalSave);
  $("#format-button").addEventListener("click", () => { if (confirm("统一段落缩进和空行？可使用浏览器撤销恢复。")) formatEditor(elements.editor); });
  document.querySelectorAll(".punctuation").forEach((button) => button.addEventListener("click", () => insertPunctuation(elements.editor, button.dataset.value)));
  elements.scroller.addEventListener("scroll", updateProgress, { passive: true });
  elements.fontSize.addEventListener("input", () => { state.settings.fontSize = Number(elements.fontSize.value); saveSettings(state.settings); applyThemeAndFont(); });
  $("#light-theme").addEventListener("click", () => { state.settings.theme = "light"; saveSettings(state.settings); applyThemeAndFont(); });
  $("#dark-theme").addEventListener("click", () => { state.settings.theme = "dark"; saveSettings(state.settings); applyThemeAndFont(); });
  window.addEventListener("popstate", () => { if (!location.hash && !elements.reader.hidden) navigateHome(false); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { updateProgress(); persistBook(); } });
}

async function initialize() {
  applyThemeAndFont(); bindEvents();
  const supportsDirectory = "webkitdirectory" in elements.folderInput;
  if (!supportsDirectory) {
    elements.folderInput.removeAttribute("webkitdirectory");
    elements.folderButton.textContent = "选择多个 TXT 文件";
    elements.capability.textContent = "当前浏览器不支持文件夹选择，已自动切换为多文件选择。";
  } else elements.capability.textContent = "外部文件仅在你主动选择时读取。";
  elements.handleButton.hidden = !("showOpenFilePicker" in window);
  await renderLibrary();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

initialize().catch((error) => { console.error(error); showToast("本地书库初始化失败，请检查浏览器存储权限"); });
