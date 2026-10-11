// Vercel serverless function. Set OPENAI_API_KEY in the project's environment variables.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured' });
  const { school, field, criteria, question, answer } = req.body || {};
  if (![school, question, answer].every(v => typeof v === 'string' && v.trim())) return res.status(400).json({ error: 'Missing required fields' });
  if (answer.length > 6000) return res.status(413).json({ error: 'Answer is too long' });
  const prompt = `너는 한국 중학생의 마이스터고 면접 연습을 돕는 코치다. 학생을 평가해 합격 여부를 예측하지 말고, 답변을 개선하도록 구체적으로 돕는다.\n학교: ${school}\n분야: ${field || ''}\n공식 자료에 근거한 참고 정보(이 정보만 사용하고 부족한 점을 임의로 채우지 말 것): ${criteria || ''}\n질문: ${question}\n학생 답변: ${answer}\n\n규칙: 학생이 실제로 하지 않은 경험을 만들어 주지 말 것. 모범답안을 통째로 대신 써 주기보다 학생 자신의 경험을 구체화하는 피드백을 할 것. 학교의 공식 평가 기준이라고 단정하지 말 것. 존중하는 한국어로 답할 것. JSON만 반환: {"score":0~100 정수(연습용 완성도 점수),"headline":"한 줄 총평","strengths":["구체적인 강점 1-3개"],"improvements":["개선점 2-3개"],"followup":"학생이 스스로 답을 더 구체화하도록 돕는 후속 질문 1개","structure":"답변 구조 제안","caution":"점수는 연습용이며 공식 평가나 합격 예측이 아님을 알리는 문구"}`;
  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', input: prompt, text: { format: { type: 'json_object' } } })
    });
    const raw = await upstream.json();
    if (!upstream.ok) return res.status(502).json({ error: 'AI provider request failed' });
    let output = raw.output_text;
    if (!output && Array.isArray(raw.output)) output = raw.output.flatMap(x => x.content || []).map(x => x.text || '').join('');
    if (!output) return res.status(502).json({ error: 'No structured output returned' });
    return res.status(200).json(JSON.parse(output));
  } catch (e) { return res.status(500).json({ error: 'Unable to generate feedback' }); }
}
