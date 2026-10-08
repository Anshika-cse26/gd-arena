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

let currentTopic = "";
let finalTranscript = "";
let recognition = null;
let isListening = false;

// Start GD
startBtn.addEventListener("click", () => {
  currentTopic = topicSelect.value;
  topicText.textContent = currentTopic;
  setup.classList.add("hidden");
  gdArea.classList.remove("hidden");
  feedbackBtn.disabled = true;
  setupSpeechRecognition();
});

// Speech recognition setup
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
    } else {
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

// Mic start
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

// Mic stop
stopBtn.addEventListener("click", () => {
  isListening = false;
  if (recognition) {
    recognition.stop();
  }
  micBtn.textContent = "🎙 Start Speaking";
  stopBtn.disabled = true;
  feedbackBtn.disabled = finalTranscript.trim() === "";
  statusText.textContent = "Microphone stopped.";
});

// Student statement
async function addStudentStatement(statement) {
  finalTranscript += statement + " ";
  liveTranscript.textContent = finalTranscript;
  addTranscriptEntry("You", statement);
  feedbackBtn.disabled = false;
  await getAIResponses(statement);
}

// AI participants reply
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
  } catch (error) {
    console.error(error);
    dominatorText.textContent = "Could not get response.";
    dataText.textContent = "Could not get response.";
    quietText.textContent = "Could not get response.";
  }
}

// Transcript list
function addTranscriptEntry(speaker, text) {
  const empty = transcriptHistory.querySelector(".empty");
  if (empty) {
    empty.remove();
  }

  const entry = document.createElement("div");
  entry.className = "transcript-entry";

  const speakerElement = document.createElement("strong");
  speakerElement.textContent = speaker;

  const textElement = document.createElement("div");
  textElement.textContent = text;

  entry.appendChild(speakerElement);
  entry.appendChild(textElement);
  transcriptHistory.appendChild(entry);
}

// Final feedback
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