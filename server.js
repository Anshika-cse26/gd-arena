import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is missing");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.use(express.json());
app.use(express.static("public"));

// Models are tried in this order. If one fails (404 / quota over), the next one is used.
const MODEL_CANDIDATES = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview"
];

const blockedUntil = {};
let lastGoodModel = null;

async function askGemini(prompt, wantJson) {
  const order = lastGoodModel
    ? [lastGoodModel, ...MODEL_CANDIDATES.filter((m) => m !== lastGoodModel)]
    : MODEL_CANDIDATES;

  let lastError = null;

  for (const model of order) {
    if (blockedUntil[model] && Date.now() < blockedUntil[model]) {
      continue;
    }

    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: wantJson ? { responseMimeType: "application/json" } : undefined
      });

      const text = (response.text || "").trim();
      if (!text) {
        throw new Error("Empty response");
      }

      lastGoodModel = model;
      console.log("Used model:", model);
      return text;
    } catch (error) {
      lastError = error;
      const status = error.status || error.code;
      console.log("MODEL FAILED:", model, "status:", status);

      if (status === 429) {
        blockedUntil[model] = Date.now() + 5 * 60 * 1000;
      } else if (status === 404) {
        blockedUntil[model] = Date.now() + 24 * 60 * 60 * 1000;
      }
    }
  }

  throw lastError || new Error("No model available");
}

const participants = {
  dominator: {
    name: "Dominator",
    personality:
      "Confident, assertive and competitive. Challenges weak arguments and tries to control the discussion."
  },
  data: {
    name: "Data-Driven",
    personality:
      "Analytical and evidence-focused. Prefers facts, numbers, examples and logical reasoning. Politely challenges unsupported claims."
  },
  quiet: {
    name: "Quiet",
    personality:
      "Calm and thoughtful, speaks less. Adds one useful insight that others may have missed."
  }
};

// All three participants reply in ONE request
app.post("/api/respond", async (req, res) => {
  try {
    const { topic, transcript } = req.body;

    if (!topic || !transcript) {
      return res.status(400).json({
        error: "Topic and transcript are required."
      });
    }

    const prompt = `
You are simulating a college Group Discussion with three AI participants.

Topic: "${topic}"

The student's latest statement:
"${transcript}"

Write ONE reply for each participant:
- dominator: ${participants.dominator.personality}
- data: ${participants.data.personality}
- quiet: ${participants.quiet.personality}

Rules:
- Each reply must be 1-2 short sentences (maximum 30 words).
- Sound like a real college student in a GD.
- Directly react to the student's point.
- Do not mention that you are an AI.
- Do not give feedback about the student.

Return ONLY valid JSON in exactly this format:
{"dominator":"...","data":"...","quiet":"..."}
`;

    const raw = await askGemini(prompt, true);
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    res.json({
      replies: [
        {
          type: "dominator",
          name: participants.dominator.name,
          text: String(parsed.dominator || "")
        },
        {
          type: "data",
          name: participants.data.name,
          text: String(parsed.data || "")
        },
        {
          type: "quiet",
          name: participants.quiet.name,
          text: String(parsed.quiet || "")
        }
      ]
    });
  } catch (error) {
    console.error("/api/respond failed:", error.message);
    res.status(500).json({
      error: "Gemini API request failed."
    });
  }
});

// Final feedback report
app.post("/api/feedback", async (req, res) => {
  try {
    const { topic, transcript } = req.body;

    if (!topic || !transcript) {
      return res.status(400).json({
        error: "Topic and transcript are required."
      });
    }

    const prompt = `
You are a Group Discussion evaluator.

Topic:
"${topic}"

Student transcript:
"""
${transcript}
"""

Create a concise feedback report.

Evaluate:
1. Content quality
2. Clarity
3. Confidence
4. Relevance
5. Structure
6. Listening / response quality

Give:
- Overall score out of 10
- 3 strengths
- 3 improvements
- 3 practical tips for the next GD
- 2 short quotes from the student's transcript that demonstrate either a strength or an area to improve

IMPORTANT:
The quotes must be copied EXACTLY from the student's transcript.
Do not invent quotes.
Keep the whole report concise and suitable for a college student.
`;

    const text = await askGemini(prompt, false);

    res.json({ feedback: text });
  } catch (error) {
    console.error("/api/feedback failed:", error.message);
    res.status(500).json({
      error: "Could not generate feedback."
    });
  }
});

app.listen(PORT, () => {
  console.log(`GD-Arena running at http://localhost:${PORT}`);
});