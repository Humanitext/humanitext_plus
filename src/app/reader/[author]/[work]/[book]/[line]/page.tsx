"use client";
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import CETEI from "CETEIcean";
import { GoogleGenAI } from "@google/genai";

// 型定義を追加
interface SPARQLBinding {
    type: string;
    value: string;
}

interface SPARQLResult {
    text?: SPARQLBinding;
    line: SPARQLBinding;
    commentary?: SPARQLBinding;
}

interface SPARQLResponse {
    results: {
        bindings: SPARQLResult[];
    };
}

interface CommentaryBinding {
    seg: SPARQLBinding;
    annotator: SPARQLBinding;
    work: SPARQLBinding;
    book: SPARQLBinding;
}

interface CommentaryResponse {
    results: {
        bindings: CommentaryBinding[];
    };
}

interface TextData {
    line: string;
    commentary: string[];
}

const genAI = new GoogleGenAI({
    apiKey: process.env.NEXT_PUBLIC_GENAI_API_KEY || ""
});

export default function CommentaryPage() {
    const params = useParams();
    const router = useRouter();
    const { author, work, book, line } = params;

    //const [texts, setTexts] = useState<{ value: { line: string; commentary: string[] }[] }>({ value: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [lang, setLang] = useState<string>('Japanese');
    const [processedText, setProcessedText] = useState<string>('');
    const [isTransSummDialogOpen, setIsTransSummDialogOpen] = useState<boolean>(false);

    const [options] = useState<{ id: string; label: string }[]>([
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

    useEffect(() => {
        if (author && work && book && line) {
            handleShowTextWithLine(
                decodeURIComponent(author as string),
                decodeURIComponent(work as string),
                decodeURIComponent(book as string),
                decodeURIComponent(line as string)
            );
        }
    }, [author, work, book, line]);

    // LLM処理関数
    const LLMProcess = async (text: string, mode: string, selectedLang: string) => {
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

    // 翻訳機能
    const commentaryTranslate = (commentaryDesc: string, selectedLang: string) => {
        console.log(commentaryDesc);
        LLMProcess(commentaryDesc, "translate", selectedLang).then((translatedText) => {
            if (translatedText) {
                setProcessedText(translatedText);
                setIsTransSummDialogOpen(true);
            }
        });
    };

    // 要約機能
    const commentarySummarize = (commentaryDesc: string, selectedLang: string) => {
        console.log(commentaryDesc);
        LLMProcess(commentaryDesc, "summarize", selectedLang).then((summarizedText) => {
            if (summarizedText) {
                setProcessedText(summarizedText);
                setIsTransSummDialogOpen(true);
            }
        });
    };

    const handleShowTextWithLine = async (authorParam: string, workParam: string, bookParam: string, lineParam: string) => {
        setIsLoading(true);

        try {
            // 1. SPARQLクエリでデータを取得
            const endpoint = "https://dydra.com/junjun7613/humanitextonto/sparql";
            const query = `
                PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

                SELECT DISTINCT ?text ?line ?commentary WHERE {
                ?author a <http://example.org/vocabulary/Author> ;
                        rdfs:label "${authorParam}" .
                ?work a <http://example.org/vocabulary/Work> ;
                        rdfs:label "${workParam}" ;
                        <http://purl.org/dc/elements/1.1/creator> ?author .
                ?text a <http://example.org/vocabulary/Text>;
                    <http://example.org/vocabulary/correspondingWork> ?work ;
                    <http://example.org/vocabulary/correspondingBook> "${bookParam}" ;
                    <http://purl.org/dc/elements/1.1/creator> ?author.
                ?text <http://example.org/vocabulary/correspondingSeg> ?line .

                OPTIONAL{?commentary <http://example.org/vocabulary/references> ?text}
                }
            `;

            const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
            const response = await fetch(url);
            const data = await response.json() as SPARQLResponse;

            // 2. textsデータを構築
            const textsData: TextData[] = [];
            data.results.bindings.forEach((binding: SPARQLResult) => {
                const existingText = textsData.find((text) => text.line === binding.line.value);
                if (existingText) {
                    existingText.commentary.push(binding.commentary ? binding.commentary.value : '');
                } else {
                    textsData.push({
                        line: binding.line.value,
                        commentary: binding.commentary ? [binding.commentary.value] : []
                    });
                }
            });

            //setTexts({ value: textsData });

            // 3. TEIテキストを表示
            await displayTEIText(authorParam, workParam, bookParam, textsData, lineParam);

            // 4. 特定のlineのcommentaryを自動表示
            setTimeout(() => {
                displayCommentary(lineParam, textsData);
            }, 1000);

        } catch (error) {
            console.error('Error loading text:', error);
        } finally {
            setIsLoading(false);
        }

    };

    const displayTEIText = async (authorParam: string, workParam: string, bookParam: string, textsData: TextData[], targetLine?: string) => {
        const xml_path = `https://humanitext-dts-data.vercel.app/xml/${authorParam}/${workParam}/${bookParam}.xml`;
        const CETEIcean = new CETEI();

        const text_behaviors = {
            "tei": {
                "seg": (element: HTMLElement) => {
                    const xmlId = element.getAttribute('xml:id');
                    if (xmlId) {
                        const idSpan = document.createElement("span");
                        idSpan.textContent = `[${xmlId}] `;
                        idSpan.style.fontSize = "14px";

                        // 目標のlineの場合はハイライト
                        if (targetLine && xmlId === targetLine) {
                            idSpan.style.backgroundColor = "#ffeb3b"; // 黄色でハイライト
                            idSpan.style.fontWeight = "bold";
                            idSpan.style.padding = "2px 4px";
                            idSpan.style.borderRadius = "3px";
                            // スクロール用のIDを設定
                            idSpan.id = `target-line-${xmlId}`;
                            element.id = `target-element-${xmlId}`;
                        }

                        element.parentNode.insertBefore(idSpan, element);

                        const matchingText = textsData.find((text) => text.line === xmlId);
                        if (matchingText && matchingText.commentary && matchingText.commentary.length > 0) {
                            idSpan.style.color = "blue";
                            idSpan.style.cursor = "pointer";
                            idSpan.addEventListener("click", () => {
                                displayCommentary(xmlId, textsData);
                                // URLを更新
                                const newUrl = `/reader/${encodeURIComponent(authorParam)}/${encodeURIComponent(workParam)}/${encodeURIComponent(bookParam)}/${encodeURIComponent(xmlId)}`;
                                window.history.pushState({}, '', newUrl);
                            });
                        }
                    }
                    element.style.display = "block";
                    element.style.marginBottom = "10px";
                },
                "app": function(elt) {
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
                                lemSpan.addEventListener("mouseenter", function() {
                                    popup.style.display = "block";
                                });

                                lemSpan.addEventListener("mouseleave", function() {
                                    popup.style.display = "none";
                                });

                                container.appendChild(lemSpan);
                                container.appendChild(popup);

                                return container;
                                }


            }
        };

        CETEIcean.addBehaviors(text_behaviors);
        CETEIcean.getHTML5(xml_path, function (data: Document) {
            const body = data.getElementById(bookParam);
            const teiElem = document.getElementById("TEI");
            if (teiElem && body) {
                teiElem.innerHTML = '';  // 既存の内容をクリア
                teiElem.appendChild(body);

                // 目標のlineがある場合、スクロールして中央に表示
                if (targetLine) {
                    setTimeout(() => {
                        scrollToTargetLine(targetLine);
                    }, 500); // DOM構築を待つ
                }
            }
        });
    };

    // 目標のlineまでスクロールする関数
    const scrollToTargetLine = (targetLine: string) => {
        const targetElement = document.getElementById(`target-line-${targetLine}`) ||
            document.getElementById(`target-element-${targetLine}`);

        if (targetElement) {
            const teiContainer = document.getElementById("TEI");
            if (teiContainer) {
                // より確実なスクロール方法を使用
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // 代替方法：scrollIntoViewが効かない場合
                setTimeout(() => {
                    const elementRect = targetElement.getBoundingClientRect();
                    const containerRect = teiContainer.getBoundingClientRect();

                    if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
                        const scrollTop = teiContainer.scrollTop +
                            elementRect.top - containerRect.top -
                            (containerRect.height / 2) +
                            (elementRect.height / 2);

                        teiContainer.scrollTo({
                            top: scrollTop,
                            behavior: 'smooth'
                        });
                    }
                }, 100);

                // アニメーション効果
                targetElement.style.transition = 'all 0.3s ease';
                targetElement.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    targetElement.style.transform = 'scale(1)';
                }, 1000);
            }
        } else {
            console.warn(`Target element not found: ${targetLine}`);
            // 要素が見つからない場合の代替処理
            setTimeout(() => {
                scrollToTargetLine(targetLine);
            }, 500);
        }
    };

    const displayCommentary = (xmlId: string, textsData: TextData[]) => {
        const matchingText = textsData.find((text) => text.line === xmlId);
        const container = document.getElementById("commentary_container");

        if (!container || !matchingText || !matchingText.commentary || matchingText.commentary.length === 0) {
            return;
        }

        // container内をクリア
        container.innerHTML = '';

        const endpoint = "https://dydra.com/junjun7613/humanitextonto/sparql";

        matchingText.commentary.forEach((commentary: string) => {
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
                .then((data: CommentaryResponse) => {
                    data.results.bindings.forEach((binding: CommentaryBinding) => {
                        const dts_api = `https://humanitext-dts.vercel.app/api/dts/document?id=urn:${binding.annotator.value}.${binding.work.value}:${binding.book.value}&ref=${binding.seg.value}`;

                        c.getHTML5(dts_api, function (data: Document) {
                            const body = data.getElementById(binding.seg.value);
                            if (body) {
                                createCommentaryCard(binding, body, xmlId, container);
                            }
                        });
                    });
                });
        });
    };

    const createCommentaryCard = (binding: CommentaryBinding, body: HTMLElement, xmlId: string, container: HTMLElement) => {
        const stringBody = body.innerHTML;

        // カード作成
        const card = document.createElement("div");
        card.style.marginBottom = "20px";
        card.style.border = "1px solid #ccc";
        card.style.borderRadius = "8px";

        // カードヘッダー
        const cardHeader = document.createElement("div");
        cardHeader.style.padding = "15px 20px 10px 20px";
        cardHeader.style.backgroundColor = "#f8f9fa";
        cardHeader.style.borderBottom = "1px solid #e9ecef";
        cardHeader.style.borderRadius = "8px 8px 0 0";

        // カードタイトル
        const cardTitle = document.createElement("h3");
        cardTitle.textContent = `${binding.annotator.value}: ${binding.work.value}:${binding.book.value}`;
        cardTitle.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
        cardTitle.style.fontSize = "18px";
        cardTitle.style.margin = "0";
        cardTitle.style.fontWeight = "600";

        // 表示/非表示切り替えボタン
        const toggleButton = document.createElement("button");
        toggleButton.textContent = "非表示"; // URLアクセス時は展開されているので「非表示」
        toggleButton.style.padding = "6px 12px";
        toggleButton.style.backgroundColor = "#6c757d"; // グレー色で「非表示」状態を表示
        toggleButton.style.color = "white";
        toggleButton.style.border = "none";
        toggleButton.style.borderRadius = "4px";
        toggleButton.style.cursor = "pointer";
        toggleButton.style.fontSize = "12px";
        toggleButton.style.fontWeight = "500";
        toggleButton.style.marginTop = "10px";

        // カードコンテンツ
        const cardContent = document.createElement("div");
        cardContent.style.display = "block"; // URLアクセス時は自動展開

        // カードボディ
        const cardBody = document.createElement("div");
        cardBody.appendChild(body);
        cardBody.style.fontFamily = "Georgia, 'Times New Roman', Times, serif";
        cardBody.style.fontSize = "16px";
        cardBody.style.overflow = "auto";
        cardBody.style.maxHeight = "400px";
        cardBody.style.padding = "20px";
        cardBody.style.lineHeight = "1.6";
        cardBody.style.backgroundColor = "#ffffff";

        // カードフッター
        const cardFooter = document.createElement("div");
        cardFooter.style.padding = "15px 20px";
        cardFooter.style.backgroundColor = "#f8f9fa";
        cardFooter.style.borderTop = "1px solid #e9ecef";
        cardFooter.style.borderRadius = "0 0 8px 8px";
        cardFooter.style.display = "flex";
        cardFooter.style.alignItems = "center";
        cardFooter.style.gap = "15px";

        // 言語選択
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
        langSelect.addEventListener("change", (event) => {
            const newLang = (event.target as HTMLSelectElement).value;
            setLang(newLang);
        });

        // 翻訳ボタン
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

        // 要約ボタン
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

        // URLコピーボタン
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
        let isExpanded = true; // URLアクセス時は展開状態
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

        container.appendChild(card);
    };

    const copyCommentaryUrl = (xmlId: string) => {
        const url = `${window.location.origin}/reader/${encodeURIComponent(author as string)}/${encodeURIComponent(work as string)}/${encodeURIComponent(book as string)}/${encodeURIComponent(xmlId)}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('Commentary URL copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy URL:', err);
            alert('Failed to copy URL to clipboard');
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-lg">Loading...</div>
            </div>
        );
    }

    return (
        <main className="w-full min-h-screen bg-white px-4 sm:px-8 md:px-16 lg:px-32 xl:px-48 py-8 box-border">
            <h1 className="text-2xl font-bold mb-8">
                <img
                    src="/logo02.png"
                    alt="Logo"
                    className="inline-block h-12"
                    style={{ maxHeight: 48, width: "auto", cursor: "pointer" }}
                    onClick={() => router.push("/")}
                />
            </h1>

            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p><strong>Author:</strong> {decodeURIComponent(author as string)}</p>
                <p><strong>Work:</strong> {decodeURIComponent(work as string)}</p>
                <p><strong>Book:</strong> {decodeURIComponent(book as string)}</p>
                <p><strong>Line:</strong> {decodeURIComponent(line as string)}</p>
            </div>

            <section className="flex h-[80vh] min-h-[400px] gap-4">
                <div className="flex-1 flex flex-col">
                    <div
                        id="TEI"
                        className="flex-1 overflow-y-auto p-4 bg-gray-50 border rounded"
                        style={{ maxHeight: '80vh' }}
                    />
                </div>
                <div id="commentary_container" className="flex-1 flex flex-col overflow-y-auto mb-4 rounded" />
            </section>

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