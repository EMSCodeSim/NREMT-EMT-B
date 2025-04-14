const fs = require("fs");
const path = require("path");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

// Load a scenario by ID from the /scenario folder
function loadScenario(scenarioId) {
  const scenarioPath = path.join(__dirname, `../../scenario/${scenarioId}/chest_pain_001.json`);
  if (fs.existsSync(scenarioPath)) {
    const data = fs.readFileSync(scenarioPath, "utf8");
    return JSON.parse(data);
  }
  return null;
}

// Load prompts
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

    // Very basic logic to decide who should respond
    const isVitalsRequest = /blood pressure|pulse|respirations|spo2|breath sounds/i.test(userMessage);
    const isPatientInteraction = /pain|history|medications|describe|where|when|what/i.test(userMessage);

    let reply = "";

    if (isVitalsRequest && proctorPrompts?.vital_signs) {
      reply = proctorPrompts.vital_signs;
    } else if (isPatientInteraction && patientPrompts?.opqrst) {
      reply = patientPrompts.opqrst;
    }

    // If we didn't match anything specific, escalate to ChatGPT
    if (!reply || typeof reply !== "string") {
      const completion = await openai.createChatCompletion({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `You are an EMS simulation AI. Respond realistically as either the patient or the test proctor, based on the message given. The scenario is: ${scenario.title}. Dispatch: ${scenario.dispatch}`
          },
          {
            role: "user",
            content: userMessage
          }
        ]
      });

      reply = completion.data.choices[0].message.content;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    console.error("Error in handleChat:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error." })
    };
  }
};
