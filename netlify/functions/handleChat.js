import fetch from 'node-fetch';

const scoringTriggers = {
  "checked_airway": /airway|open.*airway/i,
  "gave_oxygen": /oxygen|non-rebreather|15L/i,
  "gave_aspirin": /aspirin|ASA|324mg/i,
  "called_als": /ALS|advanced life support/i
};

const expectedActions = [
  "checked_airway",
  "gave_oxygen",
  "gave_aspirin",
  "called_als"
];

export async function handler(event) {
  try {
    const { message, history = [] } = JSON.parse(event.body);

    let userScore = {};
    Object.entries(scoringTriggers).forEach(([key, regex]) => {
      if (regex.test(message)) {
        userScore[key] = true;
      }
    });

    const systemPrompt = `
You are simulating a 55-year-old male experiencing chest pain at home.
Only provide information when the EMT asks. Do not volunteer full history.
Respond only as the patient unless the user asks for information only the proctor would know.
    `;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message }
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages
      })
    });

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || "⚠️ AI response unavailable.";

    const updatedHistory = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: reply }
    ];

    return {
      statusCode: 200,
      body: JSON.stringify({
        reply,
        updatedHistory,
        userScore
      })
    };
  } catch (err) {
    console.error("handleChat.js error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ reply: "⚠️ Server error." })
    };
  }
}
