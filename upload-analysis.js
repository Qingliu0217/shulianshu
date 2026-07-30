const uploadSection = document.createElement("section");
uploadSection.className = "upload-analysis";
uploadSection.innerHTML = `
  <div class="upload-head">
    <p class="kicker">基于原文分析</p>
    <h2>上传自己的电子书</h2>
    <p>文件只在你的浏览器中读取，不会作为电子书保存。系统仅把分段文字发送给 DeepSeek，提取有原文证据的书名。</p>
  </div>
  <div class="upload-box">
    <label class="file-picker">
      <strong id="file-label">选择电子书文件</strong>
      <span>支持 TXT、EPUB、DOCX 和文字型 PDF，最大 20 MB</span>
      <input id="ebook-file" type="file" accept=".txt,.epub,.docx,.pdf">
    </label>
    <label class="rights-check">
      <input id="rights-confirm" type="checkbox">
      <span>我确认该文件来源合法，并仅将其用于个人学习、研究或欣赏。</span>
    </label>
    <p class="privacy-note">不提供分享或下载；不用于模型训练；页面关闭后分析内容即消失。扫描图片式 PDF 暂不支持。</p>
    <button id="analyze-file" class="analyze-button" disabled>分析电子书</button>
    <div id="analysis-status" class="analysis-status" hidden></div>
    <div id="analysis-progress" class="analysis-progress" hidden><span></span></div>
  </div>`;
document.querySelector("#how").before(uploadSection);

const fileInput = document.querySelector("#ebook-file");
const rightsConfirm = document.querySelector("#rights-confirm");
const analyzeButton = document.querySelector("#analyze-file");
const fileLabel = document.querySelector("#file-label");
const statusBox = document.querySelector("#analysis-status");
const progressBox = document.querySelector("#analysis-progress");
const progressBar = progressBox.querySelector("span");
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 600000;
const CHUNK_SIZE = 45000;

function updateReady() {
  analyzeButton.disabled = !(fileInput.files[0] && rightsConfirm.checked);
}
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  fileLabel.textContent = file ? file.name : "选择电子书文件";
  updateReady();
});
rightsConfirm.addEventListener("change", updateReady);

const stripMarkup = (html) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((node) => node.remove());
  return (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
};
const xmlText = (xml) => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return [...doc.querySelectorAll("w\\:p, p")]
    .map((p) => [...p.querySelectorAll("w\\:t, t")].map((t) => t.textContent).join(""))
    .filter(Boolean)
    .join("\n");
};

async function parseFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (file.size > MAX_BYTES) throw new Error("文件超过 20 MB，请选择较小的文件。");
  if (ext === "txt") return [{ location: "全文", text: await file.text() }];
  if (ext === "docx") {
    const zip = await JSZip.loadAsync(file);
    const entry = zip.file("word/document.xml");
    if (!entry) throw new Error("无法读取 DOCX 正文。");
    return [{ location: "正文", text: xmlText(await entry.async("text")) }];
  }
  if (ext === "epub") {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir && /\.(xhtml|html|htm)$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    const sections = [];
    for (const entry of entries) {
      const text = stripMarkup(await entry.async("text"));
      if (text.length > 20) sections.push({ location: entry.name, text });
    }
    return sections;
  }
  if (ext === "pdf") {
    const pdfjs = await import("./vendor/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const sections = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(" ").trim();
      if (text) sections.push({ location: `第 ${pageNumber} 页`, text });
    }
    if (!sections.length) throw new Error("该 PDF 没有可读取的文字层，可能是扫描版。");
    return sections;
  }
  throw new Error("暂不支持这种文件格式。");
}

