import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { ZodType } from "zod";

type OAuthAuth = { type: "oauth"; refresh: string; access: string; expires: number };
type ApiAuth = { type: "api"; key: string };
type Auth = OAuthAuth | ApiAuth;

// --- State (set from plugin init in index.ts, Task 4) ---
let _statePath: string | null = null;
let _connectedProviders: string[] = [];

export function setStatePath(path: string): void {
  _statePath = path;
}

export function getStatePath(): string {
  if (!_statePath) {
    throw new Error("opencode state path not initialized. Plugin may not be fully started.");
  }
  return _statePath;
}

export function setConnectedProviders(providers: string[]): void {
  _connectedProviders = providers;
}

export function isProviderConnected(providerName: string): boolean {
  return _connectedProviders.includes(providerName);
}

// --- Auth ---
export function readOpencodeAuth(statePath: string, providerName: string): Auth {
  const authPath = join(statePath, "auth.json");
  let raw: string;
  try {
    raw = readFileSync(authPath, "utf-8");
  } catch {
    throw new Error(`opencode auth.json not found at ${authPath}. Is opencode authenticated?`);
  }
  let parsed: Record<string, Auth>;
  try {
    parsed = JSON.parse(raw) as Record<string, Auth>;
  } catch {
    throw new Error(`Failed to read opencode auth.json: invalid JSON`);
  }
  const auth = parsed[providerName];
  if (!auth) {
    const connected = Object.keys(parsed).join(", ") || "none";
    throw new Error(
      `Provider '${providerName}' not found in opencode auth.json. Connected providers: ${connected}`
    );
  }
  return auth;
}

// --- Provider ---
export function createOpencodeAIProvider(providerName: string, auth: Auth) {
  if (providerName === "anthropic") {
    if (auth.type === "oauth") {
      return createAnthropic({ authToken: auth.access });
    }
    return createAnthropic({ apiKey: auth.key });
  }
  if (providerName === "openai") {
    if (auth.type === "oauth") {
      throw new Error("OpenAI does not support OAuth authentication. Use an API key instead.");
    }
    return createOpenAI({ apiKey: auth.key });
  }
  throw new Error(
    `Unsupported opencode provider: '${providerName}'. Supported providers: anthropic, openai`
  );
}

// --- Structured Output ---
export async function generateStructuredOutput<T>(options: {
  providerName: string;
  modelId: string;
  statePath: string;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  temperature?: number;
}): Promise<T> {
  const auth = readOpencodeAuth(options.statePath, options.providerName);
  const provider = createOpencodeAIProvider(options.providerName, auth);
  const result = await generateText({
    model: provider(options.modelId),
    system: options.systemPrompt,
    prompt: options.userPrompt,
    output: Output.object({ schema: options.schema }),
    temperature: options.temperature ?? 0.3,
  });
  return result.output as T;
}
