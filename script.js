pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {

  // ════════════════════════════════════════════════════════════════
  // 設定
  // ════════════════════════════════════════════════════════════════
  const PROXY_URL      = 'https://flashmaker-api-proxy.dfg147147147.workers.dev';
  const PDF_TEXT_LIMIT = 15_000;   // Gemini に送る最大文字数
  const API_TIMEOUT_MS = 60_000;   // 60 秒でタイムアウト

  // ════════════════════════════════════════════════════════════════
  // 状態管理
  // ════════════════════════════════════════════════════════════════
  const state = {
    pdfText:           '',
    flashcards:        [],
    currentCardIndex:  0,
    correctAnswers:    0,
    isGenerating:      false,
    selectedCardCount: 10,
    selectedDifficulty:'ふつう',
    selectedTextLength:'ふつう',
  };

  // ════════════════════════════════════════════════════════════════
  // DOM 参照
  // ════════════════════════════════════════════════════════════════
  const views = {
    initial:   document.getElementById('initial-view'),
    flashcard: document.getElementById('flashcard-view'),
    finished:  document.getElementById('finished-view'),
    error:     document.getElementById('error-view'),
  };
  const modals = {
    overlay:     document.getElementById('modal-overlay'),
    help:        document.getElementById('help-modal'),
    explanation: document.getElementById('explanation-modal'),
  };

  const generateCardsBtn  = document.getElementById('generate-cards-btn');
  const pdfInput          = document.getElementById('pdf-input');
  const pdfStatus         = document.getElementById('pdf-status');
  const cardFlipper       = document.getElementById('card-flipper');
  const answerButtons     = document.getElementById('answer-buttons');
  const dropdown          = document.getElementById('card-count-dropdown');
  const dropdownToggle    = document.getElementById('dropdown-toggle');
  const dropdownOptions   = document.getElementById('dropdown-options');
  const selectedCountText = document.getElementById('selected-count-text');
  const chevron           = dropdownToggle.querySelector('i');
  const uploadArea        = document.getElementById('upload-area');
  const difficultySelector = document.getElementById('difficulty-selector');
  const textLengthSelector = document.getElementById('text-length-selector');

  // ════════════════════════════════════════════════════════════════
  // 表示切り替え
  // ════════════════════════════════════════════════════════════════
  function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[name]?.classList.remove('hidden');
  }

  function showError(message) {
    document.getElementById('error-message').textContent = message;
    showView('error');
  }

  function showModal(name) {
    Object.values(modals).forEach(m => m?.classList.add('hidden'));
    modals.overlay.classList.remove('hidden');
    modals.overlay.classList.add('flex');
    modals[name]?.classList.remove('hidden');
  }

  function closeModal() {
    modals.overlay.classList.add('hidden');
    modals.overlay.classList.remove('flex');
  }

  // ════════════════════════════════════════════════════════════════
  // 初期化
  // ════════════════════════════════════════════════════════════════
  function init() {
    showView('initial');
    setupEventListeners();
  }

  // ════════════════════════════════════════════════════════════════
  // イベントリスナー
  // ════════════════════════════════════════════════════════════════
  function setupEventListeners() {
    // PDF アップロード
    uploadArea.addEventListener('click', () => pdfInput.click());
    pdfInput.addEventListener('change', handlePdfUpload);

    // カード生成
    generateCardsBtn.addEventListener('click', generateFlashcards);

    // ドロップダウン（枚数）
    dropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownOptions.classList.toggle('hidden');
      chevron.classList.toggle('rotate-180');
    });
    dropdownOptions.addEventListener('click', (e) => {
      e.preventDefault();
      const a = e.target.closest('a');
      if (!a) return;
      state.selectedCardCount = parseInt(a.dataset.count, 10);
      selectedCountText.textContent = a.dataset.count;
      dropdownOptions.classList.add('hidden');
      chevron.classList.remove('rotate-180');
    });
    window.addEventListener('click', () => {
      dropdownOptions.classList.add('hidden');
      chevron.classList.remove('rotate-180');
    });
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    // 難易度セレクター
    difficultySelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.difficulty-btn');
      if (!btn) return;
      difficultySelector.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedDifficulty = btn.dataset.difficulty;
    });

    // 文章の長さセレクター
    textLengthSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.length-btn');
      if (!btn) return;
      textLengthSelector.querySelectorAll('.length-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedTextLength = btn.dataset.length;
    });

    // JSON インポート
    document.getElementById('import-json-btn').addEventListener('click', () =>
      document.getElementById('json-input').click()
    );
    document.getElementById('json-input').addEventListener('change', handleJsonImport);

    // モーダル
    document.getElementById('help-btn').addEventListener('click', () => showModal('help'));
    document.querySelectorAll('.close-modal-btn').forEach(btn =>
      btn.addEventListener('click', closeModal)
    );
    modals.overlay.addEventListener('click', (e) => {
      if (e.target === modals.overlay) closeModal();
    });

    // クイズ
    cardFlipper.setAttribute('tabindex', '0');
    cardFlipper.addEventListener('click', flipCard);
    cardFlipper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); }
    });
    document.getElementById('correct-btn').addEventListener('click', () => handleAnswer(true));
    document.getElementById('incorrect-btn').addEventListener('click', () => handleAnswer(false));
    document.getElementById('ai-explain-btn').addEventListener('click', generateExplanation);

    // 完了画面
    document.getElementById('restart-btn').addEventListener('click', restartQuiz);
    document.getElementById('back-to-title-btn').addEventListener('click', resetApp);
    document.getElementById('error-back-btn').addEventListener('click', resetApp);
    document.getElementById('quiz-back-btn').addEventListener('click', resetApp);

    // エクスポート
    document.getElementById('export-json-btn').addEventListener('click', () => exportData('json'));
    document.getElementById('export-csv-btn').addEventListener('click', () => exportData('csv'));
  }

  // ════════════════════════════════════════════════════════════════
  // PDF 処理
  // ════════════════════════════════════════════════════════════════
  async function handlePdfUpload(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    pdfStatus.textContent = '読込中...';
    document.getElementById('upload-text').textContent = 'ファイルを処理しています...';

    let fullText = '';
    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const tc = await page.getTextContent();
          fullText += tc.items.map(i => i.str).join('\n') + '\n\n';
        }
      } catch (e) {
        showError(`PDFの処理中にエラーが発生しました（${file.name}）: ${e.message}`);
        document.getElementById('upload-text').textContent = 'クリックしてファイルを選択';
        return;
      }
    }

    state.pdfText = fullText;

    const charCount  = fullText.length;
    const truncated  = charCount > PDF_TEXT_LIMIT;
    const label      = files.length > 1 ? `${files.length}個のファイル` : files[0].name;

    document.getElementById('upload-text').textContent = 'ファイル読込完了';
    pdfStatus.textContent = truncated
      ? `${label} — ${charCount.toLocaleString()}文字（先頭${PDF_TEXT_LIMIT.toLocaleString()}文字を使用）`
      : `${label} — ${charCount.toLocaleString()}文字`;

    generateCardsBtn.disabled = false;
  }

  // ════════════════════════════════════════════════════════════════
  // JSON インポート
  // ════════════════════════════════════════════════════════════════
  function handleJsonImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        if (!data.flashcards || !Array.isArray(data.flashcards)) {
          throw new Error('"flashcards" 配列が見つかりません。');
        }

        const valid = data.flashcards.filter(c =>
          c && typeof c.frontText === 'string' && typeof c.backText === 'string' &&
          c.frontText.trim() && c.backText.trim()
        );

        if (valid.length === 0) {
          throw new Error(
            '有効なカードが見つかりません。各カードに frontText と backText が必要です。'
          );
        }

        state.flashcards = valid;
        startQuiz();
      } catch (e) {
        showError(`JSONの読み込みに失敗しました: ${e.message}`);
      }
    };
    reader.readAsText(file);
  }

  // ════════════════════════════════════════════════════════════════
  // API 呼び出し（共通）
  // ════════════════════════════════════════════════════════════════
  async function callAPI(messages, expectJson = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const body = { messages };
    if (expectJson) body.response_format = { type: 'json_object' };

    try {
      const response = await fetch(PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });

      clearTimeout(timer);

      const text = await response.text();

      if (!response.ok) {
        let message = `サーバーエラー (${response.status})`;
        try {
          const errData = JSON.parse(text);
          if (errData.error) message = errData.error;
        } catch {
          if (text) message += `: ${text.slice(0, 300)}`;
        }
        throw new Error(message);
      }

      const data = JSON.parse(text);
      return data?.choices?.[0]?.message?.content ?? null;

    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        showError('タイムアウト: AIからの応答が60秒以内に返りませんでした。もう一度お試しください。');
      } else {
        showError(`APIエラー: ${e.message}`);
      }
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // カード生成
  // ════════════════════════════════════════════════════════════════
  async function generateFlashcards() {
    if (state.isGenerating || !state.pdfText) return;

    state.isGenerating = true;
    updateGenerateButtonUI();

    try {
      const { selectedCardCount: n, selectedDifficulty, selectedTextLength } = state;

      const difficultyGuide = {
        'やさしい':   '「〜とは何ですか？」のような用語の定義を問う基本的な質問。答えは一言か短いフレーズ。',
        'ふつう':     '概念の理解度を測る標準的な質問。答えは要点をまとめた簡潔な説明。',
        'むずかしい': '複数の概念を比較・考察させる、深い理解が必要な質問。答えも詳細に記述。',
      };

      const lengthGuide = {
        'みじかい': 'キーワードや極めて短いフレーズのみ。',
        'ふつう':   '1〜2文の簡潔な文章。',
        'ながい':   '背景情報・文脈を含む複数の文章で詳細に。',
      };

      const template = JSON.stringify(
        { flashcards: Array.from({ length: n }, () => ({ frontText: '', backText: '' })) },
        null, 2
      );

      const systemPrompt = `あなたはPDFテキストを分析して暗記カードを生成するAIです。

## タスク
以下のJSONテンプレートにある${n}個の空カードを、PDFの内容に基づいて埋めてください。

\`\`\`json
${template}
\`\`\`

## 厳守事項
1. JSONの構造・キー名・オブジェクト数は変更しない
2. ${n}枚のカードをすべて埋める
3. 難易度「${selectedDifficulty}」: ${difficultyGuide[selectedDifficulty]}
4. 文章の長さ「${selectedTextLength}」: ${lengthGuide[selectedTextLength]}
5. ページ番号・著者名・日付など学習と無関係な情報は含めない

## 出力
有効なJSONオブジェクトのみ出力すること。挨拶・説明文・コードブロック記法は不要。`;

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `以下のテキストを分析してJSONテンプレートを完成させてください:\n\n${state.pdfText.substring(0, PDF_TEXT_LIMIT)}`,
        },
      ];

      const raw = await callAPI(messages, true);
      if (!raw) return; // callAPI 内でエラー表示済み

      // ```json ... ``` を除去してパース
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed  = JSON.parse(cleaned);

      if (!Array.isArray(parsed?.flashcards)) {
        throw new Error('応答に "flashcards" 配列がありません。');
      }

      const cards = parsed.flashcards.filter(c => c?.frontText?.trim() && c?.backText?.trim());
      if (cards.length === 0) {
        throw new Error('カードが生成されませんでした。PDFのテキストが短すぎるか、内容が不適切な可能性があります。');
      }

      state.flashcards = cards;
      startQuiz();

    } catch (e) {
      showError(`カード生成エラー: ${e.message}`);
    } finally {
      // 成功・失敗問わず必ずリセット
      state.isGenerating = false;
      updateGenerateButtonUI();
    }
  }

  function updateGenerateButtonUI() {
    const btnText = document.getElementById('generate-btn-text');
    const spinner = document.getElementById('generate-spinner');
    generateCardsBtn.disabled = state.isGenerating || !state.pdfText;
    btnText.classList.toggle('hidden',  state.isGenerating);
    spinner.classList.toggle('hidden', !state.isGenerating);
  }

  // ════════════════════════════════════════════════════════════════
  // クイズロジック
  // ════════════════════════════════════════════════════════════════
  function startQuiz() {
    state.currentCardIndex = 0;
    state.correctAnswers   = 0;
    if (!state.flashcards.length) { showError('生成されたカードがありません。'); return; }
    state.flashcards.sort(() => Math.random() - 0.5);
    showView('flashcard');
    displayCurrentCard();
  }

  function displayCurrentCard() {
    if (state.currentCardIndex >= state.flashcards.length) { finishQuiz(); return; }

    const card = state.flashcards[state.currentCardIndex];
    document.getElementById('card-front').textContent = card.frontText;
    document.getElementById('card-back').textContent  = card.backText;
    cardFlipper.classList.remove('flipped');
    answerButtons.classList.add('hidden');

    const pct = ((state.currentCardIndex + 1) / state.flashcards.length) * 100;
    document.getElementById('card-progress').textContent =
      `第${state.currentCardIndex + 1}問 / ${state.flashcards.length}問`;
    document.getElementById('progress-bar').style.width = `${pct}%`;
  }

  function flipCard() {
    cardFlipper.classList.toggle('flipped');
    answerButtons.classList.toggle('hidden');
  }

  function handleAnswer(isCorrect) {
    if (isCorrect) state.correctAnswers++;
    state.currentCardIndex++;
    displayCurrentCard();
  }

  function finishQuiz() {
    showView('finished');
    const total     = state.flashcards.length;
    const correct   = state.correctAnswers;
    const incorrect = total - correct;

    document.getElementById('correct-count').textContent   = correct;
    document.getElementById('incorrect-count').textContent = incorrect;

    const C = 2 * Math.PI * 45;
    setTimeout(() => {
      document.getElementById('correct-circle').style.strokeDashoffset =
        total > 0 ? C * (1 - correct / total) : C;
      document.getElementById('incorrect-circle').style.strokeDashoffset =
        total > 0 ? C * (1 - incorrect / total) : C;
    }, 100);
  }

  function restartQuiz() { startQuiz(); }

  function resetApp() {
    state.pdfText   = '';
    state.flashcards = [];
    pdfStatus.textContent = '';
    document.getElementById('upload-text').textContent = 'クリックしてファイルを選択';
    generateCardsBtn.disabled = true;
    pdfInput.value = '';
    showView('initial');
  }

  // ════════════════════════════════════════════════════════════════
  // AI 解説
  // ════════════════════════════════════════════════════════════════
  async function generateExplanation() {
    const aiBtn   = document.getElementById('ai-explain-btn');
    const btnIcon = document.getElementById('explain-btn-icon');
    const spinner = document.getElementById('explain-spinner');

    aiBtn.disabled = true;
    btnIcon.classList.add('hidden');
    spinner.classList.remove('hidden');

    const card = state.flashcards[state.currentCardIndex];
    document.getElementById('explanation-question').textContent = card.frontText;
    document.getElementById('explanation-content').innerHTML =
      '<div class="flex items-center justify-center h-full"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';
    showModal('explanation');

    const systemPrompt = `あなたは複雑な概念を初心者にわかりやすく日本語で解説する専門家AIです。
与えられた暗記カードの質問と答えを基に、以下の構造でMarkdown形式の解説を生成してください。

## 結論 💡
質問への答えを1文で簡潔に述べる。

## 解説 📝
- 重要キーワードを **太字** で強調
- 2〜3つのポイントを箇条書きで説明
- 平易な言葉を使い、必要に応じて絵文字を活用

制約: 全て日本語で出力。挨拶・余計な前置きは不要。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `質問: ${card.frontText}\n答え: ${card.backText}` },
    ];

    const text = await callAPI(messages);

    document.getElementById('explanation-content').innerHTML = text
      ? marked.parse(text)
      : '<p class="text-red-400">解説の生成に失敗しました。</p>';

    aiBtn.disabled = false;
    btnIcon.classList.remove('hidden');
    spinner.classList.add('hidden');
  }

  // ════════════════════════════════════════════════════════════════
  // データエクスポート
  // ════════════════════════════════════════════════════════════════
  function exportData(format) {
    let content, filename, mimeType;

    if (format === 'json') {
      content  = JSON.stringify({ flashcards: state.flashcards }, null, 2);
      filename = 'flashcards.json';
      mimeType = 'application/json';
    } else {
      const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
      const rows = state.flashcards.map(c =>
        `${esc(c.frontText)},${esc(c.backText)},,ja-JP,ja-JP`
      );
      content  = 'FrontText,BackText,Comment,FrontTextLanguage,BackTextLanguage\n' + rows.join('\n');
      filename = 'wordholic_cards.csv';
      mimeType = 'text/csv;charset=utf-8;';
    }

    const a = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob([content], { type: mimeType }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ════════════════════════════════════════════════════════════════
  // 起動
  // ════════════════════════════════════════════════════════════════
  init();
});
