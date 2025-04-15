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

    // Define roles and behavior
    const isVitalsRequest = /blood pressure|pulse|respirations|spo2|breath sounds/i.test(userMessage);
    const isPatientInteraction = /pain|history|medications|describe|where|when|what/i.test(userMessage);
    const isProctorRequest = /vital signs|instructions|guidance|scenario/i.test(userMessage);

    let reply = "";

    if (isVitalsRequest && proctorPrompts?.vital_signs) {
      const vitalSigns = proctorPrompts.vital_signs;
      reply = `Blood Pressure: ${vitalSigns.blood_pressure || "N/A"}, Pulse: ${
        vitalSigns.pulse || "N/A"
      }, Respirations: ${vitalSigns.respirations || "N/A"}, SpO2: ${vitalSigns.spo2 || "N/A"}`;
    } else if (isPatientInteraction && patientPrompts?.opqrst) {
      reply = patientPrompts.opqrst.quality || "It's like pressure in my chest.";
    } else if (isProctorRequest) {
      reply = proctorPrompts?.instructions || "Follow the instructions for this scenario.";
    }

    // Fallback to ChatGPT if no prebuilt match
    if (!reply || typeof reply !== "string") {
      const completion = await openai.createChatCompletion({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `You are an EMS simulation AI. You can act as both a patient and a proctor. 
            - As a patient, answer based on symptoms and the scenario provided.
            - As a proctor, provide guidance, vital signs, or instructions when requested.
            Current Scenario: ${scenario.title || "Unknown Scenario"}.`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      reply = completion.data.choices[0].message.content.trim();
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
