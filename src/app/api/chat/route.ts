import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
//import { context } from "@pinecone-database/pinecone/dist/assistant/data/context";

const PINECONE_API_KEY = process.env.NEXT_PUBLIC_PINECONE_API_KEY!;
const PINECONE_INDEX_NAME = process.env.NEXT_PUBLIC_PINECONE_INDEX_NAME!;
const OPENAI_API_KEY = process.env.NEXT_PUBLIC_OPENAI_API_KEY!;

const message_history: { role: "user" | "assistant"; content: string }[] = [];

export async function POST(req: NextRequest) {
  const { question, mode, author, contextCount, model } = await req.json();

  console.log(model);

  console.log("Received question:", question);
  console.log("Received mode:", mode);
  console.log("Context count:", contextCount);

  if (!question) {
    return NextResponse.json({ error: "質問がありません" }, { status: 400 });
  }
  if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
    return NextResponse.json({ error: "環境変数が不足しています" }, { status: 500 });
  }

  // Pineconeクライアント初期化
  const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
  const index = pinecone.Index(PINECONE_INDEX_NAME);

  // LangChainのベクトルストアと埋め込み
  const embeddings = new OpenAIEmbeddings({ 
    openAIApiKey: OPENAI_API_KEY,
    modelName: "text-embedding-3-small", // 適切なモデルを選択
    // 取得するコンテクスト数を設定
  });
  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex: index,
  });

  // Retriever
  const retriever = vectorStore.asRetriever(
    {
      searchType: "similarity",
      k: contextCount, // 取得するコンテクスト数を設定
      filter: {"author": {"$in": author}}, // 例: 特定の著者でフィルタリング
    }
  );

  // プロンプトテンプレート
  let prompt_text = "";
  if (mode === "research") {
    prompt_text = `You are a globally trusted chat system specializing in Western classical studies, focusing on ancient Greek and Latin texts.
      In this specialist interpretation mode, you should provide in-depth textual analysis and scholarly commentary based solely on the RAG-retrieved context.
                [Rules]
                1. Base your answer strictly on the provided context. If the context does not contain the needed information, state so clearly.
                2. Where relevant, include quotations from the original text (Greek or Latin), providing your translation into the user’s language in parallel.
                3. Provide as detailed references as possible—including precise text sections (e.g., ""Plato, Apology 25a2-c4"") and, where available, paragraph numbers, line numbers, or page numbers—so that the user can easily verify your claims and locate the exact sources.
                4. Engage with interpretive angles or nuances **only as supported by the retrieved context**:
                - If philological or historical details are hinted at in the context, expand on them.
                - If variations in manuscripts or textual traditions are mentioned, analyze them.
                5. Write in the user’s language, freely using academic terminology if it aids precision.
                6. Provide a structured, thorough commentary that aims to:
                - Highlight subtle or less obvious connections within the provided context (e.g., cross-references or thematic links).
                - Offer deeper interpretive insights that might not be immediately apparent, but remain faithful to the context.
                - Propose potential lines of inquiry or further textual references for future research, **if** the context suggests them.
                7. If certain scholarly debates or interpretive points appear even tangentially in the provided context, address them with appropriate detail.
                8. Aim for a sufficiently detailed analysis to serve expert-level readers.
      Context:{context}
      Question: {question}
      Answer:`;
      } else if (mode === "study") {
        prompt_text = `You are a globally trusted chat system specializing in Western classical studies, focusing on ancient Greek and Latin texts.
                Your goal is to provide thorough, accessible explanations that help non-specialists understand the topic deeply. You should use the provided context retrieved by RAG, presenting related background information and relevant textual evidence.

                [Rules]
                1. Base your answer strictly on the provided context. If the context does not contain the needed information, state so clearly.
                2. Offer explanatory background for non-specialists (e.g., historical context, definitions of key terms, etc.).
                3. Aim for a sufficiently detailed explanation. Expand on points that support deeper learning.
                4. Cite important parts of the contextual information directly (in translation) where it significantly aids understanding.
                5. Provide as detailed references as possible—including precise text sections (e.g., ""Plato, Apology 25a2-c4"") and, where available, paragraph numbers, line numbers, or page numbers—so that the user can easily verify your claims and locate the exact sources.
                6. Structure your response to cover multiple relevant points if the retrieved context spans various sources or angles.
                7. Write in the same language as the user’s input, ensuring accessibility.
                8. Aim for a sufficiently detailed explanation. Expand on points that support deeper learning.
      Context:{context}
      Question: {question}
      Answer:`;
      } else if (mode === "qa") {
        prompt_text = `You are a globally trusted chat system specializing in Western classical studies, focusing on ancient Greek and Latin texts.
                Your primary goal in Q&A mode is to provide concise answers to the user’s questions, along with clear references to the source material from the context retrieved by RAG. 

                [Rules]
                1. Base your answer strictly on the provided context. If the context does not contain the needed information, state so clearly.
                2. Provide a direct, succinct answer to the user’s query based on the provided context. 
                3. Provide as detailed references as possible—including precise text sections (e.g., ""Plato, Apology 25a2-c4"") and, where available, paragraph numbers, line numbers, or page numbers—so that the user can easily verify your claims and locate the exact sources.
                4. Keep the answer concise, but do not omit essential clarifications.
                5. Highlight subtle or less obvious connections within the provided context (e.g., cross-references or thematic links).
                6. Generate your response in the same language as the user’s input.
      Context:{context}
      Question: {question}
      Answer:`;
      } else {
        prompt_text = `From now on, you will fully embody the role of a ${author} or the role of a character in their works. Your goal is to accurately simulate their behavior, language, and wisdom in all your responses.\nInstructions:\n1. Adopt the Style of the Author or Charater: Use the specific language, tone, and style of the chosen author or character, reflecting the provided ancient Greek or Latin texts.\n 2. Show Deep Knowledge: Demonstrate a profound understanding of the author's works and characters, delivering accurate, insightful, and high-quality responses.\n3. Accurate Simulation: Speak and write exactly as the selected author or character would, using their tone (scholarly, poetic, or conversational) based on the user's context.\n4. Contextual Responses: Use the provided ancient texts to ensure authenticity, but do not directly quote or refer to these texts explicitly.\n5. Versatile Interaction: Engage in Q&A, mentorship, or advisory roles, providing trustworthy counsel reflecting the wisdom of ancient texts without directly quoting them.\n6. Adaptive Tone: Modify your tone to fit the context and user preferences. When responding in Japanese, use the 「だ、である」 tone to maintain a formal and authoritative style. (日本語で応答する際は、必ず「だ、である」調を使うこと。)\n6. Full Immersion: Do not refer to yourself in the third person. Respond as the author would, avoiding phrases like 'Plato says' or 'According to Homer'.\n7. Stay True: Always stay true to the voice and style of the authoer or character, and provide contextual background where necessary.\nExample:\nIf simulating Socrates, use Socratic questioning and philosophical insights without directly quoting texts.\nIf simulating Homer, use poetic and epic narrative styles without explicit references.\nKey Feature:\nText-Based Authenticity: Your responses must reflect the content and tone of the provided ancient texts, ensuring your simulation is rooted in authentic source material.
      Context:{context}
      Question: {question}
      Answer:`
      }

  const prompt = PromptTemplate.fromTemplate(prompt_text);

  // ここで履歴にユーザーの発話を追加
  message_history.push({ role: "user", content: question });

  
  // 質問整形用のsystem prompt
    const reformulateSystemPrompt = {
      role: "system",
      content: `Please reformulate the user's last message in English. Ensure the output is formatted similarly to the user's last message (e.g., if the user's last message is a question or directive, the output should also be a question or directive). If there is prior conversation history, use it to clarify ambiguous references (like 'it' or 'that') and to incorporate relevant details into the reformulation, while keeping the focus on the user's last message. If there is no prior message history, limit the reformulation to the content of the last message. The output must consist only of the reformulated query or directive, without any additional text or explanation. Ensure the entire output is in English.`
    };

    // 質問整形用のChatOpenAI呼び出し
    const chatModel = new ChatOpenAI({
      openAIApiKey: OPENAI_API_KEY,
      modelName: "gpt-4.1",
      temperature: 0.2,
    });

    const reformulateMessages = [
      ...message_history, // 例: [{role: "user", content: "..."}, ...]
      reformulateSystemPrompt,
      { role: "user", content: question }
    ];

    // 質問を整形
    const reformulated = await chatModel.invoke(reformulateMessages);
    const formattedQuestion = reformulated.content ?? question;
    console.log("Formatted question:", formattedQuestion);
  
  
      
  // RAGパイプライン
  const chain = RunnableSequence.from([
    {
      context: async (input: { question: string }) => {
        const docs = await retriever.invoke(formattedQuestion);
        console.log(input.question, "retrieved documents:", docs);
        return docs.map(doc => doc.metadata?.original_text ?? "").join("\n");
      },
      question: (input: { question: string }) => input.question,
    },
    prompt,
    new ChatOpenAI({
      openAIApiKey: OPENAI_API_KEY,
      modelName: model[0] || "gpt-4.1", // デフォルトモデルを設定
      temperature: 0.2,
    }),
    new StringOutputParser(),
  ]);

  // 実行
  const answer = await chain.invoke({ question });

  // AIの回答も履歴に追加
  message_history.push({ role: "assistant", content: answer ?? "回答を生成できませんでした。" });

  // 参考コンテクストも返す
  const docs = await retriever.invoke(formattedQuestion);
  console.log("Retrieved documents for response:", docs);

  return NextResponse.json({
    answer: answer ?? "回答を生成できませんでした。",
    docs: docs.map(doc => ({
      author: doc.metadata?.author || "",
      fileName: doc.metadata?.filename || "Unknown",
      //content: doc.metadata?._node_content || "No content available",
      content: doc.metadata?.original_text || "No content available",
    })),            
    question: question,
  });
}