function makeChunks(sections) {
  let chunks = [], current = "", totalChars = 0;
  for (const section of sections) {
    let remaining = section.text;
    while (remaining && totalChars < MAX_TEXT) {
      const room = CHUNK_SIZE - current.length;
      const part = remaining.slice(0, room);
      if (!current) current = `[位置：${section.location}]\n`;
      current += part;
      remaining = remaining.slice(part.length);
      totalChars += part.length;
      if (current.length >= CHUNK_SIZE) {
        chunks.push(current);
        current = "";
      }
    }
    if (totalChars >= MAX_TEXT) break;
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

const normalizeKey = (value) => value.replace(/[《》〈〉\s·・]/g, "").toLowerCase();
function mergeMentions(groups) {
  const merged = new Map();
  groups.flat().forEach((item) => {
    const key = `${normalizeKey(item.title)}|${normalizeKey(item.author || "")}`;
    const existing = merged.get(key);
    if (!existing) merged.set(key, { ...item, count: 1 });
    else {
      existing.count += 1;
      if (existing.confidence !== "high" && item.confidence === "high") Object.assign(existing, item);
    }
  });
  return [...merged.values()].sort((a, b) => b.count - a.count).slice(0, 30);
}

function renderDocumentResults(file, mentions) {
  const target = document.querySelector("#results");
  target.hidden = false;
  if (!mentions.length) {
    target.innerHTML = `<div class="empty-state"><span class="empty-icon">0</span><div><p class="kicker">原文分析完成</p><h2>没有找到可验证的书名</h2><p>系统没有返回缺少原文证据的候选结果。</p></div></div>`;
    return;
  }
  const cards = mentions.map((item, index) => `<article class="book-card"><div class="cover cover-${(index % 4) + 1}"><span>${escapeHtml(item.category)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.author)}</small></div><div class="card-copy"><span class="number">${String(index + 1).padStart(2, "0")}</span><h3>《${escapeHtml(item.title)}》</h3><p class="author">${escapeHtml(item.author)} · ${item.confidence === "high" ? "原文证据明确" : "原文证据可核对"}</p><p class="note">${escapeHtml(item.location)}${item.count > 1 ? ` · 出现于 ${item.count} 个文本段` : ""}</p><blockquote class="evidence">“${escapeHtml(item.evidence)}”</blockquote><a href="${douban(item.title, item.author)}" target="_blank" rel="noreferrer">在豆瓣图书中查看 <span aria-hidden="true">↗</span></a></div></article>`).join("");
  target.innerHTML = `<div class="result-heading"><div><p class="kicker">电子书原文分析</p><h2>《${escapeHtml(file.name)}》中的书</h2><p>仅显示通过原文短句校验的结果。</p></div><div class="count"><strong>${mentions.length}</strong><span>本有据可查的作品</span></div></div><div class="book-grid">${cards}</div><p class="source-note">电子书未被保存；短摘录仅用于帮助你回到原文核对。</p>`;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

analyzeButton.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file || !rightsConfirm.checked) return;
  analyzeButton.disabled = true;
  statusBox.hidden = false;
  progressBox.hidden = false;
  progressBar.style.width = "2%";
  try {
    statusBox.textContent = "正在本地读取文件…";
    const sections = await parseFile(file);
    const chunks = makeChunks(sections);
    if (!chunks.length) throw new Error("没有读取到可分析的文字。");
    const groups = [];
    for (let i = 0; i < chunks.length; i += 1) {
      statusBox.textContent = `正在分析第 ${i + 1}/${chunks.length} 个文本段…`;
      progressBar.style.width = `${Math.round(((i + 0.2) / chunks.length) * 100)}%`;
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunk: chunks[i], index: i + 1, total: chunks.length, fileName: file.name }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `第 ${i + 1} 段分析失败`);
      groups.push(data.mentions || []);
    }
    progressBar.style.width = "100%";
    statusBox.textContent = "分析完成。文件没有被保存。";
    renderDocumentResults(file, mergeMentions(groups));
  } catch (error) {
    statusBox.textContent = error.message || "分析失败，请稍后重试。";
    progressBar.style.width = "0";
  } finally {
    analyzeButton.disabled = false;
  }
});
