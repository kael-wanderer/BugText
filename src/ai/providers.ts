import type {
  CommandProvider,
  HttpProvider,
  PermissionProfile,
} from "./aisettings";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

export type AnthropicBody = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  stream: boolean;
};

export type ResolvedPermissionProfile = {
  id: string;
  label: string;
  run: string;
  confirmEachRun: boolean;
};

export function chatContentText(content: ChatMessage["content"]): string {
  return typeof content === "string"
    ? content
    : content
        .filter(
          (part): part is Extract<ChatContentPart, { type: "text" }> =>
            part.type === "text",
        )
        .map((part) => part.text)
        .join("\n");
}

export function buildHttpBody(
  provider: HttpProvider,
  messages: ChatMessage[],
): object {
  if (provider.api === "anthropic") {
    return buildAnthropicBody(provider, messages);
  }
  return { model: provider.model, messages, stream: true };
}

export function buildAnthropicBody(
  provider: HttpProvider,
  messages: ChatMessage[],
): AnthropicBody {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => chatContentText(message.content))
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
  const body: AnthropicBody = {
    model: provider.model,
    max_tokens: provider.maxTokens ?? 4096,
    messages: messages
      .filter(
        (message): message is ChatMessage & { role: "user" | "assistant" } =>
          message.role === "user" || message.role === "assistant",
      )
      .map((message) => ({
        role: message.role,
        content: chatContentText(message.content),
      })),
    stream: true,
  };
  if (system) body.system = system;
  return body;
}

export function parseSSEDelta(line: string): string | null | "DONE" {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (payload === "[DONE]") return "DONE";
  try {
    const json = JSON.parse(payload);
    const content = json?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

export function parseAnthropicSSEDelta(line: string): string | null | "DONE" {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  try {
    const json = JSON.parse(payload);
    if (json?.type === "message_stop") return "DONE";
    if (
      json?.type === "content_block_delta" &&
      json?.delta?.type === "text_delta" &&
      typeof json.delta.text === "string"
    ) {
      return json.delta.text;
    }
    return null;
  } catch {
    return null;
  }
}

// Temporary legacy panel permission controls; removed with the Task 10 panel rewrite.
export function commandPermissionProfiles(
  provider: CommandProvider,
): ResolvedPermissionProfile[] {
  if (provider.permissionProfiles?.length) {
    return provider.permissionProfiles.map(normalizeCustomProfile);
  }
  const profiles: ResolvedPermissionProfile[] = [
    {
      id: "ask",
      label: "Ask before doing",
      run: provider.run,
      confirmEachRun: false,
    },
  ];
  if (provider.bypassRun) {
    profiles.push({
      id: "full-access",
      label: "Full access",
      run: provider.bypassRun,
      confirmEachRun: true,
    });
  }
  return profiles;
}

export function resolveCommandPermissionProfile(
  provider: CommandProvider,
  selectedProfileId: string,
): ResolvedPermissionProfile {
  const profiles = commandPermissionProfiles(provider);
  return (
    profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  );
}

function normalizeCustomProfile(
  profile: PermissionProfile,
): ResolvedPermissionProfile {
  return {
    id: profile.id,
    label: profile.label,
    run: profile.run,
    confirmEachRun: profile.confirmEachRun ?? false,
  };
}
