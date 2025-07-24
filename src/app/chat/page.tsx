"use client";
import { useState, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";
import Select, { MultiValue } from "react-select";

// 型定義を追加
interface AuthorOption {
  value: string;
  label: string;
}

type DocInfo = { author: string; fileName: string; content: string };
type Message = { role: "user" | "assistant"; text: string; contextDocs?: DocInfo[] };

export default function ChatPage() {

  const router = useRouter();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  // メタデータフィルター例（必要に応じて拡張）
  //const [filter, setFilter] = useState("");
  const filter = "";
  const [mode, setMode] = useState("qa");
  const [genre, setGenre] = useState<string[]>([]); // 配列で管理
  const [model, setModel] = useState<string[]>(['gpt-4.1']); // 配列で管理
  const [author, setAuthor] = useState<string[]>([]); // 配列で管理
  const [contextCount, setContextCount] = useState(5); // デフォルト値5
  const [expandedDocs, setExpandedDocs] = useState<{ [key: string]: boolean }>({});
  const [expandedContexts, setExpandedContexts] = useState<{ [key: number]: boolean }>({}); // 追加

  const [isMounted, setIsMounted] = useState(false);

  // Initialize component mounting
  useEffect(() => {
    setIsMounted(true);
  }, []);

  //const [selectedOption, setSelectedOption] = useState(null);

  const genre_author = {
    PhilGreek: ["Plato", "Aristotle"],
    PhilRoma: ["Cicero"],
    LitGreek: ["Homer"],
    // 必要に応じて他のジャンルと著者を追加
  };

  // ジャンルに基づく著者リストの生成を修正
const availableAuthors = useMemo(() => {
  // "All"が選択された場合の処理を明示的に行う
  if (genre.includes("All")) {
    return Array.from(new Set(Object.values(genre_author).flat()));
  }
  
  // ジャンルが未選択の場合も全著者を返す
  if (genre.length === 0) {
    return Array.from(new Set(Object.values(genre_author).flat()));
  }
  
  // 特定のジャンルが選択された場合
  return Array.from(
    new Set(
      genre.flatMap((g) => genre_author[g] || [])
    )
  );
}, [genre]);

  // react-select用のオプション生成
  const authorOptions = useMemo(() => 
    availableAuthors.map(a => ({ value: a, label: a })),
    [availableAuthors]
  );

// ジャンル変更時の処理も修正
useEffect(() => {
  if (isMounted) {
    // "All"選択時は全著者を選択状態に
    if (genre.includes("All")) {
      setAuthor(availableAuthors);
      return;
    }

    // それ以外は既存のロジックを維持
    const filteredAuthors = author.filter(a => availableAuthors.includes(a));
    if (filteredAuthors.length === 0) {
      setAuthor(availableAuthors);
    } else {
      setAuthor(filteredAuthors);
    }
  }
}, [genre, availableAuthors, isMounted]);

// 全選択状態の管理
//const allSelected = author.length === availableAuthors.length;

// 選択肢の変更ハンドラー
const handleAuthorChange = (selectedOptions: MultiValue<AuthorOption>) => {
  const newAuthors = selectedOptions ? selectedOptions.map((opt: AuthorOption) => opt.value) : [];
  setAuthor(newAuthors);
};

/*
// 全選択/解除ハンドラー
const handleSelectAll = (checked: boolean) => {
  setAuthor(checked ? availableAuthors : []);
};
*/

  // mode変更時にAPIへ送信
useEffect(() => {
    if (!mode) return;
    // 必要に応じて他の条件も追加
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: input, mode: mode, author: author, contextCount, filter, model: model }),
    })
      .then(async (res) => {
        // レスポンスの内容をチェック
        const text = await res.text();
        
        if (!text) {
          console.log("Mode changed, empty response received");
          return;
        }
        
        try {
          const data = JSON.parse(text);
          console.log("Mode changed, API Response:", data);
        } catch (jsonError) {
          console.error("Invalid JSON response:", text);
          console.error("JSON parse error:", jsonError);
        }
      })
      .catch(err => {
        console.error("Mode change API error:", err);
      });
}, [mode, author, filter]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages((msgs) => [...msgs, { role: "user", text: input }]);

    // API RouteにPOSTして回答を取得（フィルターも送信）
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: input, mode: mode, author: author, contextCount, filter, model: model }),
    });
    const data = await res.json();

    setMessages((msgs) => [
      ...msgs,
      {
        role: "assistant",
        text: data.answer,
        contextDocs: data.docs || [],
      },
    ]);
    setInput("");
  };

  // 展開・折りたたみの切り替え
  const toggleDoc = (docId: string) => {
    setExpandedDocs((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  };

  return (
    <main className="w-full min-h-screen bg-white px-4 sm:px-8 md:px-16 lg:px-32 xl:px-48 py-8 box-border">
      <h1 className="text-2xl font-bold mb-8">
        {/* ここに画像を挿入する場合は、<img src="/path/to/image.png" alt="Logo" className="inline-block h-8" /> */}
        <img 
          src="/logo02.png" 
          alt="Logo" 
          className="inline-block h-12" 
          style={{ maxHeight: 48, width: "auto", cursor: "pointer" }}
          onClick={() => router.push("/")}
           />
      </h1>
      <div className="flex gap-8">
        {/* 左側：メタデータフィルター設定 */}
        <aside>
          <div className="w-128 bg-gray-50 border rounded p-4 h-fit">
            <h2 className="text-lg font-semibold mb-4">絞り込み条件</h2>
            <label className="block mt-6 mb-2 text-sm font-medium">
              ジャンルでフィルター
              <select
                multiple
                value={genre}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setGenre(selected);
                }}
                className="border rounded px-2 py-1 mt-1 w-full"
                size={5} // 表示行数はお好みで
              >
                <option value="All">All</option>
                <option value="PhilGreek">Greek Philosophy</option>
                <option value="PhilRoma">Roman Philosophy</option>
                <option value="LitGreek">Greek Literature</option>
                {/* 必要に応じて著者を追加 */}
              </select>
            </label>
            <label className="block mt-6 mb-2 text-sm font-medium">
              著者でフィルター
              {/*
              <select
                multiple
                value={author}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setAuthor(selected);
                }}
                className="border rounded px-2 py-1 mt-1 w-full"
                size={5} // 表示行数はお好みで
              >
                {availableAuthors.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
                */}
              {isMounted && (
            <Select
  isMulti
  options={authorOptions}
  value={authorOptions.filter(opt => author.includes(opt.value))}
  onChange={handleAuthorChange}
  className="basic-multi-select"
  classNamePrefix="select"
  placeholder="Select authors..."
  closeMenuOnSelect={false}
  isClearable={true}
  styles={{
    control: (base) => ({
      ...base,
      backgroundColor: 'white',
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: '#f3f4f6',
    }),
    menu: (base) => ({
      ...base,
      zIndex: 9999,
    }),
  }}
/>
)}
            </label>
            
          </div>
          <div className="mt-8 w-128 bg-gray-50 border rounded p-4 h-fit">
            <h2 className="text-lg font-semibold mb-4">設定</h2>
            <div className="mt-6 mb-2 text-sm font-medium">回答モード</div>
            <div className="flex grid-cols-4 gap-4 mb-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="mode"
                  value="qa"
                  checked={mode === "qa"}
                  onChange={() => setMode("qa")}
                  className="mr-1"
                />
                Q & A
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="mode"
                  value="study"
                  checked={mode === "study"}
                  onChange={() => setMode("study")}
                  className="mr-1"
                />
                Study
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="mode"
                  value="research"
                  checked={mode === "research"}
                  onChange={() => setMode("research")}
                  className="mr-1"
                />
                Research
              </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="mode"
                value="conversation"
                checked={mode === "conversation"}
                onChange={() => setMode("conversation")}
                className="mr-1"
              />
              Conversation
            </label>
            </div>
            <label className="block mt-6 mb-2 text-sm font-medium">
              モデルを選択
              <select
                multiple
                value={model}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setModel(selected);
                }}
                className="border rounded px-2 py-1 mt-1 w-full"
                size={5} // 表示行数はお好みで
              >
                <option value="gpt-4.1">GPT-4.1</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="o4-mini">o4-mini</option>
                {/* 必要に応じて著者を追加 */}
              </select>
            </label>
            {/* 必要に応じて他のフィルターUIを追加 */}
            <div className="mt-8 mb-2 text-sm font-medium">コンテクスト数</div>
            <div className="flex items-center gap-2 mb-4">
              <input
                type="range"
                min={1}
                max={20}
                value={contextCount}
                onChange={e => setContextCount(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-8 text-center">{contextCount}</span>
            </div>
          </div>
        </aside>
        {/* 右側：チャットウィンドウ */}
        <section className="flex-1 flex flex-col h-[80vh] min-h-[400px]">
          <form onSubmit={handleSend} className="flex gap-2 mb-8">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="質問を入力してください"
              className="border rounded px-3 py-2 flex-1"
            />
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
              送信
            </button>
          </form>
          {/* 上部：チャット履歴 */}
          <div className="flex-1 overflow-y-auto pb-4 min-h-0 rounded-lg bg-gray-50">
            <div className="flex flex-col gap-4 mb-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mr-4 ml-4 mt-4`}
                >
                  <div
                    className={`rounded-xl mr-4 ml-4 px-4 py-2 max-w-[70%] ${msg.role === "user"
                      ? "bg-blue-100 text-right"
                      : "bg-green-50 text-left"
                      }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                        {msg.contextDocs && msg.contextDocs.length > 0 && (
                          <div className="mt-4 border-t pt-2 text-sm">
                            <button
                              className="text-blue-600 underline text-xs mb-2"
                              onClick={() =>
                                setExpandedContexts((prev) => ({
                                  ...prev,
                                  [idx]: !prev[idx],
                                }))
                              }
                              type="button"
                            >
                              {expandedContexts[idx] ? "参考コンテクストを折りたたむ" : "参考コンテクストを表示"}
                            </button>
                            {expandedContexts[idx] && (
                              <>
                                <div className="font-bold mb-2">参考コンテクスト:</div>
                                {msg.contextDocs.map((doc, docIdx) => (
                                  <div key={docIdx} className="mb-2">
                                    <div>
                                      <span className="font-semibold">[{docIdx + 1}]</span>{" "}
                                      {doc.author && <span className="italic">{doc.author}</span>}{" "}
                                      {doc.fileName && <span>({doc.fileName})</span>}
                                    </div>
                                    <button
                                      className="text-blue-600 underline text-xs mt-1"
                                      onClick={() => toggleDoc(`${idx}-${docIdx}`)}
                                      type="button"
                                    >
                                      {expandedDocs[`${idx}-${docIdx}`] ? "閉じる" : "全文を表示"}
                                    </button>
                                    {expandedDocs[`${idx}-${docIdx}`] && (
                                      <div className="mt-1 whitespace-pre-wrap bg-gray-100 rounded px-2 py-1">
                                        {doc.content}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      msg.text
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* 下部：入力フォーム 
          <div className="flex items-end flex-1"></div>
          */}
        </section>
      </div>
    </main>
  );
}