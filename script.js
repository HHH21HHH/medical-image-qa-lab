"use strict";

const { cases, tasks, matrices, sources } = window.MED_R1_DATA;
const get = (id) => document.getElementById(id);
const signed = (value, places) => `${value > 0 ? "+" : ""}${value.toFixed(places)}`;

for (const link of document.querySelectorAll("[data-source]")) {
  link.href = sources[link.dataset.source];
}

const letters = ["A", "B", "C", "D"];
const choices = [...document.querySelectorAll("[data-choice]")];
const quizFeedback = get("quiz-feedback");
const quizImage = get("quiz-image");
const quizCredit = get("quiz-image-credit");
let currentCase = cases[0];

const caseButtons = cases.map((entry) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "case-button";
  button.textContent = entry.type;
  button.addEventListener("click", () => showCase(entry));
  get("case-picker").append(button);
  return button;
});

for (const choice of choices) {
  choice.setAttribute("aria-pressed", "false");
  choice.addEventListener("click", () => {
    for (const option of choices) {
      const isSelected = option === choice;
      const isCorrect = option.dataset.choice === currentCase.answer;
      option.setAttribute("aria-pressed", String(isSelected));
      option.classList.toggle("correct", isCorrect);
      option.classList.toggle("incorrect", isSelected && !isCorrect);
    }
    const success = choice.dataset.choice === currentCase.answer ? "答对了。" : "";
    const answerLabel = currentCase.options[letters.indexOf(currentCase.answer)];
    quizFeedback.textContent = `${success}标准答案是 ${currentCase.answer} · ${answerLabel}。${currentCase.explanation}`;
  });
}

const answerTag = (key) => `<answer>${key}</answer>`;
const presets = [
  { id: "standard", label: "答对且标签完整", output: answerTag, note: "答案和输出格式都满足规则。" },
  { id: "bare", label: "只写选项字母", output: (key) => key, note: "没有标签时，答案规则会比对整段文本。" },
  { id: "prefix", label: "标签前有额外文字", output: (key) => `答案是 ${answerTag(key)}`, note: "答案仍可抽取，前置文字导致格式检查失败。" },
  { id: "newline", label: "标签后有换行", output: (key) => `${answerTag(key)}\n`, note: "尾部换行不影响抽取，但这版格式规则要求结束标签位于文本末尾。" },
  { id: "lowercase", label: "选项字母小写", output: (key) => answerTag(key.toLowerCase()), note: "标签结构合格，选项字母按大小写精确比较。" },
  { id: "unclosed", label: "缺少结束标签", output: (key) => `<answer>${key}`, note: "找不到完整标签，整段文本参与比对，格式也无法通过。" },
  {
    id: "duplicate", label: "重复两段答案标签",
    output: (key) => answerTag(key) + answerTag(letters.find((letter) => letter !== key)),
    note: "这版正则允许两段连续标签通过格式检查，答案抽取取第一段。",
  },
];
const answerPreset = get("answer-preset");
const answerInput = get("answer-input");
for (const preset of presets) {
  answerPreset.add(new Option(preset.label, preset.id));
}
answerPreset.add(new Option("自定义回答", "custom"));
let activeCandidate = 0;

const candidateRows = Array.from({ length: 4 }, (_, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "candidate";
  const number = document.createElement("span");
  number.className = "candidate-index";
  number.textContent = `回答 ${index + 1}`;
  const label = document.createElement("span");
  const score = document.createElement("span");
  score.className = "candidate-score";
  button.append(number, label, score);
  button.addEventListener("click", () => {
    activeCandidate = index;
    renderRewards();
  });
  get("candidates").append(button);
  return { button, label, score };
});

function scoreAnswer(output, expected) {
  const match = output.match(/<answer>([^\n]*?)<\/answer>/);
  const extracted = (match?.[1] ?? output).replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu, "");
  const accuracy = Number(extracted === expected);
  const format = Number(/^[\p{White_Space}\u001c-\u001f]*<answer>.*?<\/answer>(?![\s\S])/su.test(output));
  return { extracted, matchedTag: Boolean(match), accuracy, format, total: accuracy + format };
}

