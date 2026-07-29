const resultArea = document.querySelector("#results");

function separateMetadata() {
  resultArea.querySelectorAll(".author:not([data-separated])").forEach((line) => {
    const [author, confidence] = line.textContent.split(" · ");
    if (!confidence) return;
    line.textContent = "";
    line.dataset.separated = "true";

    const authorName = document.createElement("span");
    authorName.className = "author-name";
    authorName.textContent = author;

    const confidenceBadge = document.createElement("span");
    confidenceBadge.className = "confidence-badge";
    confidenceBadge.textContent = confidence;

    line.append(authorName, confidenceBadge);
  });
}

new MutationObserver(separateMetadata).observe(resultArea, {
  childList: true,
  subtree: true,
});
