const setup = document.getElementById("setup");
const gdArea = document.getElementById("gdArea");
const topicSelect = document.getElementById("topic");
const topicText = document.getElementById("topicText");
const startBtn = document.getElementById("startBtn");
const micBtn = document.getElementById("micBtn");
const stopBtn = document.getElementById("stopBtn");
const feedbackBtn = document.getElementById("feedbackBtn");
const liveTranscript = document.getElementById("liveTranscript");
const transcriptHistory = document.getElementById("transcriptHistory");
const statusText = document.getElementById("status");
const feedbackSection = document.getElementById("feedbackSection");
const feedback = document.getElementById("feedback");
const dominatorText = document.getElementById("dominatorText");
const dataText = document.getElementById("dataText");
const quietText = document.getElementById("quietText");
const controls = document.querySelector(".controls");

let currentTopic = "";
let finalTranscript = "";
let recognition = null;
let isListening = false;
let isAISpeaking = false;
let ignoreSpeechUntil = 0;
let voiceOn = true;
let speechRun = 0;

// ---------------- AI Voice (text to speech) ----------------

const canSpeak = "speechSynthesis" in window;
let voices = [];

function loadVoices() {
  if (!canSpeak) return;
  voices = window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith("en"));
}

loadVoices();
if (canSpeak) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

const voiceSettings = {
  "Dominator": { pitch: 0.6, rate: 1.1, voiceIndex: 0 },
  "Data-Driven": { pitch: 1.0, rate: 1.0, voiceIndex: 1 },
  "Quiet": { pitch: 1.4, rate: 0.9, voiceIndex: 2 }
};

const cards = {
  "Dominator": dominatorText.closest(".participant"),
  "Data-Driven": dataText.closest(".participant"),
  "Quiet": quietText.closest(".participant")
};

function speak(name, text) {
  return new Promise((resolve) => {
    if (!canSpeak || !voiceOn) {
      resolve();
      return;
    }
    const setting = voiceSettings[name];
    const utterance = new SpeechSynthesisUtterance(text);
    if (voices.length > 0) {
      utterance.voice = voices[setting.voiceIndex % voices.length];
    }
    utterance.pitch = setting.pitch;
    utterance.rate = setting.rate;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

function stopSpeaking() {
  speechRun++;
  if (canSpeak) {
    window.speechSynthesis.cancel();
  }
  isAISpeaking = false;
  Object.values(cards).forEach((card) => {
    if (card) card.classList.remove("speaking");
  });
}

async function speakAllReplies(replies) {
  if (!canSpeak || !voiceOn) return;

  const myRun = ++speechRun;
  isAISpeaking = true;

  for (const reply of replies) {
    if (myRun !== speechRun) return;

    const card = cards[reply.name];
    if (card) card.classList.add("speaking");

    await speak(reply.name, reply.text);

    if (card) card.classList.remove("speaking");
  }

  if (myRun === speechRun) {
    isAISpeaking = false;
    ignoreSpeechUntil = Date.now() + 800;
  }
}

// Voice ON/OFF button
const voiceBtn = document.createElement("button");
voiceBtn.id = "voiceBtn";
voiceBtn.textContent = "🔊 AI Voice: ON";
voiceBtn.addEventListener("click", () => {
  voiceOn = !voiceOn;
  voiceBtn.textContent = voiceOn ? "🔊 AI Voice: ON" : "🔇 AI Voice: OFF";
  if (!voiceOn) {
    stopSpeaking();
  }
});
controls.appendChild(voiceBtn);

// ---------------- Start GD ----------------

startBtn.addEventListener("click", () => {
  currentTopic = topicSelect.value;
  topicText.textContent = currentTopic;
  setup.classList.add("hidden");
  gdArea.classList.remove("hidden");
  feedbackBtn.disabled = true;
  setupSpeechRecognition();
});

// ---------------- Speech recognition (your voice) ----------------

function setupSpeechRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    statusText.textContent =
      "Speech Recognition is not supported. Please use Google Chrome.";
    micBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-IN";

  recognition.onstart = () => {
    isListening = true;
    micBtn.textContent = "🎙 Listening...";
    stopBtn.disabled = false;
    statusText.textContent = "Listening... Speak your point.";
  };

  recognition.onresult = (event) => {
    // Ignore the AI's own voice coming from the speakers
    if (isAISpeaking || Date.now() < ignoreSpeechUntil) {
      return;
    }

    let interim = "";
    let newFinalText = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) {
        newFinalText += text + " ";
      } else {
        interim += text;
      }
    }

    if (newFinalText.trim()) {
      addStudentStatement(newFinalText.trim());
    }
    liveTranscript.textContent = finalTranscript + interim;
  };

  recognition.onerror = (event) => {
    console.error("Speech error:", event.error);
    if (event.error === "not-allowed") {
      statusText.textContent =
        "Microphone permission denied. Please allow the microphone in your browser.";
      isListening = false;
    } else if (event.error !== "no-speech") {
      statusText.textContent = "Speech error: " + event.error;
    }
  };

  recognition.onend = () => {
    if (isListening) {
      try {
        recognition.start();
      } catch (error) {
        console.log(error);
      }
    }
  };
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    setupSpeechRecognition();
  }
  try {
    recognition.start();
  } catch (error) {
    console.log("Recognition already running.");
  }
});

