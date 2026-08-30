interface ChatMessage {
  role: string;
  content: string;
}

interface ChatChoice {
  message: {
    role: string;
    content: string;
  };
}

interface ChatCompletionResponse {
  choices: ChatChoice[];
}

export async function callBob(messages: ChatMessage[]): Promise<string> {
  const url = process.env.BOB_INFERENCE_URL;
  const apiKey = process.env.BOB_API_KEY;
  const model = process.env.BOB_MODEL ?? 'auto';

  const response = await fetch(url!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bob API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  return data.choices[0].message.content;
}
