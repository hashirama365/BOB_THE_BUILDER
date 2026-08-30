import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Lazily initialised — picks up env vars after dotenv loads
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;

  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL;

  if (!apiKey) throw new Error('LLM_API_KEY is not set in server/.env');
  if (!baseURL) throw new Error('LLM_BASE_URL is not set in server/.env');

  _client = new OpenAI({ apiKey, baseURL });
  return _client;
}

export async function callBob(messages: ChatMessage[]): Promise<string> {
  const model = process.env.LLM_MODEL ?? 'models/gemini-2.0-flash';

  const completion = await getClient().chat.completions.create({
    model,
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from LLM');
  return content;
}
