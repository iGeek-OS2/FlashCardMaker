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
        selectedDifficulty: 'ふつう',
        selectedTextLength: 'ふつう', // 文章の長さの状態を追加
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
    const difficultySelector = document.getElementById('difficulty-selector');
    const textLengthSelector = document.getElementById('text-length-selector');
    const quizBackBtn = document.getElementById('quiz-back-btn');


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

        // Difficulty Selector Logic
        difficultySelector.addEventListener('click', (e) => {
            if (e.target.classList.contains('difficulty-btn')) {
                difficultySelector.querySelectorAll('.difficulty-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                state.selectedDifficulty = e.target.dataset.difficulty;
            }
        });

        // Text Length Selector Logic
        textLengthSelector.addEventListener('click', (e) => {
            if (e.target.classList.contains('length-btn')) {
                textLengthSelector.querySelectorAll('.length-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                state.selectedTextLength = e.target.dataset.length;
            }
        });
        
        quizBackBtn.addEventListener('click', resetApp);

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
        if (!PROXY_SERVER_URL || PROXY_SERVER_URL === 'https://flashmaker-api-proxy.dfg147147147.workers.dev') {
            showError('プロキシサーバーのURLが設定されていません。script.jsファイルを編集してください。');
            return null;
        }

        const headers = {
            'Content-Type': 'application/json',
        };

        const body = {
            model: 'google/gemma-3n-e2b-it:free',
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
        const cardTemplates = Array.from({ length: cardCount }, () => ({ frontText: "", backText: "" }));
        const jsonTemplate = JSON.stringify({ flashcards: cardTemplates }, null, 2);

        let difficultyInstruction = '';
        switch (state.selectedDifficulty) {
            case 'やさしい':
                difficultyInstruction = '質問は「〜とは何ですか？」のような、用語の定義を問う非常に基本的なものにしてください。答えは一言か、ごく短いフレーズで答えてください。';
                break;
            case 'むずかしい':
                difficultyInstruction = '質問は、複数の概念を比較させたり、原因や結果、重要性について考察させたりする、より深い理解を必要とするものにしてください。答えもそれに合わせて詳細に記述してください。';
                break;
            case 'ふつう':
            default:
                difficultyInstruction = '質問は「〜を説明してください」のような、基本的な概念の理解度を測る標準的なものにしてください。答えは要点をまとめた簡潔な説明にしてください。';
                break;
        }

        let textLengthInstruction = '';
        switch (state.selectedTextLength) {
            case 'みじかい':
                textLengthInstruction = '質問と答えの両方を、キーワードや非常に短い単語・フレーズレベルで構成してください。';
                break;
            case 'ながい':
                textLengthInstruction = '質問と答えは、背景情報や文脈を含んだ複数の文章で構成し、詳細に記述してください。';
                break;
            case 'ふつう':
            default:
                textLengthInstruction = '質問と答えは、要点をまとめた1〜2文の簡潔な文章で構成してください。';
                break;
        }

        const systemPrompt = `あなたは、提供されたPDFのテキスト内容を分析し、指定されたJSONフォーマットに従って日本語の暗記カードを完成させる専門家AIです。

### 【最優先タスク】
あなたの唯一のタスクは、以下のJSONテンプレートにある\`${cardCount}\`個の空の暗記カードオブジェクト（"frontText": "", "backText": ""）を、PDFの内容に基づいて具体的な質問と答えで埋めることです。

\`\`\`json
${jsonTemplate}
\`\`\`

### 【厳守事項】
1.  **構造の変更禁止:** 提供されたJSONの構造（キーの名前、オブジェクトの数）を絶対に変更しないでください。
2.  **枚数の厳守:** テンプレートにある\`${cardCount}\`個のカードをすべて埋めてください。数を増やしたり減らしたりしてはいけません。
3.  **内容の品質:**
    * **難易度: ${state.selectedDifficulty}** - ${difficultyInstruction}
    * **文章の長さ: ${state.selectedTextLength}** - ${textLengthInstruction}
    * 質問（frontText）と答え（backText）は、PDFからの内容。
5.  学習に無関係な情報（例：ページ番号、著者名、日付）は含めないでください。

### 【最終出力】
最終的な出力は、上記のテンプレートが完全に埋められた、単一の有効なJSONオブジェクトでなければなりません。余計なテキスト（例：「はい、承知しました」などの挨拶や、\`\`\`json ... \`\`\`のようなマークダウン）は一切含めないでください。`;
        
        const userQuery = `以下のテキストを分析し、提供されたJSONテンプレートを完成させてください。:\n\n${state.pdfText.substring(0, 15000)}`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
        ];

        const responseContent = await callProxyAPI(messages, true);
        
        state.isGenerating = false;
        updateGenerateButtonUI();
        
        if (responseContent) {
            try {
                const cleanedResponse = responseContent.replace(/^```json\s*|```$/g, '').trim();
                const parsed = JSON.parse(cleanedResponse);
                if (parsed.flashcards) {
                    const filledCards = parsed.flashcards.filter(card => card.frontText.trim() !== "" && card.backText.trim() !== "");
                    if (filledCards.length === 0) {
                        throw new Error('AIがカードを生成できませんでした。テキストが短すぎるか、内容が不適切である可能性があります。');
                    }
                    state.flashcards = filledCards;
                    startQuiz();
                } else {
                    throw new Error('APIの応答に "flashcards" 配列が含まれていません。');
                }
            } catch (err) {
                showError(`AIの応答の解析に失敗しました。エラー: ${err.message}`);
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
