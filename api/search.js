const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const clean = (value, length) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";

function parseJson(content) {
  return JSON.parse(
    content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "仅支持 POST 请求" });
  }
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({ error: "服务尚未配置 DeepSeek API 密钥" });
  }
  const title = clean(req.body?.title, 80);
  if (!title) return res.status(400).json({ error: "请输入书名" });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是严谨的中文图书研究助理。整理用户所给书籍正文、序言、注释或参考文献中明确提到的其他书籍。不要把仅仅主题相似的作品冒充为书中提及。无法确认时降低 confidence 并在 note 中说明。只输出合法 JSON。",
          },
          {
            role: "user",
            content: `查询《${title}》。返回 JSON：{"book":{"title":"规范书名","author":"作者","intro":"一句话简介"},"mentions":[{"title":"被提及书名","author":"作者或未知","category":"文学/历史/哲学/科学/社科/其他","note":"提及语境，无法确认具体位置时如实说明","confidence":"high|medium|low"}],"notice":"数据说明"}。尽量给出 10 至 20 本；只列书籍，去重，不要列电影、论文或人物；没有可靠结果时 mentions 返回空数组。`,
          },
        ],
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.error?.message || "DeepSeek 服务暂时不可用",
      });
    }
    const parsed = parseJson(payload.choices?.[0]?.message?.content || "{}");
    const mentions = Array.isArray(parsed.mentions)
      ? parsed.mentions
          .map((item) => ({
            title: clean(item?.title, 100),
            author: clean(item?.author, 100) || "作者未知",
            category: clean(item?.category, 20) || "其他",
            note: clean(item?.note, 240) || "书中曾提及该作品",
            confidence: ["high", "medium", "low"].includes(item?.confidence)
              ? item.confidence
              : "medium",
          }))
          .filter((item) => item.title)
          .slice(0, 24)
      : [];
    return res.status(200).json({
      book: {
        title: clean(parsed.book?.title, 100) || title,
        author: clean(parsed.book?.author, 100) || "作者未知",
        intro: clean(parsed.book?.intro, 240),
      },
      mentions,
      notice: clean(parsed.notice, 240) || "结果由 AI 根据公开知识整理，建议结合原书目录、注释或参考文献复核。",
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.name === "AbortError" ? "检索超时，请稍后重试" : "检索失败，请稍后重试",
    });
  } finally {
    clearTimeout(timer);
  }
}
