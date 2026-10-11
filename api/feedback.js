```javascript
// Vercel serverless function using Google Gemini API.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured'
    });
  }

  const { school, field, criteria, question, answer } = req.body || {};

  if (![school, question, answer].every(
    v => typeof v === 'string' && v.trim()
  )) {
    return res.status(400).json({
      error: 'Missing required fields'
    });
  }

  if (answer.length > 6000) {
    return res.status(413).json({
      error: 'Answer is too long'
    });
  }

  const prompt = `너는 한국 중학생의 마이스터고 면접 연습을 돕는 코치다.
학생을 평가해 합격 여부를 예측하지 말고, 답변을 개선하도록 구체적으로 돕는다.

학교: ${school}
분야: ${field || ''}
참고 정보: ${criteria || ''}
질문: ${question}
학생 답변: ${answer}

규칙:
- 학생이 실제로 하지 않은 경험을 만들어 주지 말 것.
- 모범답안을 통째로 대신 써 주기보다 학생 자신의 경험을 구체화하는 피드백을 할 것.
- 참고 정보가 부족하면 임의로 채우지 말 것.
- 학교의 공식 평가 기준이라고 단정하지 말 것.
- 존중하는 한국어로 답할 것.
- score는 0~100 사이의 정수이며 연습용 완성도 점수임.
- JSON 객체만 반환할 것.

반드시 다음 필드를 포함할 것:
{
  "score": 0,
  "headline": "한 줄 총평",
  "strengths": ["구체적인 강점 1~3개"],
  "improvements": ["개선점 2~3개"],
  "followup": "학생이 스스로 답을 구체화하도록 돕는 후속 질문 1개",
  "structure": "답변 구조 제안",
  "caution": "점수는 연습용이며 공식 평가나 합격 예측이 아님을 알리는 문구"
}`;

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                score: { type: 'INTEGER' },
                headline: { type: 'STRING' },
                strengths: {
                  type: 'ARRAY',
                  items: { type: 'STRING' }
                },
                improvements: {
                  type: 'ARRAY',
                  items: { type: 'STRING' }
                },
                followup: { type: 'STRING' },
                structure: { type: 'STRING' },
                caution: { type: 'STRING' }
              },
              required: [
                'score',
                'headline',
                'strengths',
                'improvements',
                'followup',
                'structure',
                'caution'
              ]
            }
          }
        })
      }
    );

    const raw = await upstream.json();

    if (!upstream.ok) {
      // 오류 원인을 확인하되 API 키는 기록하지 않음
      console.error(
        'Gemini API error:',
        upstream.status,
        raw.error?.message || 'Unknown provider error'
      );

      return res.status(502).json({
        error: 'AI provider request failed',
        detail: raw.error?.message || 'Gemini API request failed'
      });
    }

    const output = raw.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('');

    if (!output) {
      console.error(
        'Gemini returned no output:',
        JSON.stringify(raw.promptFeedback || {})
      );

      return res.status(502).json({
        error: 'No structured output returned'
      });
    }

    return res.status(200).json(JSON.parse(output));

  } catch (e) {
    console.error(
      'Feedback generation failed:',
      e.message
    );

    return res.status(500).json({
      error: 'Unable to generate feedback'
    });
  }
}
```
