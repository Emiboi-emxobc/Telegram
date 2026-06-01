const OpenAI =
  require("openai");

const client =
  new OpenAI({
    apiKey:
      process.env.OPENAI_API_KEY
  });

async function generate(
  messages = [],
  options = {}
) {
  const response =
    await client.chat.completions.create({
      model:
        options.model ||
        "gpt-4.1-mini",

      messages,

      temperature:
        options.temperature ??
        0.7
    });

  return response
    .choices?.[0]
    ?.message?.content;
}

module.exports = {
  generate
};