const examples = ["如何阅读一本书", "人类简史", "百年孤独"];
const results = document.querySelector("#results");
const how = document.querySelector("#how");
const input = document.querySelector("#book-search");
const submitButton = document.querySelector("#search-form button[type=submit]");
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[char]);
const douban = (title, author) => `https://search.douban.com/book/subject_search?search_text=${encodeURIComponent(`${title} ${author}`)}&cat=1001`;
const confidenceText = { high: "较高把握", medium: "有待复核", low: "线索较弱" };

function showLoading(title) {
  results.hidden = false;
  how.hidden = true;
  results.innerHTML = `<div class="empty-state"><span class="empty-icon">…</span><div><p class="kicker">正在检索</p><h2>正在翻找《${escapeHtml(title)}》里的书</h2><p>DeepSeek 正在整理引用与提及记录，通常需要十几秒。</p></div></div>`;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}
function showError(title, message) {
  results.innerHTML = `<div class="empty-state"><span class="empty-icon">！</span><div><p class="kicker">暂时没有结果</p><h2>《${escapeHtml(title)}》检索失败</h2><p>${escapeHtml(message)}</p></div></div>`;
}
function showResults(data) {
  const book = data.book || {};
  const mentions = Array.isArray(data.mentions) ? data.mentions : [];
  if (!mentions.length) return showError(book.title || input.value, "没有找到足够可靠的书中提及记录。可以检查书名后重试。");
  const cards = mentions.map((item, index) => `<article class="book-card"><div class="cover cover-${(index % 4) + 1}"><span>${escapeHtml(item.category)}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.author)}</small></div><div class="card-copy"><span class="number">${String(index + 1).padStart(2, "0")}</span><h3>《${escapeHtml(item.title)}》</h3><p class="author">${escapeHtml(item.author)} · ${escapeHtml(confidenceText[item.confidence] || confidenceText.medium)}</p><p class="note">${escapeHtml(item.note)}</p><a href="${douban(item.title, item.author)}" target="_blank" rel="noreferrer">在豆瓣图书中查看 <span aria-hidden="true">↗</span></a></div></article>`).join("");
  results.innerHTML = `<div class="result-heading"><div><p class="kicker">AI 实时检索结果</p><h2>《${escapeHtml(book.title)}》里的书</h2><p>${escapeHtml(book.author)}${book.intro ? ` · ${escapeHtml(book.intro)}` : ""}</p></div><div class="count"><strong>${mentions.length}</strong><span>本关联作品</span></div></div><div class="book-grid">${cards}</div><p class="source-note">${escapeHtml(data.notice || "结果由 AI 整理，请结合原书复核。")} 豆瓣按钮会打开对应书名与作者的搜索页。</p>`;
}
async function search(raw) {
  const title = raw.trim();
  if (!title) return;
  input.value = title;
  submitButton.disabled = true;
  submitButton.textContent = "检索中…";
  showLoading(title);
  try {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "服务暂时不可用，请稍后重试");
    showResults(data);
  } catch (error) {
    showError(title, error.message || "服务暂时不可用，请稍后重试");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = '查找书中之书 <span aria-hidden="true">→</span>';
  }
}
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  search(input.value);
});
document.querySelectorAll("[data-example]").forEach((button, index) => {
  button.dataset.example = examples[index];
  button.textContent = examples[index];
  button.addEventListener("click", () => search(button.dataset.example));
});
