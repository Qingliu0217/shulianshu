const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const clean = (value, length) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";

function parseJson(content) {
  return JSON.parse(
    content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
}

module.exports = async function handler(req, res) {
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
        temperature: 0.1,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是严谨的中文图书研究助理。任务是整理用户所给书籍正文、序言、注释或参考文献中明确提到的其他书籍。真实性优先于数量。绝对禁止为了达到数量要求而编造书名、作者、提及语境或引用位置；绝对禁止把主题相似、同一作者或常被一起推荐的作品冒充为原书提及。只有具备充分把握的项目才可列入；不确定时宁可少列、降低 confidence，或返回空数组。只输出合法 JSON。",
          },
          {
            role: "user",
            content: `查询《${title}》。返回 JSON：{"book":{"title":"规范书名","author":"作者","intro":"一句话简介"},"mentions":[{"title":"被提及书名","author":"作者或未知","category":"文学/历史/哲学/科学/社科/其他","note":"原书中的提及语境；无法确认具体位置时必须如实说明","confidence":"high|medium|low"}],"notice":"数据说明"}。在有充分可靠信息的前提下，目标返回 15 至 30 本，最多 30 本；这只是目标，不是最低要求。若可靠结果不足 15 本，只返回能够确认的数量，严禁凑数。只列书籍，去重，不列电影、论文、人物或仅仅相关的推荐作品。没有可靠结果时 mentions 必须返回空数组。`,
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
          .slice(0, 30)
      : [];

    return res.status(200).json({
      book: {
        title: clean(parsed.book?.title, 100) || title,
        author: clean(parsed.book?.author, 100) || "作者未知",
        intro: clean(parsed.book?.intro, 240),
      },
      mentions,
      notice:
        clean(parsed.notice, 240) ||
        "结果由 AI 根据公开知识谨慎整理；可靠信息不足时不会为了数量补充作品，建议结合原书目录、注释或参考文献复核。",
    });
  } catch (error) {
    return res.status(500).json({
      error:
        error?.name === "AbortError"
          ? "检索超时，请稍后重试"
          : "检索失败，请稍后重试",
    });
  } finally {
    clearTimeout(timer);
  }
}
