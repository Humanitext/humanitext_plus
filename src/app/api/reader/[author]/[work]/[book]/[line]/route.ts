import { NextRequest, NextResponse } from 'next/server';

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

interface CommentaryDetail {
    id: string;
    annotator: string;
    work: string;
    book: string;
    segment: string;
    text: string;
    dts_url: string;
    error?: string;
}

export async function GET(
    request: NextRequest,
    { params }: { params: { author: string; work: string; book: string; line: string } }
) {
    try {
        const { author, work, book, line } = params;
        
        // URLデコード
        const authorParam = decodeURIComponent(author);
        const workParam = decodeURIComponent(work);
        const bookParam = decodeURIComponent(book);
        const lineParam = decodeURIComponent(line);

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
        //const textsData: { line: string; commentary: string[] }[] = [];
        const textsData: TextData[] = [];
        data.results.bindings.forEach((binding: SPARQLResult) => {
            const existingText = textsData.find((text) => text.line === binding.line.value);
            if (existingText) {
                if (binding.commentary) {
                    existingText.commentary.push(binding.commentary.value);
                }
            } else {
                textsData.push({
                    line: binding.line.value,
                    commentary: binding.commentary ? [binding.commentary.value] : []
                });
            }
        });

        // 3. 指定されたlineのコメンタリーを取得
        const targetLineData = textsData.find(text => text.line === lineParam);
        
        if (!targetLineData || !targetLineData.commentary || targetLineData.commentary.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'No commentary found for the specified line',
                data: {
                    author: authorParam,
                    work: workParam,
                    book: bookParam,
                    line: lineParam,
                    commentaries: []
                }
            });
        }

        // 4. 各コメンタリーの詳細データを取得
        const commentaryDetails: CommentaryDetail[] = [];
        
        for (const commentary of targetLineData.commentary) {
            if (!commentary) continue;

            const commentaryQuery = `
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

            const commentaryUrl = `${endpoint}?query=${encodeURIComponent(commentaryQuery)}&format=json`;
            const commentaryResponse = await fetch(commentaryUrl);
            const commentaryData = await commentaryResponse.json() as CommentaryResponse;

            for (const binding of commentaryData.results.bindings) {
                const dts_api = `https://humanitext-dts.vercel.app/api/dts/document?id=urn:${binding.annotator.value}.${binding.work.value}:${binding.book.value}&ref=${binding.seg.value}`;
                
                try {
                    const dtsResponse = await fetch(dts_api);
                    const dtsText = await dtsResponse.text();
                    
                    // XMLパースは簡略化（実際の実装では適切なXMLパーサーを使用）
                    const segMatch = dtsText.match(new RegExp(`<[^>]*id="${binding.seg.value}"[^>]*>(.*?)<\/[^>]*>`, 's'));
                    const textContent = segMatch ? segMatch[1].replace(/<[^>]*>/g, '').trim() : '';

                    commentaryDetails.push({
                        id: commentary,
                        annotator: binding.annotator.value,
                        work: binding.work.value,
                        book: binding.book.value,
                        segment: binding.seg.value,
                        text: textContent,
                        dts_url: dts_api
                    });
                } catch (error) {
                    console.error('Error fetching DTS data:', error);
                    commentaryDetails.push({
                        id: commentary,
                        annotator: binding.annotator.value,
                        work: binding.work.value,
                        book: binding.book.value,
                        segment: binding.seg.value,
                        text: 'Error loading commentary text',
                        dts_url: dts_api,
                        error: 'Failed to fetch DTS data'
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                author: authorParam,
                work: workParam,
                book: bookParam,
                line: lineParam,
                commentaries: commentaryDetails
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}