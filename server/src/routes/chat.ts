import { Router, Request, Response } from 'express';
import { callBob } from '../lib/bobClient';
import { SYSTEM_PROMPT } from '../lib/schemaPrompt';
import { db } from '../db/database';

const chatRouter = Router();

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

chatRouter.post('/', async (req: Request, res: Response) => {
  const { messages }: { messages: ChatMessage[] } = req.body;

  const conversation: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages,
  ];

  // Pass 1 — ask Bob; it may return a SQL block
  let firstResponse: string;
  try {
    firstResponse = await callBob(conversation);
  } catch (err: unknown) {
    const error = err as Error;
    res.status(502).json({ error: 'Bob API error', detail: error.message });
    return;
  }

  // Extract SQL from ```sql ... ``` fenced block
  const sqlMatch = firstResponse.match(/```sql\s*([\s\S]*?)```/i);

  if (!sqlMatch) {
    // No SQL needed — first response is the final answer
    res.json({ answer: firstResponse });
    return;
  }

  const extractedSQL = sqlMatch[1].trim();

  // SQL safety check — only SELECT statements allowed
  const firstToken = extractedSQL.split(/\s+/)[0].toUpperCase();
  if (firstToken !== 'SELECT') {
    res.json({ answer: 'I can only run SELECT queries for safety.' });
    return;
  }

  // Pass 2 — execute the SQL, then ask Bob to synthesise a final answer
  let results: Record<string, unknown>[];
  try {
    results = db.prepare(extractedSQL).all() as Record<string, unknown>[];
  } catch (err: unknown) {
    const error = err as Error;
    res.json({
      answer: `I generated a query but it failed to execute: ${error.message}`,
      sql: extractedSQL,
    });
    return;
  }

  const updatedMessages: ChatMessage[] = [
    ...conversation,
    { role: 'assistant', content: firstResponse },
    {
      role: 'user',
      content:
        'Here are the query results in JSON:\n' +
        JSON.stringify(results, null, 2) +
        '\n\nPlease answer the original question based on these results.',
    },
  ];

  let finalAnswer: string;
  try {
    finalAnswer = await callBob(updatedMessages);
  } catch (err: unknown) {
    const error = err as Error;
    res.status(502).json({ error: 'Bob API error', detail: error.message });
    return;
  }

  res.json({ answer: finalAnswer, sql: extractedSQL, results });
});

export default chatRouter;
