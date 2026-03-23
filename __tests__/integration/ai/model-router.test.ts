import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock the anthropic client — use vi.hoisted since vi.mock is hoisted
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai/client", () => ({
  anthropic: {
    messages: { create: mockCreate },
  },
}));

// Mock rate limiter
vi.mock("@/lib/ai/rate-limiter", () => ({
  withRateLimit: vi.fn((fn: () => Promise<unknown>) => fn()),
  isCircuitBreakerOpen: vi.fn(() => false),
}));

import { callAI, callAIJson } from "@/lib/ai/model-router";

function mockResponse(text: string, inputTokens = 100, outputTokens = 50) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

describe("Model Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("callAI devuelve texto del LLM", async () => {
    mockCreate.mockResolvedValue(mockResponse("Explicación del movimiento bancario"));

    const result = await callAI("explain_bandeja", "System", "User message");
    expect(result).toBe("Explicación del movimiento bancario");
  });

  it("classify_quick usa Haiku", async () => {
    mockCreate.mockResolvedValue(mockResponse('{"accountCode":"629"}'));

    await callAI("classify_quick", "System", "Classify this");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("haiku"),
      })
    );
  });

  it("match_llm usa Sonnet", async () => {
    mockCreate.mockResolvedValue(mockResponse("Match result"));

    await callAI("match_llm", "System", "Match this");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("sonnet"),
      })
    );
  });

  it("daily_briefing usa Opus", async () => {
    mockCreate.mockResolvedValue(mockResponse("Briefing del día"));

    await callAI("daily_briefing", "System", "Generate briefing");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.stringContaining("opus"),
      })
    );
  });

  it("callAIJson con schema válido devuelve parsed", async () => {
    mockCreate.mockResolvedValue(mockResponse('{"accountCode":"629","confidence":0.85}'));

    const schema = z.object({
      accountCode: z.string(),
      confidence: z.number(),
    });

    const result = await callAIJson("classify_quick", "System", "Classify", schema);
    expect(result).toEqual({ accountCode: "629", confidence: 0.85 });
  });

  it("callAIJson con JSON malformado devuelve null", async () => {
    mockCreate.mockResolvedValue(mockResponse("This is not JSON at all"));

    const schema = z.object({ accountCode: z.string() });
    const result = await callAIJson("classify_quick", "System", "Classify", schema);
    expect(result).toBeNull();
  });

  it("callAIJson con schema inválido devuelve null", async () => {
    mockCreate.mockResolvedValue(mockResponse('{"wrongField":"value"}'));

    const schema = z.object({ accountCode: z.string() });
    const result = await callAIJson("classify_quick", "System", "Classify", schema);
    expect(result).toBeNull();
  });

  it("callAI maneja errores de API gracefully", async () => {
    mockCreate.mockRejectedValue(new Error("API timeout"));

    // callAI may return null or throw depending on implementation
    try {
      const result = await callAI("explain_bandeja", "System", "Explain");
      expect(result).toBeNull();
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain("API timeout");
    }
  });

  it("strips markdown code fences from JSON response", async () => {
    mockCreate.mockResolvedValue(mockResponse('```json\n{"accountCode":"629"}\n```'));

    const schema = z.object({ accountCode: z.string() });
    const result = await callAIJson("classify_quick", "System", "Classify", schema);
    expect(result).toEqual({ accountCode: "629" });
  });

  it("cada task tiene max_tokens configurados", async () => {
    mockCreate.mockResolvedValue(mockResponse("OK"));

    await callAI("classify_quick", "System", "Test");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: expect.any(Number),
      })
    );
  });
});