function renderRewards() {
  const key = currentCase.answer;
  const [wrong1, wrong2] = letters.filter((letter) => letter !== key);
  const candidates = [
    { label: "可编辑回答", output: answerInput.value },
    { label: `格式正确，选 ${wrong1}`, output: answerTag(wrong1) },
    { label: `格式正确，选 ${wrong2}`, output: answerTag(wrong2) },
    { label: "答对，标签前加文字", output: `答案是 ${answerTag(key)}` },
  ];
  const group = candidates.map((entry) => ({ ...entry, ...scoreAnswer(entry.output, key) }));
  const mean = group.reduce((sum, entry) => sum + entry.total, 0) / group.length;
  const sumSquared = group.reduce((sum, entry) => sum + (entry.total - mean) ** 2, 0);
  const sampleDeviation = Math.sqrt(sumSquared / (group.length - 1));
  const selected = group[activeCandidate];
  const advantage = (selected.total - mean) / (sampleDeviation + 0.0001);

  for (const [index, row] of candidateRows.entries()) {
    row.button.setAttribute("aria-pressed", String(index === activeCandidate));
    row.label.textContent = group[index].label;
    row.score.textContent = `${group[index].total} 分`;
  }
  get("candidate-text").textContent = selected.output ? selected.output.replaceAll("\n", "↵\n") : "（空）";
  const extractionMethod = selected.matchedTag ? "抽取标签内的文本" : "使用整段文本";
  get("candidate-extracted").textContent = `${extractionMethod} · 用于比对 ${JSON.stringify(selected.extracted)}`;
  get("accuracy-reward").textContent = selected.accuracy;
  get("format-reward").textContent = selected.format;
  get("candidate-advantage").textContent = signed(advantage, 2);
  const scores = group.map((entry) => entry.total).join("、");
  get("reward-note").textContent = sampleDeviation === 0
    ? `组内总分为 ${scores}。四条回答同分，组内优势均为 0。`
    : `组内总分为 ${scores}。每条回答的优势由它的总分和组内分布共同决定。`;
}

function applyPreset(id) {
  const preset = presets.find((entry) => entry.id === id);
  if (preset) {
    answerInput.value = preset.output(currentCase.answer);
  }
  get("preset-note").textContent = preset?.note ?? "输入即重新评分，其他三条回答保持固定。";
  activeCandidate = 0;
  renderRewards();
}

function showCase(entry) {
  currentCase = entry;
  for (const [index, button] of caseButtons.entries()) {
    button.setAttribute("aria-pressed", String(entry === cases[index]));
  }
  get("quiz-question").textContent = entry.question;
  quizImage.src = entry.image;
  quizImage.alt = entry.alt;
  quizImage.width = entry.width;
  quizImage.height = entry.height;
  quizCredit.href = entry.source;
  quizCredit.textContent = `${entry.credit} ↗`;
  for (const [index, button] of choices.entries()) {
    button.setAttribute("aria-pressed", "false");
    button.classList.remove("correct", "incorrect");
    button.querySelector(".choice-label").textContent = entry.options[index];
  }
  quizFeedback.textContent = "选择一个选项查看答案与图像线索。";
  get("lab-context").textContent = `${entry.type} · No-Think · 标准答案 ${entry.answer}`;
  answerPreset.value = "standard";
  applyPreset("standard");
}

answerPreset.addEventListener("change", () => applyPreset(answerPreset.value));
answerInput.addEventListener("input", () => {
  answerPreset.value = "custom";
  applyPreset("custom");
});
showCase(currentCase);

const strategies = { noThink: "No-Think", thinkAfter: "Think-After" };
const strategyButtons = [...document.querySelectorAll("[data-strategy]")];
const crossOnly = get("cross-only");
const reverseRoute = get("reverse-route");
const matrixState = { strategy: "noThink", row: 0, column: 2 };

