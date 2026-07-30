const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MAX_CHARS = 52000;

const clean = (value, length) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";
const normalized = (value) => clean(value, 60000).replace(/\s+/g, "");

function parseJson(content) {
  return JSON.parse(
    content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求" });
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({ error: "服务尚未配置 DeepSeek API 密钥" });
  }

  const chunk = clean(req.body?.chunk, MAX_CHARS);
  const fileName = clean(req.body?.fileName, 120);
  const index = Number(req.body?.index) || 1;
  const total = Number(req.body?.total) || 1;
  if (chunk.length < 30) return res.status(400).json({ error: "文本内容不足" });

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
        temperature: 0,
        max_tokens: 2500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是严格的原文信息抽取程序。只能提取输入文本中明确出现的书籍、著作或典籍名称。不得凭常识补充，不得联想推荐，不得推断未出现的作品。每项 evidence 必须逐字复制输入中的短句，必须包含该书名；无法提供原文证据就不得输出。作品作者只有在输入文本明确给出时才填写，否则写“作者未知”。只输出合法 JSON。",
          },
          {
            role: "user",
            content: `文件：${fileName}，文本批次 ${index}/${total}。返回 {"mentions":[{"title":"原文明确出现的书名","author":"原文明示的作者或作者未知","category":"文学/历史/哲学/科学/社科/宗教/其他","evidence":"包含书名的原文短句，逐字复制，最多100字","location":"采用文本中最近的[位置：...]标记","confidence":"high|medium"}]}。没有明确书名则返回空数组。以下是原文：\n\n${chunk}`,
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
    const source = normalized(chunk);
    const mentions = Array.isArray(parsed.mentions)
      ? parsed.mentions
          .map((item) => ({
            title: clean(item?.title, 100),
            author: clean(item?.author, 100) || "作者未知",
            category: clean(item?.category, 20) || "其他",
            evidence: clean(item?.evidence, 120),
            location: clean(item?.location, 100) || `文本批次 ${index}`,
            confidence: item?.confidence === "high" ? "high" : "medium",
          }))
          .filter((item) => {
            const evidence = normalized(item.evidence);
            const title = normalized(item.title);
            return title && evidence && source.includes(evidence) && evidence.includes(title);
          })
          .slice(0, 30)
      : [];
    return res.status(200).json({ mentions });
  } catch (error) {
    return res.status(500).json({
      error: error?.name === "AbortError" ? "本段分析超时" : "本段分析失败",
    });
  } finally {
    clearTimeout(timer);
  }
}
