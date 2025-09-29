// pdf.jsのワーカーを設定
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

document.addEventListener('DOMContentLoaded', () => {
    // --- 状態管理 ---
    const state = {
        apiKey: localStorage.getItem('apiKey') || '',
        pdfText: '',
        flashcards: [],
        currentCardIndex: 0,
        correctAnswers: 0,
        isGenerating: false,
        selectedCardCount: 20,
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
        settings: document.getElementById('settings-modal'),
        help: document.getElementById('help-modal'),
        explanation: document.getElementById('explanation-modal'),
    };

    const generateCardsBtn = document.getElementById('generate-cards-btn');
    const pdfInput = document.getElementById('pdf-input');
    const pdfStatus = document.getElementById('pdf-status');
    const cardFlipper = document.getElementById('card-flipper');
    const answerButtons = document.getElementById('answer-buttons');
    const cardCountContainer = document.getElementById('card-count-options');

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
        loadSettings();
        if (!state.apiKey) {
            setTimeout(() => showModal('settings'), 500);
        }
    }
    
    // --- 設定の読み込みと保存 ---
    function loadSettings() {
        document.getElementById('api-key-input').value = state.apiKey;
    }

    function saveSettings() {
        state.apiKey = document.getElementById('api-key-input').value;
        localStorage.setItem('apiKey', state.apiKey);

        const saveBtnText = document.getElementById('save-settings-text');
        const saveBtnSuccess = document.getElementById('save-settings-success');
        saveBtnText.classList.add('hidden');
        saveBtnSuccess.classList.remove('hidden');
        setTimeout(() => {
            saveBtnText.classList.remove('hidden');
            saveBtnSuccess.classList.add('hidden');
            closeModal();
        }, 1500);
    }

    // --- イベントリスナー設定 ---
    function setupEventListeners() {
        document.getElementById('upload-pdf-btn').addEventListener('click', () => pdfInput.click());
        pdfInput.addEventListener('change', handlePdfUpload);
        generateCardsBtn.addEventListener('click', generateFlashcards);

        cardCountContainer.addEventListener('click', e => {
            if (e.target.tagName === 'BUTTON' && e.target.classList.contains('card-count-btn')) {
                cardCountContainer.querySelector('.selected')?.classList.remove('selected');
                 e.target.classList.add('selected');
                state.selectedCardCount = parseInt(e.target.dataset.count, 10);
            }
        });

        document.getElementById('import-json-btn').addEventListener('click', () => document.getElementById('json-input').click());
        document.getElementById('json-input').addEventListener('change', handleJsonImport);

        document.getElementById('settings-btn').addEventListener('click', () => showModal('settings'));
        document.getElementById('help-btn').addEventListener('click', () => showModal('help'));
        document.querySelectorAll('.close-modal-btn').forEach(btn => btn.addEventListener('click', closeModal));
        modals.overlay.addEventListener('click', (e) => {
            if (e.target === modals.overlay) closeModal();
        });
        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

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

        pdfStatus.textContent = `読込中: 1 / ${files.length}...`;
        let fullText = '';
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            pdfStatus.textContent = `読込中: ${i + 1} / ${files.length}...`;
            try {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                for (let j = 1; j <= pdf.numPages; j++) {
                    const page = await pdf.getPage(j);
                    const textContent = await page.getTextContent();
                    // テキストブロックごとに改行を加えて結合する
                    fullText += textContent.items.map(item => item.str).join('\n') + '\n\n';
                }
            } catch (err) {
                 showError(`PDFファイルの処理中にエラーが発生しました: ${file.name}. ${err.message}`);
                return;
            }
        }
        state.pdfText = fullText;
        pdfStatus.textContent = `${files.length}個のPDFを読み込み完了！`;
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

    // --- AI API呼び出し ---
    async function callOpenRouterAPI(messages, expectJson = false) {
         if (!state.apiKey) {
            showError('APIキーが設定されていません。設定画面でキーを入力してください。');
            return null;
        }

        const headers = {
            'Authorization': `Bearer ${state.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': location.href
        };

        const body = {
            model: 'google/gemma-2-9b-it',
            messages: messages,
        };
        if (expectJson) {
            body.response_format = { type: "json_object" };
        }

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                let errorMessage;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error.message || `HTTP error! status: ${response.status}`;
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
        const systemPrompt = `あなたは、教育用コンテンツ作成を専門とするAIです。あなたの任務は、与えられたテキストから高品質な日本語の暗記カードを生成することです。以下の指示に厳密に従ってください。

### 役割
- テキストから**純粋な座学の内容（学術的な概念、定義、事実）のみ**を抽出する専門家。

### 禁止事項
- **無関係な情報の完全な無視:** 科目の全体説明、シラバス、成績評価、参考文献、授業スケジュール、授業回、講義名、日付、ページ番号、先生の名前・自己紹介・連絡先、挨拶、雑談など、学習内容そのものではないメタ情報は**絶対に**生成物に含めないこと。
- **余計なテキストの禁止:** JSONオブジェクト以外の挨拶、前置き、後書き、説明文は一切出力しないこと。
- **言語の混在禁止:** 全てのテキストは日本語で生成すること。

### 生成ルール
1.  **カードの品質:** 各カードは学習価値の高いものである必要があります。
    - **質問文の形式:** "frontText" は、単なる単語やフレーズではなく、**必ず完全な質問文（「〜とは何ですか？」、「〜について説明してください。」など）**にしてください。
    - **回答の簡潔さ:** "backText" は、質問に直接答える**最も重要なキーワードや、ごく短い一文**にしてください。**冗長な説明は絶対に含めないでください。**
    - **単語カードの禁止:** 単語とその意味だけのような、質の低いカードは生成しないでください。必ず概念の理解を問う形式にすること。
2.  **指定枚数の厳守:** 必ず${cardCount}個の暗記カードを生成すること。
3.  **厳格なJSONフォーマット:**
    - 出力は必ず単一のJSONオブジェクトであること。
    - JSONオブジェクトは "flashcards" という単一のキーを持つこと。
    - "flashcards" の値は、各要素が "frontText" と "backText" のキーを持つオブジェクトの配列であること。
    - 例: \`{"flashcards": [{"frontText": "質問1", "backText": "答え1"}, ...] }\`

### 実行
以上の指示に基づき、提供されたテキストから${cardCount}個の暗記カードを生成してください。`;
        const userQuery = `以下のテキストを分析し、主要な概念に基づいた${cardCount}個のフラッシュカード（質問と答え）を作成してください:\n\n${state.pdfText.substring(0, 15000)}`;

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userQuery }
        ];

        const responseContent = await callOpenRouterAPI(messages, true);
        
        state.isGenerating = false;
        updateGenerateButtonUI();
        
        if (responseContent) {
            try {
                const parsed = JSON.parse(responseContent);
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
        const explanationText = await callOpenRouterAPI(messages);

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