const table = document.createElement("table");
table.setAttribute("aria-label", "不同训练任务和测试任务之间的准确率差值");
const header = table.createTHead().insertRow();
const corner = document.createElement("td");
corner.textContent = "";
header.append(corner);
for (const task of tasks) {
  const th = document.createElement("th");
  th.scope = "col";
  th.textContent = task;
  header.append(th);
}

const rows = table.createTBody();
const cells = tasks.map((trainingTask, row) => {
  const tr = rows.insertRow();
  const rowHead = document.createElement("th");
  rowHead.scope = "row";
  rowHead.textContent = trainingTask;
  tr.append(rowHead);

  return tasks.map((_, column) => {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "matrix-cell";
    cell.addEventListener("click", () => {
      matrixState.row = row;
      matrixState.column = column;
      renderEvaluation();
    });
    tr.insertCell().append(cell);
    return cell;
  });
});
get("matrix").append(table);

function renderEvaluation() {
  const { strategy, row, column } = matrixState;
  const current = matrices[strategy];
  const comparison = strategies[strategy];
  const baseline = matrices.think;
  const skipDiagonal = crossOnly.checked;
  let included = 0;
  let baselineTotal = 0;
  let strategyTotal = 0;

  for (const button of strategyButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.strategy === strategy));
  }

  for (const [rowIndex, matrixRow] of cells.entries()) {
    for (const [columnIndex, cell] of matrixRow.entries()) {
      const excluded = skipDiagonal && rowIndex === columnIndex;
      cell.disabled = excluded;
      cell.setAttribute("aria-pressed", String(rowIndex === row && columnIndex === column));
      const baseScore = baseline[rowIndex][columnIndex];
      const strategyScore = current[rowIndex][columnIndex];
      const diff = strategyScore - baseScore;
      cell.textContent = excluded ? "—" : signed(diff, 2);
      cell.setAttribute("aria-label", `${tasks[rowIndex]}到${tasks[columnIndex]}，${excluded ? "未纳入均值" : `变化 ${signed(diff, 2)} 个百分点`}`);
      if (excluded) {
        cell.style.removeProperty("background-color");
        continue;
      }
      const intensity = Math.min(Math.abs(diff) / 16, 1);
      const hue = diff >= 0 ? 140 : 12;
      cell.style.backgroundColor = `hsl(${hue} 27% ${19 + intensity * 20}%)`;
      included += 1;
      baselineTotal += baseScore;
      strategyTotal += strategyScore;
    }
  }

  const baselineMean = (baselineTotal / included).toFixed(2);
  const strategyMean = (strategyTotal / included).toFixed(2);
  const meanChange = Number(strategyMean) - Number(baselineMean);
  const baseSelection = baseline[row][column];
  const strategySelection = current[row][column];
  const routeChange = strategySelection - baseSelection;
  get("mean-label").textContent = skipDiagonal
    ? `${included} 个跨任务组合的宏平均`
    : `${included} 个组合的宏平均（含同任务）`;
  get("mean-values").textContent = `${baselineMean}% → ${strategyMean}%`;
  get("mean-change").textContent = `${comparison} 相比 Think，${signed(meanChange, 2)} 个百分点`;
  get("route-title").textContent = `${tasks[row]} → ${tasks[column]}`;
  get("route-values").textContent = `Think ${baseSelection.toFixed(2)}% → ${comparison} ${strategySelection.toFixed(2)}%（${signed(routeChange, 2)} 个百分点）`;
  reverseRoute.disabled = row === column;
}

for (const button of strategyButtons) {
  button.addEventListener("click", () => {
    matrixState.strategy = button.dataset.strategy;
    renderEvaluation();
  });
}
crossOnly.addEventListener("change", () => {
  if (crossOnly.checked && matrixState.row === matrixState.column) {
    matrixState.column = (matrixState.row + 1) % tasks.length;
  }
  renderEvaluation();
});
reverseRoute.addEventListener("click", () => {
  [matrixState.row, matrixState.column] = [matrixState.column, matrixState.row];
  renderEvaluation();
});
renderEvaluation();
