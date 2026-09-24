import { NextResponse } from "next/server";

export async function GET() {
  try {
    const models: { id: string; name: string; provider: string; available: boolean }[] = [];

    // CLAUDE modelleri
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.models.list({ limit: 20 });
        for (const model of response.data) {
          models.push({
            id: model.id,
            name: model.display_name || model.id,
            provider: "claude",
            available: true,
          });
        }
      } catch (e) {
        // API key geçersiz veya hata — varsayılan modelleri göster
        console.error("Claude models fetch error:", e);
        models.push(
          { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "claude", available: true },
          { id: "claude-haiku-4-20250414", name: "Claude Haiku 4", provider: "claude", available: true },
        );
      }
    }

    // GEMINI modelleri
    if (process.env.GEMINI_API_KEY) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
        );
        if (res.ok) {
          const data = await res.json();
          for (const model of data.models || []) {
            if (model.supportedGenerationMethods?.includes("generateContent")) {
              const id = model.name.replace("models/", "");
              models.push({
                id,
                name: model.displayName || id,
                provider: "gemini",
                available: true,
              });
            }
          }
        }
      } catch (e) {
        console.error("Gemini models fetch error:", e);
        models.push(
          { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini", available: true },
          { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", provider: "gemini", available: true },
        );
      }
    }

    // OPENAI modelleri
    if (process.env.OPENAI_API_KEY) {
      try {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        });
        if (res.ok) {
          const data = await res.json();
          const gptModels = (data.data || [])
            .filter((m: { id: string }) => m.id.startsWith("gpt-"))
            .sort((a: { created: number }, b: { created: number }) => b.created - a.created)
            .slice(0, 10);
          for (const model of gptModels) {
            models.push({
              id: model.id,
              name: model.id,
              provider: "openai",
              available: true,
            });
          }
        }
      } catch (e) {
        console.error("OpenAI models fetch error:", e);
        models.push(
          { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", available: true },
          { id: "gpt-4o", name: "GPT-4o", provider: "openai", available: true },
        );
      }
    }

    return NextResponse.json({ models });
  } catch (error) {
    console.error("Models API error:", error);
    return NextResponse.json({ models: [] }, { status: 500 });
  }
}
