/**
 * POST /api/generate-flow
 *
 * Accepts { goal: string } and returns an AI-generated NVIDIA service path
 * using Groq's Llama model. Only uses official NVIDIA service IDs.
 *
 * Requires GROQ_API_KEY in .env.local
 */

import Groq from 'groq-sdk';
import { NextResponse } from 'next/server';
import { NVIDIA_SERVICES } from '@/data/nvidia';

export async function POST(request: Request) {
  const { goal } = (await request.json()) as { goal: string };

  if (!goal?.trim()) {
    return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GROQ_API_KEY not set in environment' },
      { status: 500 },
    );
  }

  const groq = new Groq({ apiKey });

  const serviceList = NVIDIA_SERVICES.map(
    (s) => `  - id: "${s.id}" | ${s.name} (${s.layer}) — ${s.shortDescription}`,
  ).join('\n');

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an expert NVIDIA AI solutions architect. Given a user's goal, generate the ideal step-by-step path through NVIDIA's AI ecosystem.

AVAILABLE SERVICES (use ONLY these exact IDs):
${serviceList}

OUTPUT: Strictly valid JSON only, no markdown, no explanation.
{
  "steps": [
    {
      "serviceId": "<exact id from list>",
      "role": "<3-6 word role label>",
      "action": "<1-2 sentence practical instruction specific to this goal>"
    }
  ]
}

RULES:
• Only use service IDs exactly as listed — no others
• 2–6 steps — include only what genuinely serves this goal
• Natural order: access → sdk → framework → agent → serving → enterprise (skip layers not needed)
• Steps may skip layers — connect directly if that's the real path
• Actions must be goal-specific and practical, not generic`,
        },
        { role: 'user', content: goal },
      ],
      temperature: 0.2,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(text) as {
      steps?: Array<{ serviceId: string; role: string; action: string }>;
    };

    // Validate all service IDs are real
    const validIds = new Set(NVIDIA_SERVICES.map((s) => s.id));
    const validSteps = (parsed.steps ?? []).filter((s) => validIds.has(s.serviceId));

    if (validSteps.length === 0) {
      return NextResponse.json(
        { error: 'Could not generate a valid path — try rephrasing your goal' },
        { status: 422 },
      );
    }

    return NextResponse.json({ goal, steps: validSteps });
  } catch (err) {
    console.error('[generate-flow] Groq error:', err);
    return NextResponse.json({ error: 'AI generation failed' }, { status: 500 });
  }
}
