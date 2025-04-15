const fs = require("fs");
const path = require("path");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

// Load the renamed scenario file
function loadScenario(scenarioId) {
  const scenarioPath = path.join(__dirname, `../../scenario/${scenarioId}/pain_001.json`);
  if (fs.existsSync(scenarioPath)) {
    const data = fs.readFileSync(scenarioPath, "utf8");
    return JSON.parse(data);
  } else {
    console.error("Scenario file not found:", scenarioPath);
    return null;
  }
}

function loadPrompt(fileName, scenarioId) {
  const promptPath = path.join(__dirname, `../../scenario/${scenarioId}/${fileName}`);
  if (fs.existsSync(promptPath)) {
    const data = fs.readFileSync(promptPath, "utf8");
    return JSON.parse(data);
  }
  return null;
}

exports.handler = async function (event, context) {
  try {
    const body = JSON.parse(event.body);
    const userMessage = body.message;
    const scenarioId = body.scenarioId || "chest_pain_001";

    const scenario = loadScenario(scenarioId);
    if (!scenario) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Scenario not found." })
      };
    }

    const patientPrompts = loadPrompt("patient_prompts.json", scenarioId);
    const proctorPrompts = loadPrompt("proctor_prompts.json", scenarioId);

    // Keyword matching
    const isVitalsRequest = /blood pressure|pulse|respirations|spo2|breath sounds/i.test(userMessage);
    const isPatientInteraction = /pain|history|medications|describe|where|when|what/i.test(userMessage);

    let reply = "";

    if (isVitalsRequest && proctorPrompts?.vital_signs) {
      reply = proctorPrompts.vital_signs.blood_pressure || "BP is 120/80.";
    } else if (isPatientInteraction && patientPrompts?.opqrst) {
      reply = patientPrompts.opqrst.quality || "It's like pressure in my chest.";
    }

    // Fallback to ChatGPT if no prebuilt match
    if (!reply || typeof reply !== "string") {
      const completion = await openai.createChatCompletion({
        model: "gpt-4-turbo", // For testing
        messages: [
          {
            role: "system",
            content: `You are an EMS simulation AI.
