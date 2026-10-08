import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error("ERROR: GEMINI_API_KEY is missing in .env");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.use(express.json());
app.use(express.static("public"));

// Models are tried in this order. The first one that works is remembered.
const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash"
];
let workingModel = null;

async function callGemini(prompt) {
  const list = workingModel ? [workingModel] : MODELS;
  let lastError = null;

  for (const model of list) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt
      });
      if (!workingModel) {
        workingModel = model;
        console.log("WORKING MODEL FOUND:", model);
      }
      return response.text.trim();
    } catch (error) {
      lastError = error;
      console.error("----- MODEL FAILED:", model);
      console.error("Status:", error.status);
      console.error("Message:", error.message);
      if (workingModel) {
        // working model suddenly failed, try the full list next time
        workingModel = null;
      }
    }
  }

  throw lastError;
}

const participants = {
  dominator: {
    name: "Dominator",
    personality:
      "You are confident, assertive and competitive. Keep answers short and strong. Challenge weak arguments and try to control the discussion."
  },
  data: {
    name: "Data-Driven",
    personality:
      "You are analytical and evidence-focused. Prefer facts, numbers, examples and logical reasoning. Politely challenge unsupported claims."
  },
  quiet: {
    name: "Quiet",
    personality:
      "You are calm, thoughtful and usually speak less. Add one useful insight that others may have missed. Do not dominate the discussion."
  }
};

async function generateParticipantReply(type, topic, transcript) {
  const participant = participants[type];

  const prompt = `
You are participating in a college Group Discussion.

Topic:
"${topic}"

Your personality:
${participant.personality}

The student's latest statement is:
"${transcript}"

Reply as ${participant.name}.

Rules:
- Respond in 1-3 sentences.
- Sound like a real student in a GD.
- Directly react to the student's point.
- Do not mention that you are an AI.
- Do not use headings.
- Do not give feedback about the student.
`;

  return await callGemini(prompt);
}

// AI participants respond to student's latest statement
app.post("/api/respond", async (req, res) => {
  try {
    const { topic, transcript } = req.body;

    if (!topic || !transcript) {
      return res.status(400).json({
        error: "Topic and transcript are required."
      });
    }

    const replies = await Promise.all([
      generateParticipantReply("dominator", topic, transcript),
      generateParticipantReply("data", topic, transcript),
      generateParticipantReply("quiet", topic, transcript)
    ]);

    res.json({
      replies: [
        { type: "dominator", name: participants.dominator.name, text: replies[0] },
        { type: "data", name: participants.data.name, text: replies[1] },
        { type: "quiet", name: participants.quiet.name, text: replies[2] }
      ]
    });
  } catch (error) {
    console.error("/api/respond failed:", error.message);
    res.status(500).json({ error: "Gemini API request failed." });
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

    const feedback = await callGemini(prompt);
    res.json({ feedback });
  } catch (error) {
    console.error("/api/feedback failed:", error.message);
    res.status(500).json({ error: "Could not generate feedback." });
  }
});

app.listen(PORT, () => {
  console.log(`GD-Arena running at http://localhost:${PORT}`);
});