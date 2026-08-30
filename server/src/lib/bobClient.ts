import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Lazily initialised — picks up env vars after dotenv loads
let _client: OpenAI | null = null;

function getClient(): { client: OpenAI; model: string } {
  let apiKey = process.env.LLM_API_KEY;
  let baseURL = process.env.LLM_BASE_URL;
  let model = process.env.LLM_MODEL;

  if (!apiKey) {
    if (process.env.GEMINI_API_KEY) {
      apiKey = process.env.GEMINI_API_KEY;
      baseURL = baseURL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
      model = model || 'models/gemini-2.5-flash';
    } else if (process.env.BOB_API_KEY) {
      apiKey = process.env.BOB_API_KEY;
      baseURL = baseURL || process.env.BOB_INFERENCE_URL || process.env.BOB_BASE_URL || 'https://api.us-east.bob.ibm.com/v1';
      model = model || process.env.BOB_MODEL || 'auto';
    }
  }

  if (!apiKey) {
    throw new Error(
      'No API key found. Please set LLM_API_KEY or BOB_API_KEY in server/.env'
    );
  }

  baseURL = baseURL || (apiKey.startsWith('AQ.') ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : 'https://api.us-east.bob.ibm.com/v1');
  baseURL = baseURL.replace(/\/chat\/completions\/?$/, '');

  model = model || (baseURL.includes('generativelanguage.googleapis.com') ? 'models/gemini-2.5-flash' : 'auto');

  if (!_client) {
    _client = new OpenAI({ apiKey, baseURL });
  }

  return { client: _client, model };
}

export async function callBob(messages: ChatMessage[]): Promise<string> {
  const { client, model } = getClient();

  const completion = await client.chat.completions.create({
    model,
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from LLM');
  return content;
}
