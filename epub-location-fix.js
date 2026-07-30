const originalParseFile = window.parseFile;

const normalizeArchivePath = (base, href) => {
  try {
    return decodeURIComponent(
      new URL(href, `https://ebook.local/${base}`).pathname.slice(1),
    );
  } catch {
    return `${base}${href}`.replace(/\/+/g, "/");
  }
};

const epubDocument = (source) =>
  new DOMParser().parseFromString(source, "application/xml");

const epubSection = (source, fallback) => {
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script,style,noscript").forEach((node) => node.remove());
  const heading =
    doc.querySelector("h1,h2,h3")?.textContent?.replace(/\s+/g, " ").trim() ||
    doc.querySelector("title")?.textContent?.replace(/\s+/g, " ").trim() ||
    fallback;
  const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
  return { location: heading, text };
};

async function parseEpubWithChapters(file) {
  const zip = await JSZip.loadAsync(file);
  const containerEntry = zip.file("META-INF/container.xml");
  let orderedPaths = [];

  if (containerEntry) {
    const container = epubDocument(await containerEntry.async("text"));
    const rootfile = container.getElementsByTagNameNS("*", "rootfile")[0];
    const packagePath = rootfile?.getAttribute("full-path");
    const packageEntry = packagePath ? zip.file(packagePath) : null;

    if (packageEntry) {
      const packageDoc = epubDocument(await packageEntry.async("text"));
      const base = packagePath.includes("/")
        ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1)
        : "";
      const manifest = new Map(
        [...packageDoc.getElementsByTagNameNS("*", "item")].map((item) => [
          item.getAttribute("id"),
          item.getAttribute("href"),
        ]),
      );
      orderedPaths = [...packageDoc.getElementsByTagNameNS("*", "itemref")]
        .map((item) => manifest.get(item.getAttribute("idref")))
        .filter(Boolean)
        .map((href) => normalizeArchivePath(base, href));
    }
  }

  if (!orderedPaths.length) {
    orderedPaths = Object.values(zip.files)
      .filter((entry) => !entry.dir && /\.(xhtml|html|htm)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  }

  const sections = [];
  for (const [index, path] of orderedPaths.entries()) {
    const entry = zip.file(path) || zip.file(encodeURI(path));
    if (!entry) continue;
    const section = epubSection(await entry.async("text"), `第 ${index + 1} 章`);
    if (section.text.length > 20) sections.push(section);
  }
  if (!sections.length) throw new Error("无法读取 EPUB 正文章节。");
  return sections;
}

window.parseFile = async function parseFileWithBetterLocations(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "epub") return parseEpubWithChapters(file);
  return originalParseFile(file);
};
