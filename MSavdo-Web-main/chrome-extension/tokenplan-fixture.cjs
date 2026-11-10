const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (input !== "https://tokenplan.one/v1/chat/completions") return originalFetch(input, options);
  if (options.headers.Authorization !== "Bearer valid-test-key") {
    return Response.json({ error: "credentials rejected" }, { status: 401 });
  }
  const prompt = JSON.parse(options.body).messages[0].content;
  if (process.env.TOKENPLAN_TEST_LOG) require("node:fs").appendFileSync(process.env.TOKENPLAN_TEST_LOG, `${JSON.stringify({ prompt })}\n`);
  if (prompt.includes("подкатегорию")) await new Promise((resolve) => setTimeout(resolve, 300));
  if (prompt.includes("подкатегорию") && prompt.includes("TEST_CATEGORY_FAILURE")) {
    return Response.json({ error: "quota" }, { status: 429 });
  }
  const result = prompt.includes("подкатегорию")
    ? "Туризм, кемпинг и пикник"
    : prompt.includes("только название") ? "Солнечный фонарь" : "Фонарь для кемпинга.";
  return Response.json({ choices: [{ message: { content: result } }] });
};
