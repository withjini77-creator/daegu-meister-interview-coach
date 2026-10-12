
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured'
    });
  }

  const { school, field, criteria, question, answer } = req.body || {};

  if (
    typeof school !== 'string' ||
    typeof question !== 'string' ||
    typeof answer !== 'string' ||
    !school.trim() ||
    !question.trim() ||
    !answer.trim()
  ) {
    return res.status(400).json({ error: '학교, 질문, 답변을 확인해 주세요.' });
  }

  if (answer.length > 6000) {
    return res.status(413).json({ error: '답변이 너무 깁니다.' });
  }

  const prompt = `
너는 한국 중학생의 마이스터고 면접 연습을 돕는 코치다.
합격 여부를 예측하지 말고 답변을 개선하도록 구체적으로 돕는다.

학교: ${school}
분야: ${field || ''}
참고 정보: ${criteria || ''}
질문: ${question}
학생 답변: ${answer}

규칙:
- 학생이 하지 않은 경험을 만들어 주지 말 것.
- 학생 자신의 경험을 구체화하도록 피드백할 것.
- 참고 정보가 부족하면 임의로 채우지 말 것.
- 공식 평가 기준이나 합격 예측이라고 단정하지 말 것.
- 존중하는 한국어로 답할 것.
- score는 연습용 완성도 점수이며 0~100 사이의 정수다.
- JSON 객체만 반환할 것.

다음 필드를 포함할 것:
{
  "score": 0,
  "headline": "한 줄 총평",
  "strengths": ["구체적인 강점"],
  "improvements": ["개선점"],
  "followup": "답변을 구체화하는 후속 질문",
  "structure": "답변 구조 제안",
  "caution": "연습용 점수이며 공식 평가나 합격 예측이 아니라는 안내"
}`;

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }] }
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
      console.error(
        'Gemini API error:',
        raw.error?.message || upstream.status
      );

      return res.status(502).json({
        error: 'AI provider request failed'
      });
    }

    const output = raw.candidates?.[0]?.content?.parts
      ?.map(part => part.text || '')
      .join('');

    if (!output) {
      return res.status(502).json({
        error: 'AI 응답을 받지 못했습니다.'
      });
    }

    return res.status(200).json(JSON.parse(output));
  } catch (error) {
    console.error('Feedback generation failed:', error.message);

    return res.status(500).json({
      error: '피드백 생성 중 오류가 발생했습니다.'
    });
  }
}
