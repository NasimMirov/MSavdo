const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (input !== "https://tokenplan.lat/v1/chat/completions") return originalFetch(input, options);
  if (options.headers.Authorization !== "Bearer valid-test-key") {
    return Response.json({ error: "credentials rejected" }, { status: 401 });
  }
  const prompt = JSON.parse(options.body).messages[0].content;
  if (prompt.includes("TEST_DELAY")) await new Promise((resolve) => setTimeout(resolve, 300));
  if (prompt.includes("подкатегорию") && prompt.includes("Фонарь без категории")) {
    return Response.json({ error: "quota" }, { status: 429 });
  }
  if (prompt.includes("подкатегорию") && prompt.includes("Солнечный фонарь") && !prompt.includes("Фонарь для кемпинга.")) {
    return Response.json({ error: "missing improved description" }, { status: 422 });
  }
  const result = prompt.includes('Верни только JSON')
    ? JSON.stringify({ title: prompt.includes("TEST_CATEGORY_FAILURE") ? "Фонарь без категории" : "Солнечный фонарь", description: "Фонарь для кемпинга." })
    : prompt.includes("подкатегорию")
    ? "Туризм, кемпинг и пикник"
    : prompt.includes("только название") ? "Солнечный фонарь" : "Фонарь для кемпинга.";
  return Response.json({ choices: [{ message: { content: result } }] });
};
