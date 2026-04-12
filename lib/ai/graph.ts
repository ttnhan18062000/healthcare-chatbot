import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// 1. Define State
const GraphStateAnnotation = Annotation.Root({
  chunks: Annotation<any[]>(),
  quota: Annotation<Record<string, number>>(),
  current_task: Annotation<any>(),
  current_persona: Annotation<any>(),
  current_pair: Annotation<any>(),
  retries: Annotation<number>(),
  final_dataset: Annotation<any[]>(),
});

type GraphState = typeof GraphStateAnnotation.State;

const MODEL_NAME = "gpt-4o";

// 2. Nodes
const taskPlanner = async (state: GraphState) => {
  const types = Object.entries(state.quota)
    .filter(([_, count]) => count > 0)
    .map(([type]) => type);

  if (types.length === 0) {
    return { current_task: null };
  }

  const targetType = types[Math.floor(Math.random() * types.length)];
  const targetDifficulty = Math.floor(Math.random() * 5) + 1;
  const chunk = state.chunks[Math.floor(Math.random() * state.chunks.length)];

  return {
    current_task: {
      type: targetType,
      difficulty: targetDifficulty,
      chunk: chunk,
    },
    retries: 0,
    current_persona: null,
  };
};

const personaGenerator = async (state: GraphState) => {
  const llm = new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.8 });
  const prompt = `Bạn là một biên kịch chuyên nghiệp. Hãy tạo một 'Persona' (nhân vật) cho người chăm sóc bệnh nhân sa sút trí tuệ.
Nhân vật này sẽ là người đặt câu hỏi cho chatbot.
Hãy tạo JSON gồm:
{
  "role": "Mối quan hệ (ví dụ: con gái, chồng, hàng xóm, bác sĩ trẻ...)",
  "mood": "Trạng thái cảm xúc (ví dụ: lo lắng, cáu gắt, nhẹ nhàng, kiệt sức, trang trọng...)",
  "bio": "Mô tả ngắn về hoàn cảnh (1 câu, ví dụ: Đang đi làm hành chính và phải chăm mẹ già 80 tuổi)."
}`;
  const response = await llm.invoke([new SystemMessage(prompt)]);
  try {
    const rawContent = (response.content as string)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const persona = JSON.parse(rawContent);
    return { current_persona: persona };
  } catch (e) {
    return {
      current_persona: {
        role: "người chăm sóc",
        mood: "bình thường",
        bio: "đang chăm sóc người bệnh",
      },
    };
  }
};

const synthesizer = async (state: GraphState) => {
  const { current_task: task, current_persona: persona } = state;
  const llm = new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.7 });

  const systemPrompt = `Bạn là một chuyên gia tạo dữ liệu benchmark. 
HÃY ĐÓNG VAI nhân vật sau để đặt câu hỏi:
- VAI TRÒ: ${persona.role}
- TÂM TRẠNG: ${persona.mood}
- HOÀN CẢNH: ${persona.bio}

Dựa trên context:
---
${task.chunk.content}
---

Nhiệm vụ: Tạo một cặp (input, expected_output) theo yêu cầu:
1. Loại (Type): ${task.type}
2. Độ khó (1-5): ${task.difficulty}

LƯU Ý: 'input' thể hiện đúng xưng hô. 'expected_output' tuân thủ tone 'mình-bạn'.

Output JSON duy nhất:
{
  "input": "...",
  "expected_output": "...",
  "difficulty": ${task.difficulty},
  "type": "${task.type}",
  "persona_context": "${persona.role} - ${persona.mood}",
  "source_doc": "${task.chunk.source}"
}`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage("Hãy tạo 1 cặp dữ liệu chuẩn xác."),
  ]);
  try {
    const rawContent = (response.content as string)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const pair = JSON.parse(rawContent);
    return { current_pair: pair };
  } catch (e) {
    return { current_pair: null };
  }
};

const critic = async (state: GraphState) => {
  if (!state.current_pair) {
    return { retries: state.retries + 1 };
  }
  const llm = new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0 });
  const evalPrompt = `Bạn là kiểm soát viên chất lượng dữ liệu AI. 
Đánh giá cặp dữ liệu:
Input: ${state.current_pair.input}
Output: ${state.current_pair.expected_output}

Chỉ trả về JSON: {"pass": true/false, "feedback": "reason"}`;

  const response = await llm.invoke([new SystemMessage(evalPrompt)]);
  try {
    const rawContent = (response.content as string)
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const result = JSON.parse(rawContent);
    return { retries: result.pass ? 0 : state.retries + 1 };
  } catch (e) {
    return { retries: state.retries + 1 };
  }
};

const saver = async (state: GraphState) => {
  const { current_pair: pair, final_dataset: dataset, quota } = state;
  const newDataset = [...dataset, pair];
  const newQuota = { ...quota };
  newQuota[state.current_task.type] -= 1;

  return {
    final_dataset: newDataset,
    quota: newQuota,
    current_pair: null,
  };
};

const shouldContinue = (state: GraphState) => {
  if (state.current_pair && state.retries === 0) {
    return "save";
  }
  if (state.retries >= 3) {
    return "plan";
  }
  return "synthesize";
};

// 3. Construct Graph
const workflow = new StateGraph(GraphStateAnnotation)
  .addNode("plan", taskPlanner)
  .addNode("persona", personaGenerator)
  .addNode("synthesize", synthesizer)
  .addNode("critic", critic)
  .addNode("save", saver)
  .addEdge("plan", "persona")
  .addEdge("persona", "synthesize")
  .addEdge("synthesize", "critic")
  .addConditionalEdges("critic", shouldContinue, {
    save: "save",
    plan: "plan",
    synthesize: "synthesize",
  })
  .addEdge("save", "plan");

workflow.setEntryPoint("plan");

export const generatorApp = workflow.compile();
