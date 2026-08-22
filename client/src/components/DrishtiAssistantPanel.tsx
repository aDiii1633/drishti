import type { RoleSession } from "../../../server/roleAuth";
import { Bot, Mic, MicOff, Send, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";

type Message = { id: string; role: "user" | "assistant"; content: string };

type SpeechRecognitionEvent = Event & {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function quickPrompts(role: RoleSession["role"]) {
  if (role === "admin") return ["Show pending evaluations", "How do I assign an evaluator?", "How do I generate a QR?"];
  if (role === "school_admin") return ["What is the intake status?", "How does re-check work?", "What does this status mean?"];
  if (role === "operator") return ["How do I scan a QR?", "Why is this QR invalid?", "How do I upload an answer sheet?"];
  if (role === "student") return ["Check my result", "Can I request a re-check?", "Explain my status"];
  return ["How do I mark this?", "Why was this scored?", "How do I finalize a paper?"];
}

function languageCode(message: string) {
  if (/[\u0900-\u097F]/.test(message)) return "hi-IN";
  if (/\b(kya|kaise|mera|meri|mujhe|karna|kitne)\b/i.test(message)) return "hi-IN";
  return "en-IN";
}

function currentContext(route: string) {
  const bundleMatch = route.match(/\/(?:checking|paper)\/([^/?#]+)/);
  const questionId = document.querySelector<HTMLElement>("[data-assistant-question-id]")?.dataset.assistantQuestionId;
  return { route, bundleId: bundleMatch?.[1], questionId: questionId || undefined };
}

export default function DrishtiAssistantPanel({ session, route, onClose }: { session: RoleSession; route: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speechRef = useRef<SpeechRecognitionInstance | null>(null);
  const chat = trpc.assistant.chat.useMutation();
  const prompts = useMemo(() => quickPrompts(session.role), [session.role]);
  const latestAssistant = [...messages].reverse().find(message => message.role === "assistant");

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      speechRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const stopSpeaking = () => window.speechSynthesis?.cancel();
  const speak = (content: string) => {
    if (muted || !window.speechSynthesis) return;
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = languageCode(content);
    window.speechSynthesis.speak(utterance);
  };

  const submit = async (value = input, source: "text" | "voice" = "text") => {
    const message = value.trim();
    if (!message || chat.isPending) return;
    const history = messages.slice(-6).map(item => ({ role: item.role, content: item.content }));
    setMessages(previous => [...previous, { id: `user-${Date.now()}`, role: "user", content: message }]);
    setInput("");
    setVoiceNotice(source === "voice" ? `You asked: ${message}` : "");
    try {
      const response = await chat.mutateAsync({ message, history, context: currentContext(route) });
      setMessages(previous => [...previous, { id: `assistant-${Date.now()}`, role: "assistant", content: response.answer }]);
      if (voiceMode || source === "voice") speak(response.answer);
    } catch {
      setMessages(previous => [...previous, { id: `assistant-error-${Date.now()}`, role: "assistant", content: "AI Assistant is temporarily unavailable. Please try again." }]);
    }
  };

  const startListening = () => {
    stopSpeaking();
    const browser = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("Voice input is not available in this browser. You can continue in text mode.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = /[\u0900-\u097F]/.test(input) ? "hi-IN" : "en-IN";
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) void submit(transcript, "voice");
    };
    recognition.onerror = () => setVoiceNotice("Voice input could not be captured. You can continue in text mode.");
    recognition.onend = () => setListening(false);
    speechRef.current = recognition;
    setListening(true);
    setVoiceNotice("Listening...");
    recognition.start();
  };

  const stopListening = () => {
    speechRef.current?.stop();
    setListening(false);
  };

  return (
    <section aria-label="DRISHTI AI Assistant" className="fixed bottom-5 right-5 z-[80] flex h-[min(620px,calc(100dvh-40px))] w-[380px] flex-col overflow-hidden rounded-lg border border-[#b6d6e8] bg-white shadow-[0_24px_64px_rgba(22,48,68,.24)] max-sm:inset-x-3 max-sm:bottom-3 max-sm:h-[calc(100dvh-24px)] max-sm:w-auto">
      <header className="flex items-center justify-between border-b border-[#d9eaf3] bg-[#f8fcff] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#163044] text-white"><Sparkles size={15} /></span><div className="min-w-0"><h2 className="text-sm font-semibold">DRISHTI AI</h2><p className="truncate text-xs text-[#6b8190]">Ask about your current workspace</p></div></div>
        <div className="flex items-center gap-1"><button type="button" aria-label={voiceMode ? "Switch to text mode" : "Switch to voice mode"} title={voiceMode ? "Switch to text mode" : "Switch to voice mode"} onClick={() => setVoiceMode(value => !value)} className={`press grid h-8 w-8 place-items-center rounded-md ${voiceMode ? "bg-[#eaf6fd] text-[#2f6f95]" : "text-[#587181] hover:bg-white"}`}><Mic size={16} /></button><button type="button" aria-label="Close DRISHTI AI Assistant" title="Close" onClick={onClose} className="press grid h-8 w-8 place-items-center rounded-md text-[#587181] hover:bg-white"><X size={17} /></button></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.length === 0 ? <div className="px-2"><p className="text-sm leading-6 text-[#587181]">I can help with DRISHTI, evaluation, scanning, answer sheets, and student support.</p><div className="mt-4 flex flex-wrap gap-2">{prompts.map(prompt => <button key={prompt} type="button" onClick={() => void submit(prompt)} className="press rounded-full border border-[#d9eaf3] bg-white px-3 py-1.5 text-left text-xs text-[#2f6f95] hover:border-[#8fc7e8]">{prompt}</button>)}</div></div> : null}
        <div className="space-y-3">{messages.map(message => <article key={message.id} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" ? <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eaf6fd] text-[#2f6f95]"><Bot size={14} /></span> : null}<p className={`max-w-[82%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-5 ${message.role === "user" ? "bg-[#163044] text-white" : "bg-[#f0f8fd] text-[#163044]"}`}>{message.content}</p></article>)}{chat.isPending ? <div className="flex items-center gap-2 px-2 text-xs text-[#6b8190]"><span className="h-3 w-3 animate-spin rounded-full border border-[#8fc7e8] border-t-[#2f6f95]" /> Thinking</div> : null}</div>
      </div>
      <div className="border-t border-[#d9eaf3] bg-[#fbfdfe] p-3">
        {voiceNotice ? <p className="mb-2 text-xs text-[#587181]" role="status">{voiceNotice}</p> : null}
        {voiceMode ? <div className="mb-2 flex items-center justify-between rounded-md border border-[#d9eaf3] bg-white px-3 py-2"><span className="text-xs font-medium text-[#2f6f95]">{listening ? "Listening" : "Voice mode"}</span><div className="flex items-center gap-1"><button type="button" onClick={listening ? stopListening : startListening} aria-label={listening ? "Stop listening" : "Start voice input"} title={listening ? "Stop listening" : "Start voice input"} className={`press grid h-8 w-8 place-items-center rounded-md ${listening ? "bg-[#b64c40] text-white" : "bg-[#163044] text-white"}`}>{listening ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}</button><button type="button" onClick={() => { stopSpeaking(); setMuted(value => !value); }} aria-label={muted ? "Unmute voice output" : "Mute voice output"} title={muted ? "Unmute voice output" : "Mute voice output"} className="press grid h-8 w-8 place-items-center rounded-md border border-[#d9eaf3] text-[#587181]">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><button type="button" disabled={!latestAssistant} onClick={() => latestAssistant && speak(latestAssistant.content)} aria-label="Replay latest answer" title="Replay latest answer" className="press grid h-8 w-8 place-items-center rounded-md border border-[#d9eaf3] text-[#587181] disabled:opacity-35"><Volume2 size={16} /></button></div></div> : null}
        <div className="flex items-end gap-2"><textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={2} maxLength={4_000} placeholder="Ask about DRISHTI..." aria-label="Ask DRISHTI AI a question" className="min-h-10 flex-1 resize-none rounded-md border border-[#d9eaf3] bg-white px-3 py-2 text-sm outline-none focus:border-[#2f6f95]" /><button type="button" onClick={() => void submit()} disabled={!input.trim() || chat.isPending} aria-label="Send question" title="Send" className="press grid h-10 w-10 place-items-center rounded-md bg-[#163044] text-white disabled:opacity-40"><Send size={16} /></button>{!voiceMode ? <button type="button" onClick={startListening} aria-label="Start voice input" title="Start voice input" className="press grid h-10 w-10 place-items-center rounded-md border border-[#d9eaf3] text-[#2f6f95]"><MicOff size={16} /></button> : null}</div>
      </div>
    </section>
  );
}
