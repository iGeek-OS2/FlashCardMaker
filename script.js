pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

document.addEventListener('DOMContentLoaded', () => {
   
    const PROXY_SERVER_URL = 'https://flashmaker-api-proxy.dfg147147147.workers.dev'; 

    // --- 状態管理 ---
    const state = {
        pdfText: '',
        flashcards: [],
        currentCardIndex: 0,
        correctAnswers: 0,
        isGenerating: false,
        selectedCardCount: 10,
    };

    // --- DOM要素 ---
    const views = {
        initial: document.getElementById('initial-view'),
        flashcard: document.getElementById('flashcard-view'),
        finished: document.getElementById('finished-view'),
        error: document.getElementById('error-view'),
    };
    const modals = {
        overlay: document.getElementById('modal-overlay'),
        help: document.getElementById('help-modal'),
        explanation: document.getElementById('explanation-modal'),
    };

    const generateCardsBtn = document.getElementById('generate-cards-btn');
    const pdfInput = document.getElementById('pdf-input');
    const pdfStatus = document.getElementById('pdf-status');
    const cardFlipper = document.getElementById('card-flipper');
    const answerButtons = document.getElementById('answer-buttons');
    
    const dropdown = document.getElementById('card-count-dropdown');
    const dropdownToggle = document.getElementById('dropdown-toggle');
    const dropdownOptions = document.getElementById('dropdown-options');
    const selectedCountText = document.getElementById('selected-count-text');
    const chevron = dropdownToggle.querySelector('i');
    const uploadArea = document.getElementById('upload-area');


    // --- 表示切り替え関数 ---
    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.add('hidden'));
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
        }
    }
    
    function showError(message) {
        document.getElementById('error-message').textContent = message;
        showView('error');
    }

    function showModal(modalName) {
        Object.values(modals).forEach(modal => {
            if (modal) modal.classList.add('hidden');
        });
        if (modals.overlay) {
            modals.overlay.classList.remove('hidden');
            modals.overlay.classList.add('flex');
        }
        if (modals[modalName]) {
            modals[modalName].classList.remove('hidden');
        }
    }

    function closeModal() {
        if(modals.overlay) {
            modals.overlay.classList.add('hidden');
            modals.overlay.classList.remove('flex');
        }
    }

    // --- 初期化処理 ---
    function init() {
        showView('initial');
        setupEventListeners();
    }
    
    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        uploadArea.addEventListener('click', () => pdfInput.click());
        pdfInput.addEventListener('change', handlePdfUpload);
        generateCardsBtn.addEventListener('click', generateFlashcards);

        // Custom Dropdown Logic
        dropdownToggle.addEventListener('click', () => {
            dropdownOptions.classList.toggle('hidden');
            chevron.classList.toggle('rotate-180');
        });

        dropdownOptions.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.target.tagName === 'A') {
                const count = e.target.dataset.count;
                state.selectedCardCount = parseInt(count, 10);
                selectedCountText.textContent = count;
                dropdownOptions.classList.add('hidden');
                chevron.classList.remove('rotate-180');
            }
        });

        window.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) {
                dropdownOptions.classList.add('hidden');
                chevron.classList.remove('rotate-180');
            }
        });

        document.getElementById('import-json-btn').addEventListener('click', () => document.getElementById('json-input').click());
        document.getElementById('json-input').addEventListener('change', handleJsonImport);

        document.getElementById('help-btn').addEventListener('click', () => showModal('help'));
        document.querySelectorAll('.close-modal-btn').forEach(btn => btn.addEventListener('click', closeModal));
        modals.overlay.addEventListener('click', (e) => {
            if (e.target === modals.overlay) closeModal();
        });

        cardFlipper.addEventListener('click', flipCard);
        document.getElementById('correct-btn').addEventListener('click', () => handleAnswer(true));
        document.getElementById('incorrect-btn').addEventListener('click', () => handleAnswer(false));
        document.getElementById('ai-explain-btn').addEventListener('click', generateExplanation);

        document.getElementById('restart-btn').addEventListener('click', restartQuiz);
        document.getElementById('back-to-title-btn').addEventListener('click', resetApp);
        document.getElementById('error-back-btn').addEventListener('click', resetApp);

        document.getElementById('export-json-btn').addEventListener('click', () => exportData('json'));
        document.getElementById('export-csv-btn').addEventListener('click', () => exportData('csv'));
    }

    // --- PDF処理 ---
    async function handlePdfUpload(event) {
        const files = event.target.files;
        if (!files.length) return;

        pdfStatus.textContent = `読込中...`;
        document.getElementById('upload-text').textContent = 'ファイルを処理しています...';
        
        let fileNames = Array.from(files).map(f => f.name).join(', ');
        
        let fullText = '';
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                for (let j = 1; j <= pdf.numPages; j++) {
                    const page = await pdf.getPage(j);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map(item => item.str).join('\n') + '\n\n';
                }
            } catch (err) {
                showError(`PDFファイルの処理中にエラーが発生しました: ${file.name}. ${err.message}`);
                document.getElementById('upload-text').textContent = 'クリックしてファイルを選択';
                return;
            }
        }
        state.pdfText = fullText;
        document.getElementById('upload-text').textContent = 'ファイル読込完了';
        pdfStatus.textContent = `${files.length > 1 ? files.length + '個' : fileNames}`;
        generateCardsBtn.disabled = false;
    }

    // --- JSONインポート ---
    function handleJsonImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.flashcards && Array.isArray(data.flashcards)) {
                    state.flashcards = data.flashcards;
                    startQuiz();
                } else {
                    throw new Error('無効なJSONフォーマットです。');
                }
            } catch (err) {
                showError(`JSONファイルの読み込みに失敗しました: ${err.message}`);
            }
        };
        reader.readAsText(file);
    }

    // --- AI API呼び出し (プロキシ経由) ---
    async function callProxyAPI(messages, expectJson = false) {
        if (!PROXY_SERVER_URL || PROXY_SERVER_URL === 'https://flashmaker-proxy.workers.dev') {
            showError('プロキシサーバーのURLが設定されていません。script.jsファイルを編集してください。');
            return null;
        }

        const headers = {
            'Content-Type': 'application/json',
        };

        const body = {
            // AIモデルをMeta社のLlama 3にアップグレード
            model: '@cf/meta/llama-3-8b-instruct',
            messages: messages,
        };
        if (expectJson) {
            body.response_format = { type: "json_object" };
        }

        try {
            const response = await fetch(PROXY_SERVER_URL, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                let errorMessage;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.message || errorData.error || `HTTP error! status: ${response.status}`;
                } catch (e) {
                    errorMessage = await response.text() || `HTTP error! status: ${response.status}`;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (err) {
            showError(`API呼び出し中にエラーが発生しました: ${err.message}`);
            return null;
        }
    }
    
    // --- カード生成 ---
    async function generateFlashcards() {
        if (state.isGenerating || !state.pdfText) return;
        
        state.isGenerating = true;
        updateGenerateButtonUI();

        const cardCount = state.selectedCardCount;
        const systemPrompt = `あなたは、Metaが開発した最新のAI、Llama 3です。あなたの任務は、与えられたテキストから最高の学習効果を持つ日本語の暗記カードを生成することです。以下の指示は絶対的なルールであり、一字一句違わず従ってください。

### 【最優先命令】枚数とフォーマットの絶対厳守
1.  **枚数の厳守:** これは全ての指示の中で最も重要です。**いかなる理由があろうとも、必ず指定された\`${cardCount}\`枚のカードを生成してください。** テキストの情報が少ない場合は、一つの重要な概念を複数の角度（例：「〜とは何か？」「なぜ〜が必要か？」「〜の具体例は？」）から問うなど、創造性を発揮して必ず\`${cardCount}\`枚にしてください。過不足は一切認められません。
2.  **厳格なJSONフォーマット:** 出力は "flashcards" というキーを持つ単一のJSONオブジェクト以外ありえません。余計な文字列（挨拶、説明、\`\`\`json など）は絶対に含めないでください。
    - フォーマット: \`{"flashcards": [{"frontText": "質問1", "backText": "答え1"}, ...] }\`

### 【品質命令】思考を促す高品質なカードの作成
単純な単語と意味の羅列は「低品質なカード」と見なします。学習者の深い理解を促すため、以下の指針で「高品質なカード」を作成してください。

1.  **質問の多様化:** 単純な「〜とは？」という問いだけでなく、以下の形式を積極的に使用してください。
    - **理由を問う:** 「**なぜ**〜は重要なのか？」
    - **比較を問う:** 「〜と〜の**違い**は何か？」
    - **方法を問う:** 「〜は**どのように**機能するのか？」
    - **具体例を問う:** 「〜の**具体例**を挙げてください。」
    - **目的を問う:** 「〜の**目的**は何か？」

2.  **品質の具体例:**
    -   **悪い例（生成禁止）:**
        -   \`{"frontText": "公開鍵暗号", "backText": "公開鍵と秘密鍵のペアで暗-号化・復号を行う方式"}\`
    -   **良い例（このようなカードを生成せよ）:**
        -   \`{"frontText": "公開鍵暗号方式が、従来の共通鍵暗号方式と比べて安全性が高いとされる主な理由は何ですか？", "backText": "秘密鍵を通信相手に渡す必要がなく、盗聴のリスクを根本的に排除できるため。"}\`
        -   \`{"frontText": "デジタル署名において、送信者が自身の秘密鍵で署名する目的は何ですか？", "backText": "送信者の本人性と、メッセージが改ざんされていないことを保証するため。"}\`

3.  **回答の簡潔さ:** \`backText\`は、質問の核に答える最も重要なキーワードや短い一文にしてください。冗長な説明は不要です。

### 【その他のルール】
-   **抽出対象:** 教科書や資料の本文から、学術的な概念、定義、事実のみを抽出してください。
-   **除外対象:** シラバス、成績評価、参考文献、授業スケジュール、日付、ページ番号、著者名、挨拶、雑談など、学習内容と無関係なメタ情報は完全に無視してください。
-   **言語:** 全て日本語で生成してください。

### 【実行】
以上の全ての指示、特に【最優先命令】と【品質命令】を厳守し、提供されたテキストから最高の学習体験をもたらす\`${cardCount}\`個の暗記カードを生成してください。`;
        
        const userQuery = `以下のテキストを分析し、主要な概念に基づいた${cardCount}個のフラッシュカード（質問と答え）を作成してください:\n\n${state.pdfText.substring(0, 15000)}`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
        ];

        const responseContent = await callProxyAPI(messages, true);
        
        state.isGenerating = false;
        updateGenerateButtonUI();
        
        if (responseContent) {
            try {
                // Sometimes the response might be wrapped in ```json ... ```, so we need to clean it.
                const cleanedResponse = responseContent.replace(/^```json\s*|```$/g, '').trim();
                const parsed = JSON.parse(cleanedResponse);
                if (parsed.flashcards) {
                    state.flashcards = parsed.flashcards;
                    startQuiz();
                } else {
                    throw new Error('APIの応答に "flashcards" 配列が含まれていません。');
                }
            } catch (err) {
                showError(`AIの応答の解析に失敗しました。応答が有効なJSONではありません。エラー: ${err.message}`);
            }
        }
    }
    
    function updateGenerateButtonUI() {
        const btnText = document.getElementById('generate-btn-text');
        const spinner = document.getElementById('generate-spinner');
        if (state.isGenerating) {
            generateCardsBtn.disabled = true;
            btnText.classList.add('hidden');
            spinner.classList.remove('hidden');
        } else {
            generateCardsBtn.disabled = !state.pdfText;
            btnText.classList.remove('hidden');
            spinner.classList.add('hidden');
        }
    }

    // --- クイズロジック ---
    function startQuiz() {
        state.currentCardIndex = 0;
        state.correctAnswers = 0;
        if (state.flashcards.length === 0) {
            showError('生成されたカードがありません。');
            return;
        }
        // 配列をシャッフル
        state.flashcards.sort(() => Math.random() - 0.5);
        showView('flashcard');
        displayCurrentCard();
    }

    function displayCurrentCard() {
        if (state.currentCardIndex >= state.flashcards.length) {
            finishQuiz();
            return;
        }

        const card = state.flashcards[state.currentCardIndex];
        document.getElementById('card-front').textContent = card.frontText;
        document.getElementById('card-back').textContent = card.backText;
        
        cardFlipper.classList.remove('flipped');
        answerButtons.classList.add('hidden');

        const progress = ((state.currentCardIndex + 1) / state.flashcards.length) * 100;
        document.getElementById('card-progress').textContent = `第${state.currentCardIndex + 1}問 / ${state.flashcards.length}問`;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }

    function flipCard() {
        cardFlipper.classList.toggle('flipped');
        answerButtons.classList.toggle('hidden');
    }

    function handleAnswer(isCorrect) {
        if (isCorrect) {
            state.correctAnswers++;
        }
        state.currentCardIndex++;
        displayCurrentCard();
    }

    function finishQuiz() {
        showView('finished');
        const total = state.flashcards.length;
        const correct = state.correctAnswers;
        const incorrect = total - correct;

        document.getElementById('correct-count').textContent = correct;
        document.getElementById('incorrect-count').textContent = incorrect;
        
        const circumference = 2 * Math.PI * 45; // 2 * pi * r
        const correctOffset = total > 0 ? circumference * (1 - (correct / total)) : circumference;
        const incorrectOffset = total > 0 ? circumference * (1 - (incorrect / total)) : circumference;

        setTimeout(() => {
            document.getElementById('correct-circle').style.strokeDashoffset = correctOffset;
            document.getElementById('incorrect-circle').style.strokeDashoffset = incorrectOffset;
        }, 100);
    }

    function restartQuiz() {
        startQuiz();
    }

    function resetApp() {
        state.pdfText = '';
        state.flashcards = [];
        pdfStatus.textContent = '';
        document.getElementById('upload-text').textContent = 'クリックしてファイルを選択';
        generateCardsBtn.disabled = true;
        pdfInput.value = ''; // ファイル選択をリセット
        showView('initial');
    }

    // --- AI解説 ---
    async function generateExplanation() {
        const explainBtnIcon = document.getElementById('explain-btn-icon');
        const explainSpinner = document.getElementById('explain-spinner');
        const aiExplainBtn = document.getElementById('ai-explain-btn');
        
        aiExplainBtn.disabled = true;
        explainBtnIcon.classList.add('hidden');
        explainSpinner.classList.remove('hidden');

        const currentCard = state.flashcards[state.currentCardIndex];
        const question = currentCard.frontText;
        const answer = currentCard.backText;

        document.getElementById('explanation-question').textContent = question;
        document.getElementById('explanation-content').innerHTML = '<div class="flex items-center justify-center h-full"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
        showModal('explanation');

        const systemPrompt = `あなたは、複雑な概念を初心者に分かりやすく**日本語で**解説する専門家AIです。あなたの任務は、与えられた暗記カードの「質問」と「答え」を基に、Markdown形式で詳細な解説を生成することです。以下の指示に厳密に従ってください。

### 役割
- 教育的な解説者として、親しみやすく、かつ正確な情報を**日本語で**提供する。

### 禁止事項
- **英語や他の言語の使用は絶対に禁止です。全ての応答は日本語で行ってください。**
- 指示されたMarkdownフォーマット以外の形式を使用しないこと。
- 曖昧な表現や専門的すぎる用語を避けること。
- 解説以外の余計な挨拶や文章を含めないこと。

### 解説の構造とフォーマット
あなたの出力は、以下の構造を厳密に守る必要があります。

1.  **結論 (H2見出し):**
    - \`## 結論 💡\` という見出しを必ず使用する。
    - 質問に対する答えの要点を、**1文で**簡潔に述べる。

2.  **解説 (H2見出し):**
    - \`## 解説 📝\` という見出しを必ず使用する。
    - 重要なキーワードを \`**太字**\` で強調する。
    - 2〜3つのポイントに分けて、箇条書き（\`* 項目\`）で分かりやすく説明する。
    - 各ポイントは平易な言葉で記述し、必要に応じて絵文字を使い、理解を助ける。

### 実行
以上の指示に基づき、提供された質問と答えについて**日本語で**解説を生成してください。`;
        const userQuery = `以下の内容について解説してください。\n\n質問: ${question}\n答え: ${answer}`;

        const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userQuery }];
        const explanationText = await callProxyAPI(messages);

        if (explanationText) {
            document.getElementById('explanation-content').innerHTML = marked.parse(explanationText);
        } else {
            document.getElementById('explanation-content').textContent = '解説の生成に失敗しました。';
        }
        
        aiExplainBtn.disabled = false;
        explainBtnIcon.classList.remove('hidden');
        explainSpinner.classList.add('hidden');
    }

    // --- データエクスポート ---
    function exportData(format) {
        let content = '';
        let filename = '';
        let mimeType = '';

        if (format === 'json') {
            content = JSON.stringify({ flashcards: state.flashcards }, null, 2);
            filename = 'flashcards.json';
            mimeType = 'application/json';
        } else if (format === 'csv') {
            const header = "FrontText,BackText,Comment,FrontTextLanguage,BackTextLanguage\n";
            const rows = state.flashcards.map(card => 
                `"${card.frontText.replace(/"/g, '""')}","${card.backText.replace(/"/g, '""')}",,ja-JP,ja-JP`
            ).join('\n');
            content = header + rows;
            filename = 'wordholic_cards.csv';
            mimeType = 'text/csv;charset=utf-8;';
        }

        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // --- アプリケーション開始 ---
    init();
});

