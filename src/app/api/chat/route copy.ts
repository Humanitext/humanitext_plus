import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";

const PINECONE_API_KEY = process.env.NEXT_PUBLIC_PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.NEXT_PUBLIC_PINECONE_INDEX_NAME;
const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  if (!question) {
    return NextResponse.json({ error: "質問がありません" }, { status: 400 });
  }
  if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
    return NextResponse.json({ error: "環境変数が不足しています" }, { status: 500 });
  }

  // Embedding生成
  const getEmbedding = async (text: string) => {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });
    const data = await response.json();
    return data.data[0].embedding;
  };

  // Pinecone検索
  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pinecone.Index(PINECONE_INDEX_NAME);

  const vector = await getEmbedding(question);

  const queryResponse = await index.query({
    vector,
    topK: 5,
    includeValues: true,
    includeMetadata: true,
  });

  const matches = queryResponse.matches ?? [];
  const docs: { id: string; score: number; text: string }[] = [];
  for (const match of matches) {
    let text = "No text available";
    try {
      text = JSON.parse(match.metadata?._node_content || "{}").text || "No text available";
    } catch {
      text = match.metadata?._node_content || "No text available";
    }
    docs.push({
      id: match.id,
      score: match.score,
      text,
      author: match.metadata?.author,
      fileName: match.metadata?.filename,
    });
  }
  const contextText = docs.map(d => d.text).join("\n");

  // OpenAI Chat APIで回答生成
  const getAnswerFromLLM = async (context: string, question: string) => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: "system",
            content: "You are an expert assistant. Answer the user's question based only on the provided context. If the answer is not in the context, say so."
          },
          {
            role: "user",
            content: `Context:\n${contextText}\n\nQuestion: ${question}`
          }
        ],
        temperature: 0.2,
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "回答を生成できませんでした。";
  };

  const answer = await getAnswerFromLLM(contextText, question);

  return NextResponse.json({
    answer,
    docs,
  });
}