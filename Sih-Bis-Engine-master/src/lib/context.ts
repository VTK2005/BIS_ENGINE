import "server-only";

type ChatHistoryMessage = {
    role: "user" | "assistant";
    content: string;
};

export type ConversationContext = {
    rewrittenQuery: string;
    conversationContext: string;
    entities: string[];
    intent: string;
};

const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";

// qwen/qwen3.8-27b is an active, fast, and capable model on Groq supporting json_object mode
const GROQ_MODEL = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";

export async function buildConversationContext(history: ChatHistoryMessage[], currentQuery: string): Promise<ConversationContext> {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
        throw new Error("GROQ_API_KEY is not defined");
    }

    const historyText = history.length > 0
        ? history.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n")
        : "No previous conversation.";

    const systemPrompt = `
You are the conversation-context resolver for a Bureau of Indian Standards (BIS) retrieval system.

Your job is NOT to answer the user's question.

Your job is to understand the current query using the previous conversation and produce a self-contained retrieval query for a separate BIS RAG system.

Rules:
1. Resolve references such as: it, this, that, they, the standard, the laboratory, part 1, the previous topic.
2. Rewrite the current query so that it can be understood without the previous messages.
3. Preserve BIS standard numbers exactly.
4. Do not invent facts.
5. Do not answer the user's question.
6. Extract important entities (product names, standard numbers, certification types, etc.).
7. Determine the user's intent.
8. If the current query is already self-contained, do not unnecessarily change its meaning.

You MUST respond with ONLY a valid JSON object in this exact format (no extra text, no markdown):
{
  "rewrittenQuery": "<self-contained query string>",
  "conversationContext": "<brief summary of prior context, or 'No prior context' if none>",
  "entities": ["<entity1>", "<entity2>"],
  "intent": "<user intent string>"
}

CRITICAL: The "entities" value MUST be a JSON array of strings. Never use an object for entities.
    `;

    const userPrompt = `
Previous conversation:
${historyText}

Current user query:
${currentQuery}
    `;

    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
            response_format: {
                type: "json_object",
            },
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Groq request failed:", response.status, errorText);
        throw new Error(`Groq request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
        console.error("Unexpected Groq response:", data);
        throw new Error("Groq returned an empty response");
    }

    try {
        const parsed = JSON.parse(content);

        // Normalise entities: guard against model returning { items: [...] } instead of [...]
        if (parsed.entities && !Array.isArray(parsed.entities)) {
            parsed.entities = Array.isArray(parsed.entities.items)
                ? parsed.entities.items
                : Object.values(parsed.entities as Record<string, unknown>).flat();
        }

        if (!Array.isArray(parsed.entities)) {
            parsed.entities = [];
        }

        return parsed as ConversationContext;
    } catch (error) {
        console.error("Failed to parse Groq JSON:", content);
        throw new Error("Groq returned invalid JSON");
    }
}