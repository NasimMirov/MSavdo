const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (input !== "https://tokenplan.lat/v1/chat/completions") return originalFetch(input, options);
  if (options.headers.Authorization !== "Bearer valid-test-key") {
    return Response.json({ error: "credentials rejected" }, { status: 401 });
  }
  const prompt = JSON.parse(options.body).messages[0].content;
  const result = prompt.includes("подкатегорию")
    ? "Туризм, кемпинг и пикник"
    : prompt.includes("только название") ? "Солнечный фонарь" : "Фонарь для кемпинга.";
  return Response.json({ choices: [{ message: { content: result } }] });
};