stopBtn.addEventListener("click", () => {
  isListening = false;
  if (recognition) {
    recognition.stop();
  }
  stopSpeaking();
  micBtn.textContent = "🎙 Start Speaking";
  stopBtn.disabled = true;
  feedbackBtn.disabled = finalTranscript.trim() === "";
  statusText.textContent = "Microphone stopped.";
});

// ---------------- Student statement ----------------

async function addStudentStatement(statement) {
  finalTranscript += statement + " ";
  liveTranscript.textContent = finalTranscript;
  addTranscriptEntry("You", statement);
  feedbackBtn.disabled = false;
  await getAIResponses(statement);
}

// ---------------- AI participants reply ----------------

async function getAIResponses(statement) {
  dominatorText.textContent = "Thinking...";
  dataText.textContent = "Thinking...";
  quietText.textContent = "Thinking...";

  try {
    const response = await fetch("/api/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: currentTopic,
        transcript: statement
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "API error");
    }

    const dominator = data.replies.find((item) => item.type === "dominator");
    const dataDriven = data.replies.find((item) => item.type === "data");
    const quiet = data.replies.find((item) => item.type === "quiet");

    dominatorText.textContent = dominator.text;
    dataText.textContent = dataDriven.text;
    quietText.textContent = quiet.text;

    addTranscriptEntry("Dominator", dominator.text);
    addTranscriptEntry("Data-Driven", dataDriven.text);
    addTranscriptEntry("Quiet", quiet.text);

    // AI speaks one by one
    await speakAllReplies([
      { name: "Dominator", text: dominator.text },
      { name: "Data-Driven", text: dataDriven.text },
      { name: "Quiet", text: quiet.text }
    ]);
  } catch (error) {
    console.error(error);
    dominatorText.textContent = "Could not get response.";
    dataText.textContent = "Could not get response.";
    quietText.textContent = "Could not get response.";
  }
}

// ---------------- Transcript list ----------------

function addTranscriptEntry(speaker, text) {
  const empty = transcriptHistory.querySelector(".empty");
  if (empty) {
    empty.remove();
  }

  const entry = document.createElement("div");
  entry.className =
    "transcript-entry " + speaker.toLowerCase().replace(/[^a-z]/g, "");

  const speakerElement = document.createElement("strong");
  speakerElement.textContent = speaker;

  const textElement = document.createElement("div");
  textElement.textContent = text;

  entry.appendChild(speakerElement);
  entry.appendChild(textElement);
  transcriptHistory.appendChild(entry);
  transcriptHistory.scrollTop = transcriptHistory.scrollHeight;
}

// ---------------- Final feedback ----------------

feedbackBtn.addEventListener("click", async () => {
  if (!finalTranscript.trim()) {
    return;
  }

  feedbackSection.classList.remove("hidden");
  feedback.innerHTML = '<p class="loading">Generating your feedback...</p>';
  feedbackSection.scrollIntoView({ behavior: "smooth" });

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: currentTopic,
        transcript: finalTranscript
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "API error");
    }

    feedback.style.whiteSpace = "pre-wrap";
    feedback.textContent = data.feedback;
  } catch (error) {
    console.error(error);
    feedback.textContent = "Could not generate feedback. Please try again.";
  }
});