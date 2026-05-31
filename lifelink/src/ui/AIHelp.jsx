import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../auth/AuthContext.jsx";

const API_BASE_URL = "http://localhost:5000/api/reports";

export default function AIHelp() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Send message to backend AI
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg = { sender: "user", text: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages, // send full history for multi-turn context
        }),
      });

      const data = await res.json();

      if (data.success) {
        const botMsg = { sender: "bot", text: data.response };
        setMessages((prev) => [...prev, botMsg]);
      } else {
        setError(data.response || "AI service error. Please try again.");
      }
    } catch (err) {
      setError("Could not reach the AI server. Make sure the backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Generate & save report
  const endConversation = () => {
    if (messages.length === 0) {
      alert("No conversation to generate a report from!");
      return;
    }

    const symptoms = messages
      .filter((m) => m.sender === "user")
      .map((m) => m.text)
      .join(", ");

    const aiAdvice = messages
      .filter((m) => m.sender === "bot")
      .map((m) => m.text)
      .join("\n\n");

    const reportText = `🩺 SwiftCare Emergency First-Aid Report
────────────────────────────────────────
🗓️  Date: ${new Date().toLocaleString()}
👤  Patient Context: ${user?.name || "Anonymous"}

📋 Reported Symptoms / Situation:
${symptoms}

🤖 AI First-Aid Guidance:
${aiAdvice}

────────────────────────────────────────
⚠️  This is AI-generated guidance only. Always seek professional medical help.
`;

    setReport(reportText);

    // Save to localStorage for ReportHistory
    if (user?.email) {
      const key = `reports_${user.email}`;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      existing.push({ date: new Date().toLocaleString(), content: reportText });
      localStorage.setItem(key, JSON.stringify(existing));
    }
  };

  // Download report as .txt
  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SwiftCare_Report_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Clear conversation
  const clearChat = () => {
    if (messages.length === 0) return;
    if (window.confirm("Clear this conversation?")) {
      setMessages([]);
      setReport(null);
      setError("");
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur rounded-2xl p-6 shadow-glow ring-1 ring-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-emerald-700">
          🤖 AI First-Aid Assistant
        </h2>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-xs text-slate-400 hover:text-red-400 transition"
          >
            Clear
          </button>
        )}
      </div>

      {/* Chat Window */}
      <div className="h-72 overflow-y-auto bg-white border rounded-xl p-3 mb-3 flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 text-sm gap-2">
            <span className="text-3xl">🩺</span>
            <p>Describe the patient's condition or symptoms.</p>
            <p className="text-xs text-slate-300">e.g. "Patient is bleeding from the arm" or "Person fainted"</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-xl max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap ${
                m.sender === "user"
                  ? "bg-emerald-100 ml-auto text-right"
                  : "bg-slate-100 text-left"
              }`}
            >
              {m.sender === "bot" && (
                <span className="block text-xs font-semibold text-emerald-600 mb-1">SwiftCare AI</span>
              )}
              {m.text}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="bg-slate-100 rounded-xl p-2.5 max-w-[85%] flex items-center gap-1.5">
            <span className="text-xs text-emerald-600 font-semibold">SwiftCare AI</span>
            <span className="flex gap-1 ml-2">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-500 text-xs mb-2 px-1">⚠️ {error}</p>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe symptoms or situation..."
          disabled={isLoading}
          className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50"
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
        >
          {isLoading ? "..." : "Send"}
        </button>
      </div>

      {/* Actions */}
      <button
        onClick={endConversation}
        disabled={messages.length === 0}
        className="mt-3 w-full bg-rose-500 hover:bg-rose-600 text-white py-2 rounded-xl text-sm font-medium transition disabled:opacity-50"
      >
        📋 End Conversation & Generate Report
      </button>

      {/* Report */}
      {report && (
        <div className="mt-4 bg-slate-50 p-4 rounded-xl border">
          <pre className="text-xs whitespace-pre-wrap mb-3 text-slate-700">{report}</pre>
          <button
            onClick={downloadReport}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-2 rounded-xl text-sm font-medium transition"
          >
            ⬇️ Download Report
          </button>
        </div>
      )}
    </div>
  );
}
