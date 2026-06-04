"use client";

import { FormEvent, useRef, useState } from "react";

type Role = "user" | "assistant";
type Status = "idle" | "streaming" | "error";

interface Message {
  role: Role;
  content: string;
  tool?: string;
}

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const initialMessages: Message[] = [
  {
    role: "assistant",
    content:
      "Estoy listo. Puedo revisar estado, riesgo, señales, operaciones, capital/PnL y precios mock."
  }
];

function parseSse(buffer: string) {
  const events: SseEvent[] = [];
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? "";

  for (const part of parts) {
    const lines = part.split(/\n/);
    const event = lines
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const dataRaw = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length))
      .join("\n");

    if (!event) continue;

    try {
      events.push({ event, data: JSON.parse(dataRaw || "{}") as Record<string, unknown> });
    } catch {
      events.push({ event, data: {} });
    }
  }

  return { events, rest };
}

async function readAssistantStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    const parsed = parseSse(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const event of parsed.events) onEvent(event);
  }
}

function quickPrompts() {
  return ["estado del bot", "riesgo actual", "última señal", "operaciones abiertas"];
}

export default function AssistantPanel() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);

  async function send(content: string) {
    const prompt = content.trim();
    if (!prompt || status === "streaming") return;

    const nextMessages: Message[] = [...messages, { role: "user", content: prompt }];
    const assistantIndex = nextMessages.length;
    nextMessages.push({ role: "assistant", content: "" });
    setMessages(nextMessages);
    setInput("");
    setStatus("streaming");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${apiBaseUrl}/assistant/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages
            .filter((message) => message.content.trim())
            .map((message) => ({ role: message.role, content: message.content }))
        }),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        throw new Error("assistant request failed");
      }

      await readAssistantStream(response.body, (event) => {
        if (event.event === "tool" && typeof event.data.name === "string") {
          setMessages((current) =>
            current.map((message, index) =>
              index === assistantIndex ? { ...message, tool: event.data.name as string } : message
            )
          );
        }
        if (event.event === "message" && typeof event.data.text === "string") {
          setMessages((current) =>
            current.map((message, index) =>
              index === assistantIndex
                ? { ...message, content: `${message.content}${event.data.text}` }
                : message
            )
          );
        }
      });

      setStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setStatus("error");
      setMessages((current) =>
        current.map((message, index) =>
          index === assistantIndex
            ? {
                ...message,
                content: "No pude conectar con el asistente local. Revisa que la API esté arriba."
              }
            : message
        )
      );
    } finally {
      abortRef.current = null;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  return (
    <section className="rounded-md border border-cyan-400/20 bg-[#07111f] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Asistente ALFA</h2>
          <p className="text-xs font-medium text-slate-500">Caja operativa local</p>
        </div>
        <span
          className={
            status === "error"
              ? "rounded bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-300"
              : "rounded bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-200"
          }
        >
          {status === "streaming" ? "Leyendo" : status === "error" ? "Error" : "Online"}
        </span>
      </div>

      <div className="h-[320px] overflow-y-auto rounded border border-sky-400/10 bg-slate-950/45 p-3">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
              className={message.role === "user" ? "text-right" : "text-left"}
            >
              <div
                className={
                  message.role === "user"
                    ? "ml-auto inline-block max-w-[88%] rounded-md border border-sky-400/25 bg-sky-500/15 px-3 py-2 text-sm text-sky-50"
                    : "inline-block max-w-[92%] rounded-md border border-cyan-400/15 bg-[#081727] px-3 py-2 text-sm text-slate-200"
                }
              >
                {message.tool ? (
                  <p className="mb-1 font-mono text-[10px] uppercase text-cyan-300">
                    {message.tool}
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap leading-relaxed">
                  {message.content || "Analizando..."}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickPrompts().map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={status === "streaming"}
            onClick={() => void send(prompt)}
            className="rounded border border-sky-400/20 bg-slate-950/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={input}
          disabled={status === "streaming"}
          onChange={(event) => setInput(event.target.value)}
          className="h-10 rounded border border-sky-400/15 bg-slate-950/80 px-3 text-sm text-slate-200 outline-none disabled:opacity-60"
          placeholder="Pregúntale al asistente..."
        />
        {status === "streaming" ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="h-10 rounded border border-amber-400/35 bg-amber-500/10 px-3 text-sm font-semibold text-amber-200"
          >
            Detener
          </button>
        ) : (
          <button
            type="submit"
            className="h-10 rounded border border-cyan-400/35 bg-cyan-500/15 px-3 text-sm font-semibold text-cyan-100"
          >
            Enviar
          </button>
        )}
      </form>
    </section>
  );
}
