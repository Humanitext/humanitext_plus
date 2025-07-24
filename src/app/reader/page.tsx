"use client";
import { useState, useEffect, useMemo } from "react";
//import ReactMarkdown from "react-markdown";
import { useRouter } from "next/navigation";
//import Select, { ActionMeta, MultiValue } from 'react-select';  // 型定義を追加
import { GoogleGenAI } from "@google/genai";
import CETEI from "CETEIcean";

type DocInfo = { author: string; fileName: string; content: string };
type Message = { role: "user" | "assistant"; text: string; contextDocs?: DocInfo[] };

/*
// Define the option type
type GenreOption = {
    value: string;
    label: string;
};
*/

type AuthorOption = {
    value: string;
    label: string;
};

const genAI = new GoogleGenAI({
    //apiKey: process.env.GOOGLE_GENAI_API_KEY
    apiKey: process.env.NEXT_PUBLIC_GENAI_API_KEY
});

export default function ChatPage() {

    const router = useRouter();

    const [texts, setTexts] = useState<{ value: { line: string; commentary: string[] }[] }>({ value: [] });

    const [input, setInput] = useState("");
    const [messages, setMessages] = useState<Message[]>([]);
    // メタデータフィルター例（必要に応じて拡張）
    const [filter, setFilter] = useState("");
    const [mode, setMode] = useState("qa");
    const [genre, setGenre] = useState<string>('');
    const [model, setModel] = useState<string[]>(['gpt-4.1']); // 配列で管理
    const [author, setAuthor] = useState<string>('');
    const [work, setWork] = useState<string>('');
    const [book, setBook] = useState<string>(''); // 巻数の状態を追加
    const [contextCount, setContextCount] = useState(5); // デフォルト値5
    const [expandedDocs, setExpandedDocs] = useState<{ [key: string]: boolean }>({});
    //const [expandedContexts, setExpandedContexts] = useState<{ [key: number]: boolean }>({}); // 追加

    const [isMounted, setIsMounted] = useState(false);

    const [commentaryList, setCommentaryList] = useState<{ annotator: string; book: string; work: string; content: string }[]>([]);

    const teiContent = useState<string>('');

    const [lang, setLang] = useState<string>('Japanese'); // 言語選択の状態を追加

    const [options, setOptions] = useState<{ id: string; label: string }[]>([
        { id: 'Japanese', label: 'Japanese' },
        { id: 'English', label: 'English' },
        { id: 'French', label: 'French' },
        { id: 'Chinese', label: 'Chinese' },
        { id: 'Spanish', label: 'Spanish' },
        { id: 'Italian', label: 'Italian' },
        { id: 'German', label: 'German' },
        { id: 'Russian', label: 'Russian' },
        { id: 'Greek', label: 'Greek' },
        { id: 'Latin', label: 'Latin' }
    ]);

    const [processedText, setProcessedText] = useState<string>('');
    const [isTransSummDialogOpen, setIsTransSummDialogOpen] = useState<boolean>(false);

    // Initialize component mounting
    useEffect(() => {
        setIsMounted(true);
    }, []);

    //const [selectedOption, setSelectedOption] = useState(null);

    const genre_author = {
        western_classics: ["Homer", "Plato", "Aristotle", "Cicero"],
        PhilGreek: ["Plato", "Aristotle"],
        PhilRoma: ["Cicero"],
        LitGreek: ["Homer"],
        // 必要に応じて他のジャンルと著者を追加
    };

    const author_work = {
        Aristotle: ["Metaphysics", "Rhetoric", "Topica"],
        Plato: ["Republic", "Phaedrus", "Symposium"],
        Cicero: ["De Oratore", "De Re Publica"],
        Homer: ["The Iliad", "The Odyssey"],
        // 必要に応じて他の著者と著作を追加
    };

    // ジャンルに基づく著者リストの生成を修正
    const availableAuthors = useMemo(() => {
        if (genre === 'All' || !genre) {
            return Array.from(new Set(Object.values(genre_author).flat()));
        }
        return genre_author[genre] || [];
    }, [genre]);

    // 著者に基づく著作リストの生成
    let availableWorks = useMemo(() => {
        if (author === 'All' || !author) {
            return Array.from(new Set(Object.values(author_work).flat()));
        }
        return author_work[author] || [];
    }, [author]);

    // 著者に基づく著作リストの生成
    const [availableBooks, setAvailableBooks] = useState<string[]>([]);

    useEffect(() => {
        if (availableBooks.length > 0) {
            setBook(availableBooks[0]);
        } else {
            setBook('');
        }
    }, [availableBooks]);

    useEffect(() => {
        if (author && availableWorks.length > 0) {
            setWork(availableWorks[0]);
        } else {
            setWork('');
        }
    }, [author, availableWorks]);

    useEffect(() => {
        if (!author || !work) {
            setAvailableBooks([]);
            return;
        }
        const endpoint = "https://dydra.com/junjun7613/humanitextonto/sparql";
        const query = `
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            SELECT DISTINCT ?book WHERE {
            ?author a <http://example.org/vocabulary/Author> ;
                    rdfs:label "${author}" .
            ?work a <http://example.org/vocabulary/Work> ;
                    rdfs:label "${work}" .
            ?text a <http://example.org/vocabulary/Text>;
                <http://example.org/vocabulary/correspondingWork> ?work ;
                <http://example.org/vocabulary/correspondingBook> ?book .
            }
        `;
        const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
        fetch(url)
            .then(res => res.json())
            .then(data => {
                const books = data.results.bindings.map((binding: any) => binding.book.value);
                setAvailableBooks(books);
            })
            .catch(() => setAvailableBooks([]));
    }, [author, work]);

    useEffect(() => {
        if (authorOptions.length >= 1) {
            setAuthor(authorOptions[0].value);
            availableWorks = author_work[authorOptions[0].value] || [];
            setWork('');
        }
    }, [availableAuthors]);

    // react-select用のオプション生成
    const authorOptions = useMemo(() =>
        availableAuthors.map(a => ({ value: a, label: a })),
        [availableAuthors]
    );

    /*
    // 全選択状態の管理
    const allSelected = author.length === availableAuthors.length;


    // Update the change handler with proper typing
    const handleAuthorChange = (
        newValue: MultiValue<AuthorOption> | null
    ) => {
        // Handle both array and null cases
        const newAuthors = Array.isArray(newValue)
            ? newValue.map(opt => opt.value)
            : [];
        setAuthor(newAuthors);
    };

    // 全選択/解除ハンドラー
    const handleSelectAll = (checked: boolean) => {
        setAuthor(checked ? availableAuthors : []);
    };

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
    */

    // 「テクストを表示」ボタンのクリック処理を関数として定義
    const handleShowText = () => {
        if (author && work && book) {
            // router.push(`/reader/${author}/${work}`);
            //console.log(`Displaying text for ${author} - ${work} - ${book}`);

            const endpoint = "https://dydra.com/junjun7613/humanitextonto/sparql";
            const query = `
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

                SELECT DISTINCT ?text ?line ?commentary WHERE {
                ?author a <http://example.org/vocabulary/Author> ;
                        rdfs:label "${author}" .
                ?work a <http://example.org/vocabulary/Work> ;
                        rdfs:label "${work}" ;
                        <http://purl.org/dc/elements/1.1/creator> ?author .
                ?text a <http://example.org/vocabulary/Text>;
                    <http://example.org/vocabulary/correspondingWork> ?work ;
                    <http://example.org/vocabulary/correspondingBook> "${book}" ;
                    <http://purl.org/dc/elements/1.1/creator> ?author.
                ?text <http://example.org/vocabulary/correspondingSeg> ?line .

                OPTIONAL{?commentary <http://example.org/vocabulary/references> ?text}
                }
            `;
            const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
            fetch(url)
                .then(res => res.json())
                .then(data => {
                    console.log(data);
                    data.results.bindings.forEach((binding) => {

                        //dts apiを使用して、texts.value.descriptionにテクストを追加
                        const url = `https://humanitext-dts.vercel.app/api/dts/document?id=urn:${author}.${work}:${book}&ref=${binding.line.value}`;
                        //console.log(url);
                        // urlで問い合わせてデータを取得

                        //もし既存のtexts.valueに含まれる連想配列にlineが存在すれば、その連想配列にcommentaryを追加
                        const existingText = texts.value.find((text) => text.line === binding.line.value);
                        console.log(existingText);
                        if (existingText) {
                            existingText.commentary.push(binding.commentary ? binding.commentary.value : null);
                            //変更を反映してtexts.valueを更新
                            texts.value = [...texts.value];
                        } else {
                            //console.log("no existing text");
                            texts.value.push({
                                line: binding.line.value,
                                //description: binding.description.value,
                                //もしcommentaryが存在すれば新たに連想配列を作成し、texts.valueに追加
                                commentary: binding.commentary ? [binding.commentary.value] : []
                            });
                        };
                    });

                    console.log(texts.value);


                    const xml_path = `https://humanitext-dts-data.vercel.app/xml/${author}/${work}/${book}.xml`;
                    console.log(xml_path);

                    var CETEIcean = new CETEI()

                    let text_behaviors = {
                        "tei": {
                            //"seg": (element) => {
                            "ana": (element) => {
                                // <seg> 要素の xml:id を取得
                                const xmlId = element.getAttribute('xml:id');
                                const matchingText = texts.value.find((text) => text.line === xmlId);
                                console.log(matchingText);

                                if (xmlId) {
                                    // xml:id の値を表示するための <span> 要素を作成
                                    const idSpan = document.createElement("span");
                                    idSpan.textContent = `[${xmlId}] `;
                                    idSpan.style.fontSize = "14px";

                                    // parentNodeの存在確認を追加
                                    if (element.parentNode && element.parentNode.nodeType === Node.ELEMENT_NODE) {
                                        try {
                                            // <seg> 要素の前に <span> を挿入
                                            element.parentNode.insertBefore(idSpan, element);

                                            if (matchingText && matchingText.commentary !== undefined && matchingText.commentary.length > 0) {
                                                // クリックイベントを追加
                                                idSpan.style.color = "blue";
                                                idSpan.style.cursor = "pointer";
                                                idSpan.addEventListener("click", () => {
                                                    textClicked(xmlId);
                                                });
                                            }
                                        } catch (error) {
                                            console.warn(`Error inserting span for ${xmlId}:`, error);
                                            // フォールバック: 要素内に追加
                                            try {
                                                element.insertBefore(idSpan, element.firstChild);
                                            } catch (fallbackError) {
                                                console.warn(`Fallback also failed for ${xmlId}:`, fallbackError);
                                            }
                                        }
                                    } else {
                                        console.warn(`Invalid parentNode for element with xmlId: ${xmlId}`);
                                        // 代替案: 要素内に追加
                                        try {
                                            element.insertBefore(idSpan, element.firstChild);

                                            if (matchingText && matchingText.commentary !== undefined && matchingText.commentary.length > 0) {
                                                idSpan.style.color = "blue";
                                                idSpan.style.cursor = "pointer";
                                                idSpan.addEventListener("click", () => {
                                                    textClicked(xmlId);
                                                });
                                            }
                                        } catch (error) {
                                            console.warn(`Alternative insertion failed for ${xmlId}:`, error);
                                        }
                                    }
                                }

                                // <seg> 要素に改行を適用
                                element.style.display = "block";
                                element.style.marginBottom = "10px";
                            },
                            "app": function (elt) {
                                var lemElement = elt.querySelector("tei-lem");
                                var rdgElement = elt.querySelector("tei-rdg");
                                // rdgElementのwit属性の値を取得
                                var wit = rdgElement ? rdgElement.getAttribute("wit") : null;

                                var container = document.createElement("span");
                                container.style.position = "relative";
                                container.style.display = "inline-block";

                                var lemSpan = document.createElement("span");
                                lemSpan.innerHTML = lemElement ? lemElement.innerHTML : "";
                                lemSpan.style.backgroundColor = "#f0f0f0"; // 背景色を薄いグレーに設定
                                lemSpan.style.fontWeight = "bold"; // 太字に設定
                                //lemSpan.style.textDecoration = "underline";
                                lemSpan.style.cursor = "pointer";
                                //lemSpan.style.color = "blue";

                                var popup = document.createElement("div");
                                //popup.innerHTML = rdgElement ? rdgElement.innerHTML : "";
                                // innerHTMLに wit属性の値と rdgElementの内容を表示
                                popup.innerHTML = wit ? `${wit}: ${rdgElement ? rdgElement.innerHTML : ""}` : rdgElement ? rdgElement.innerHTML : "";
                                popup.style.position = "absolute";
                                popup.style.bottom = "100%";
                                popup.style.left = "50%";
                                popup.style.transform = "translateX(-50%)";
                                popup.style.backgroundColor = "#333";
                                popup.style.color = "white";
                                popup.style.padding = "5px 10px";
                                popup.style.borderRadius = "4px";
                                popup.style.fontSize = "12px";
                                popup.style.whiteSpace = "nowrap";
                                popup.style.display = "none";
                                popup.style.zIndex = "1000";

                                // ホバーでポップアップ表示
                                lemSpan.addEventListener("mouseenter", function () {
                                    popup.style.display = "block";
                                });

                                lemSpan.addEventListener("mouseleave", function () {
                                    popup.style.display = "none";
                                });

                                container.appendChild(lemSpan);
                                container.appendChild(popup);

                                return container;
                            }
                        }
                    };

                    CETEIcean.addBehaviors(text_behaviors);
                    CETEIcean.getHTML5(xml_path, function (data) {
                        //console.log(data);
                        // xml:idがroute.params.bookの要素を取得
                        const body = data.getElementById(book);
                        console.log(body);
                        const teiElem = document.getElementById("TEI");
                        if (teiElem && body) {
                            teiElem.appendChild(body);
                        }
                    });

                    const textClicked = (xmlId) => {
                        // URL更新（ブラウザ履歴に追加）
                        const newUrl = `/reader/${encodeURIComponent(author)}/${encodeURIComponent(work)}/${encodeURIComponent(book)}/${encodeURIComponent(xmlId)}`;
                        window.history.pushState({}, '', newUrl);

                        console.log(xmlId);
                        const matchingText = texts.value.find((text) => text.line === xmlId);

                        setCommentaryList([]); // commentary_listを初期化

                        // containerという要素を取得（1回だけ）
                        const container = document.getElementById("commentary_container");

                        // container内のすべての子要素を削除
                        while (container.firstChild) {
                            container.removeChild(container.firstChild);
                        }

                        if (matchingText.commentary && matchingText.commentary.length > 0) {
                            console.log(`Found ${matchingText.commentary.length} commentaries`);

                            const endpoint = "https://dydra.com/junjun7613/humanitextonto/sparql";

                            // 各コメンタリーを順次処理
                            matchingText.commentary.forEach((commentary, commentaryIndex) => {
                                if (!commentary) return;

                                const c = new CETEI();

                                const query = `
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

                SELECT DISTINCT ?seg ?annotator ?work ?book WHERE {
                <${commentary}> <http://purl.org/dc/elements/1.1/creator> ?annotator_uri ;
                    <http://example.org/vocabulary/correspondingSeg> ?seg;
                    <http://example.org/vocabulary/correspondingWork> ?work_uri ;
                    <http://example.org/vocabulary/correspondingBook> ?book .
                    ?annotator_uri rdfs:label ?annotator .
                    ?work_uri rdfs:label ?work .
                }
            `;

                                const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;

                                fetch(url)
                                    .then(res => res.json())
                                    .then(data => {
                                        console.log(`Commentary ${commentaryIndex + 1} data:`, data);

                                        data.results.bindings.forEach((binding, bindingIndex) => {
                                            const dts_api = `https://humanitext-dts.vercel.app/api/dts/document?id=urn:${binding.annotator.value}.${binding.work.value}:${binding.book.value}&ref=${binding.seg.value}`;
                                            console.log(`Processing: ${dts_api}`);

                                            c.getHTML5(dts_api, function (data) {
                                                try {
                                                    const body = data.getElementById(binding.seg.value);
                                                    if (!body) {
                                                        console.error(`Body not found for ${binding.seg.value}`);
                                                        return;
                                                    }

                                                    const stringBody = body.innerHTML;
                                                    console.log(`Card ${commentaryIndex + 1}-${bindingIndex + 1} content:`, stringBody);

                                                    // cardを作成
                                                    const card = document.createElement("div");
                                                    card.style.marginBottom = "20px";
                                                    card.style.border = "1px solid #ccc";
                                                    card.style.borderRadius = "8px";
                                                    card.setAttribute('data-commentary-index', `${commentaryIndex}-${bindingIndex}`);

                                                    // card header（タイトルのみ）を作成
                                                    const cardHeader = document.createElement("div");
                                                    cardHeader.style.padding = "15px 20px 10px 20px";
                                                    cardHeader.style.backgroundColor = "#f8f9fa";
                                                    cardHeader.style.borderBottom = "1px solid #e9ecef";
                                                    cardHeader.style.borderRadius = "8px 8px 0 0";

                                                    // card titleを作成
                                                    const cardTitle = document.createElement("h3");
                                                    cardTitle.textContent = `${binding.annotator.value}: ${binding.work.value}:${binding.book.value}`;
                                                    cardTitle.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
                                                    cardTitle.style.fontSize = "18px";
                                                    cardTitle.style.margin = "0";
                                                    cardTitle.style.fontWeight = "600";

                                                    // 表示/非表示切り替えボタンを作成
                                                    const toggleButton = document.createElement("button");
                                                    toggleButton.textContent = "表示";
                                                    toggleButton.style.padding = "6px 12px";
                                                    toggleButton.style.backgroundColor = "#007bff";
                                                    toggleButton.style.color = "white";
                                                    toggleButton.style.border = "none";
                                                    toggleButton.style.borderRadius = "4px";
                                                    toggleButton.style.cursor = "pointer";
                                                    toggleButton.style.fontSize = "12px";
                                                    toggleButton.style.fontWeight = "500";
                                                    toggleButton.style.marginTop = "10px";

                                                    // card content（本文とボタン）を作成
                                                    const cardContent = document.createElement("div");
                                                    cardContent.style.display = "none";

                                                    // card bodyを作成
                                                    const cardBody = document.createElement("div");
                                                    // bodyを複製して使用（DOM操作の競合を避けるため）
                                                    cardBody.appendChild(body.cloneNode(true));
                                                    cardBody.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
                                                    cardBody.style.fontSize = "16px";
                                                    cardBody.style.overflow = "auto";
                                                    cardBody.style.maxHeight = "400px";
                                                    cardBody.style.padding = "20px";
                                                    cardBody.style.lineHeight = "1.6";
                                                    cardBody.style.backgroundColor = "#ffffff";

                                                    // card footerを作成
                                                    const cardFooter = document.createElement("div");
                                                    cardFooter.style.padding = "15px 20px";
                                                    cardFooter.style.backgroundColor = "#f8f9fa";
                                                    cardFooter.style.borderTop = "1px solid #e9ecef";
                                                    cardFooter.style.borderRadius = "0 0 8px 8px";
                                                    cardFooter.style.display = "flex";
                                                    cardFooter.style.alignItems = "center";
                                                    cardFooter.style.gap = "15px";

                                                    // 言語選択肢を作成
                                                    const langSelect = document.createElement("select");
                                                    options.forEach(option => {
                                                        const opt = document.createElement("option");
                                                        opt.value = option.id;
                                                        opt.textContent = option.label;
                                                        langSelect.appendChild(opt);
                                                    });
                                                    langSelect.value = lang;
                                                    langSelect.style.fontSize = "14px";
                                                    langSelect.style.padding = "8px 12px";
                                                    langSelect.style.border = "1px solid #ced4da";
                                                    langSelect.style.borderRadius = "4px";
                                                    langSelect.style.backgroundColor = "white";
                                                    langSelect.style.cursor = "pointer";

                                                    // 翻訳ボタンを作成
                                                    const translateButton = document.createElement("button");
                                                    translateButton.textContent = "Translation";
                                                    translateButton.style.fontSize = "14px";
                                                    translateButton.style.backgroundColor = "#17a2b8";
                                                    translateButton.style.color = "white";
                                                    translateButton.style.border = "none";
                                                    translateButton.style.padding = "8px 16px";
                                                    translateButton.style.borderRadius = "4px";
                                                    translateButton.style.cursor = "pointer";
                                                    translateButton.style.fontWeight = "500";
                                                    translateButton.addEventListener("click", () => {
                                                        const currentLang = langSelect.value;
                                                        commentaryTranslate(stringBody, currentLang);
                                                    });

                                                    // 要約ボタンを作成
                                                    const summarizeButton = document.createElement("button");
                                                    summarizeButton.textContent = "Summary";
                                                    summarizeButton.style.fontSize = "14px";
                                                    summarizeButton.style.backgroundColor = "#17a2b8";
                                                    summarizeButton.style.color = "white";
                                                    summarizeButton.style.border = "none";
                                                    summarizeButton.style.padding = "8px 16px";
                                                    summarizeButton.style.borderRadius = "4px";
                                                    summarizeButton.style.cursor = "pointer";
                                                    summarizeButton.style.fontWeight = "500";
                                                    summarizeButton.addEventListener("click", () => {
                                                        const currentLang = langSelect.value;
                                                        commentarySummarize(stringBody, currentLang);
                                                    });

                                                    // URLコピーボタンを作成
                                                    const copyUrlButton = document.createElement("button");
                                                    copyUrlButton.textContent = "Copy URL";
                                                    copyUrlButton.style.fontSize = "14px";
                                                    copyUrlButton.style.backgroundColor = "#6c757d";
                                                    copyUrlButton.style.color = "white";
                                                    copyUrlButton.style.border = "none";
                                                    copyUrlButton.style.padding = "8px 16px";
                                                    copyUrlButton.style.borderRadius = "4px";
                                                    copyUrlButton.style.cursor = "pointer";
                                                    copyUrlButton.style.fontWeight = "500";
                                                    copyUrlButton.addEventListener("click", () => {
                                                        copyCommentaryUrl(xmlId);
                                                    });

                                                    // 表示/非表示の切り替え機能
                                                    let isExpanded = false;
                                                    toggleButton.addEventListener("click", () => {
                                                        isExpanded = !isExpanded;
                                                        if (isExpanded) {
                                                            cardContent.style.display = "block";
                                                            toggleButton.textContent = "非表示";
                                                            toggleButton.style.backgroundColor = "#6c757d";
                                                        } else {
                                                            cardContent.style.display = "none";
                                                            toggleButton.textContent = "表示";
                                                            toggleButton.style.backgroundColor = "#007bff";
                                                        }
                                                    });

                                                    // 要素を組み立て
                                                    cardHeader.appendChild(cardTitle);
                                                    cardHeader.appendChild(toggleButton);

                                                    cardFooter.appendChild(langSelect);
                                                    cardFooter.appendChild(translateButton);
                                                    cardFooter.appendChild(summarizeButton);
                                                    cardFooter.appendChild(copyUrlButton);

                                                    cardContent.appendChild(cardBody);
                                                    cardContent.appendChild(cardFooter);

                                                    card.appendChild(cardHeader);
                                                    card.appendChild(cardContent);

                                                    // containerに追加
                                                    container.appendChild(card);
                                                    console.log(`Card ${commentaryIndex + 1}-${bindingIndex + 1} added to DOM`);

                                                    // setCommentaryListを正しいタイミングで実行
                                                    setCommentaryList(prev => [...prev, {
                                                        annotator: binding.annotator.value,
                                                        book: binding.book.value,
                                                        work: binding.work.value,
                                                        content: stringBody
                                                    }]);

                                                } catch (error) {
                                                    console.error(`Error processing card ${commentaryIndex + 1}-${bindingIndex + 1}:`, error);
                                                }
                                            });
                                        });
                                    })
                                    .catch(error => {
                                        console.error(`Error fetching commentary ${commentaryIndex + 1}:`, error);
                                    });
                            });
                        }
                    };
                    // Google GenAIによる処理
                    // LLMProcess関数内の修正
                    const LLMProcess = async (text, mode, selectedLang) => {
                        try {
                            let prompt = '';
                            if (mode === "translate") {
                                prompt = `Translate the following text to ${selectedLang}: ${text}`;
                            } else if (mode === "summarize") {
                                prompt = `Briefly summarize the following text in ${selectedLang}: ${text}`;
                            }

                            const response = await genAI.models.generateContent({
                                model: "gemini-2.5-flash",
                                contents: prompt,
                                //temperature: 0.5
                            });

                            if (!response || !response.text) {
                                throw new Error("No response from the API");
                            }

                            return response.text;
                        } catch (error) {
                            console.error("Error in LLMProcess:", error);
                            alert("Failed to process the text. Please try again.");
                            return '';
                        }
                    };

                    // commentaryTranslate関数の修正
                    const commentaryTranslate = (commentaryDesc: string, selectedLang: string) => {
                        console.log(commentaryDesc);
                        LLMProcess(commentaryDesc, "translate", selectedLang).then((translatedText) => {
                            if (translatedText) {
                                setProcessedText(translatedText);
                                setIsTransSummDialogOpen(true);
                            }
                        });
                    };

                    // commentarySummarize関数の修正
                    const commentarySummarize = (commentaryDesc: string, selectedLang: string) => {
                        console.log(commentaryDesc);
                        LLMProcess(commentaryDesc, "summarize", selectedLang).then((summarizedText) => {
                            if (summarizedText) {
                                setProcessedText(summarizedText);
                                setIsTransSummDialogOpen(true);
                            }
                        });
                    };


                });


        } else {
            alert("著者、著作、巻数を選択してください。");
        }

    };

    // copyCommentaryUrl関数をここに追加
    const copyCommentaryUrl = (xmlId: string) => {
        const url = `${window.location.origin}/reader/${encodeURIComponent(author)}/${encodeURIComponent(work)}/${encodeURIComponent(book)}/${encodeURIComponent(xmlId)}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('Commentary URL copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy URL:', err);
            // フォールバック: テキストエリアを使用
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert('Commentary URL copied to clipboard!');
        });
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
                    <div className="w-96 bg-gray-50 border rounded p-4 h-fit">
                        <h2 className="text-lg font-semibold mb-4">絞り込み条件</h2>
                        <label className="block mt-6 mb-2 text-sm font-medium">
                            ジャンルでフィルター
                            <select
                                value={genre}
                                onChange={e => {
                                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                                    setGenre(selected);
                                }}
                                className="border rounded px-2 py-1 mt-1 w-full"
                                size={5} // 表示行数はお好みで
                            >
                                <option value="western_classics">Western Classics</option>
                                <option value="PhilGreek">Greek Philosophy</option>
                                <option value="PhilRoma">Roman Philosophy</option>
                                <option value="LitGreek">Greek Literature</option>
                                {/* 必要に応じて著者を追加 */}
                            </select>
                        </label>
                        <label className="block mt-6 mb-2 text-sm font-medium">
                            著者でフィルター
                            <select
                                value={author}
                                onChange={e => setAuthor(e.target.value)}
                                className="border rounded px-2 py-1 mt-1 w-full"
                                size={5} // 表示行数はお好みで
                            >
                                {/* ここに著者のオプションを追加 */}
                                {availableAuthors.map((a) => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                                {/* 必要に応じて著者を追加 */}
                            </select>
                        </label>
                        <label className="block mt-6 mb-2 text-sm font-medium">
                            著作でフィルター
                            <select
                                value={work}
                                onChange={e => setWork(e.target.value)}
                                className="border rounded px-2 py-1 mt-1 w-full"
                                size={5} // 表示行数はお好みで
                            >
                                {/* ここに著作のオプションを追加 */}
                                {availableWorks.map((a) => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                                {/* 必要に応じて著者を追加 */}
                            </select>
                        </label>
                        <label className="block mt-6 mb-2 text-sm font-medium">
                            巻数を選択
                            <select
                                value={book}
                                onChange={e => setBook(e.target.value)}
                                className="border rounded px-2 py-1 mt-1 w-full"
                                size={5} // 表示行数はお好みで
                            >
                                {/* ここに著作のオプションを追加 */}
                                {availableBooks.map((a) => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                                {/* 必要に応じて著者を追加 */}
                            </select>
                        </label>

                        {/* 「テクストを表示」ボタンを設置 */}
                        <button
                            onClick={handleShowText}
                            className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                            テクストを表示
                        </button>

                    </div>
                    {author && (
                        <div className="mt-4 p-2 bg-blue-50 border border-blue-200 rounded">
                            <strong>Selected Author:</strong> {author}
                        </div>
                    )}
                    {work && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                            <strong>Selected Work:</strong> {work}
                        </div>
                    )}
                    {book && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                            <strong>Selected Book:</strong> {book}
                        </div>
                    )}

                </aside>
                {/* 右側：チャットウィンドウ */}
                {/* 右側：チャットウィンドウ */}
                <section className="flex-1 flex h-[80vh] min-h-[400px] gap-4">

                    {/* 左列：TEI表示エリア */}
                    <div className="flex-1 flex flex-col overflow-y-auto p-4 bg-gray-50 border rounded">
                        <div
                            id="TEI"
                            className="flex-1"
                        />
                    </div>

                    {/* 右列：コンテンツエリア */}

                    <div id="commentary_container" className="flex-1 flex flex-col overflow-y-auto mb-4 rounded" />


                </section>
            </div>

            {/* Translation/Summary Dialog */}
            {isTransSummDialogOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-900">Translation/Summary</h3>
                        </div>
                        <div className="px-6 py-4 max-h-96 overflow-y-auto">
                            <p className="text-gray-700 whitespace-pre-wrap">{processedText}</p>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => setIsTransSummDialogOpen(false)}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}