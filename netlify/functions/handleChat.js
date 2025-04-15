const { Configuration, OpenAIApi } = require("openai");
const fs = require("fs");
const path = require("path");

// Configure OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Load scenario JSON
function loadScenario(id) {
  try {
    const data = fs.readFileSync(path.resolve(__dirname, `../scenarios/${id}/${id}.json`));
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load scenario:", error);
    return null;
  }
}

// Load patient or proctor prompt
function loadPrompt(fileName, scenarioId) {
  try {
    const filePath = path.resolve(__dirname, `../scenarios/${scenarioId}/${fileName}`);
    const data = fs.readFileSync(filePath);
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load ${fileName}:`, error);
    return null;
  }
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
        body: JSON.stringify({ error: "Scenario not found." }),
      };
    }

    const patientPrompts = loadPrompt("patient_prompts.json", scenarioId);
    const proctorPrompts = loadPrompt("proctor_prompts.json", scenarioId);

    // Define routing logic
    const isVitalsRequest = /blood pressure|pulse|respirations|spo2|breath sounds/i.test(userMessage);
    const isPatientInteraction = /pain|history|medications|describe|where|when|what|how long/i.test(userMessage);
    const isProctorRequest = /vital signs|scene safe|instructions|guidance|scenario/i.test(userMessage);

    let reply = "";

    // Route to proctor: Vitals
    if (isVitalsRequest && proctorPrompts?.vital_signs) {
      const vitals = proctorPrompts.vital_signs;
      reply = `Blood Pressure: ${vitals.blood_pressure || "N/A"}, Pulse: ${vitals.pulse || "N/A"}, Respirations: ${vitals.respirations || "N/A"}, SpO2: ${vitals.spo2 || "N/A"}`;
    }

    // Route to patient: OPQRST
    else if (isPatientInteraction && patientPrompts?.opqrst) {
      reply = patientPrompts.opqrst.quality || "It's like pressure in my chest.";
    }

    // Route to proctor: Scene/Instructions
    else if (isProctorRequest) {
      reply = proctorPrompts?.instructions || "You are in a safe scene with one patient seated upright.";
    }

    // Fallback to GPT if no match
    if (!reply || typeof reply !== "string") {
      const completion = await openai.createChatCompletion({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `You are an EMS simulation AI. 
            - As a patient, you respond based on realistic symptoms, personality, and emotions.
            - As a proctor, you only answer when vitals or scene info are asked for.
            Scenario: ${scenario.title || "Unknown scenario"}`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      reply = completion?.data?.choices?.[0]?.message?.content?.trim() || "I'm unable to respond at the moment.";
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ response: reply }),
    };
  } catch (error) {
    console.error("OpenAI API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
