"use client";

/**
 * H3 · The AI consultant console — the centre of Discovery, not a chat
 * bubble bolted onto a dashboard.
 *
 * Conversation-first: the console owns the top of the page at full width,
 * with the recommendation rendered *inside the conversation* as a card the
 * assistant hands over, and the dashboard demoted below it. Answers come
 * from `sukunAi.advisorReply` — a promise with a real thinking state — so the
 * live model needs no change here beyond `client.ts`'s one-line swap.
 */

import { useEffect, useRef, useState } from "react";
import { AiChip, MetaPill, brandButton } from "@/components/brand/SukunBrand";
import { SendIcon, SparkIcon, ArrowIcon, PinIcon, WalletIcon, BedIcon } from "@/components/brand/Icons";
import { sukunAi, type AdvisorMessage } from "@/lib/ai/client";
import type { DiscoveryProjectViewModel } from "@/lib/adapters/discovery";

interface Turn extends AdvisorMessage {
  /** Project ids the assistant attached to this turn, rendered as inline cards. */
  cards?: number[];
}

const OPENERS = [
  "لماذا رشّحت لي هذا المشروع؟",
  "ما الفرق بينه وبين البديل؟",
  "هل هذا الحي مناسب للعائلات؟",
  "هل المطوّر موثوق؟",
];

export function AiConsole({
  userName,
  ranked,
  onOpenProject,
  onBookProject,
}: {
  userName: string;
  ranked: DiscoveryProjectViewModel[];
  onOpenProject: (id: string) => void;
  onBookProject: (id: string) => void;
}) {
  const hero = ranked[0];
  const alt = ranked[1] ?? hero;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(OPENERS);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keep the newest turn in view without hijacking the whole page scroll.
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, thinking]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || thinking) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    setThinking(true);
    try {
      const reply = await sukunAi.advisorReply({
        question: q,
        history: turns.map(({ role, text }) => ({ role, text })),
        context: {
          topId: hero?.id,
          topName: hero?.name,
          topCity: hero?.city,
          topDistrict: hero?.district,
          topDeveloper: hero?.dev,
          topMatch: hero?.match,
          topPrice: hero?.priceLabel,
          altId: alt?.id,
          altName: alt?.name,
          altCity: alt?.city,
          altMatch: alt?.match,
          altPrice: alt?.priceLabel,
        },
      });
      setTurns((t) => [...t, { role: "assistant", text: reply.text, cards: reply.citedProjectIds }]);
      setSuggestions(reply.suggestions);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", text: "تعذّر الوصول إلى المستشار الآن. حاول مرة أخرى بعد قليل." },
      ]);
    } finally {
      setThinking(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "var(--r-2xl)",
        background:
          "radial-gradient(120% 90% at 85% 0%, rgba(184,132,72,.26) 0%, transparent 55%)," +
          "radial-gradient(90% 80% at 0% 100%, rgba(56,104,202,.2) 0%, transparent 60%)," +
          "linear-gradient(160deg, var(--g-800) 0%, var(--g-900) 60%, var(--g-950) 100%)",
        color: "var(--t-on-dark)",
        boxShadow: "var(--sh-4), inset 0 1px 0 rgba(244,241,234,.09)",
      }}
    >
      {/* slow ambient wash */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: "-30%",
          insetInlineEnd: "-15%",
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(224,172,110,.2) 0%, transparent 68%)",
          animation: "sk-drift 16s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", padding: "30px 32px 26px" }}>
        {/* ---------------------------------------------------------- head */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span
            style={{
              width: 46,
              height: 46,
              borderRadius: "var(--r-md)",
              background: "linear-gradient(150deg,var(--a-300),var(--a-600))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
              boxShadow: "0 8px 22px -8px rgba(184,132,72,.7)",
            }}
          >
            <SparkIcon size={23} />
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.3px" }}>مستشار سُكن العقاري</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--t-on-dark-soft)", marginTop: 3 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--ok-on-dark)",
                  animation: "sk-breathe 1.8s var(--ease) infinite",
                }}
              />
              متصل — يعرف تفضيلاتك وتاريخ تصفّحك
            </div>
          </div>
        </div>

        {/* -------------------------------------------------------- stream */}
        <div
          ref={streamRef}
          style={{
            marginTop: 24,
            maxHeight: empty ? undefined : 380,
            overflowY: empty ? undefined : "auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            paddingInlineEnd: empty ? 0 : 6,
          }}
        >
          {empty ? (
            <div style={{ maxWidth: "52ch" }}>
              <h1
                style={{
                  fontSize: "clamp(24px,3.2vw,34px)",
                  fontWeight: 700,
                  letterSpacing: "-.9px",
                  lineHeight: 1.3,
                  margin: 0,
                }}
              >
                مرحباً {userName}، ما الذي تودّ معرفته؟
              </h1>
              <p style={{ fontSize: 15, color: "var(--t-on-dark-soft)", lineHeight: 1.85, margin: "14px 0 0" }}>
                اسألني عن أي مشروع رشّحته لك، أو قارن بين خيارين، أو استفسر عن حيّ أو مطوّر. أجيبك بناءً على تفضيلاتك
                المسجّلة — لا على إعلانات.
              </p>
            </div>
          ) : (
            turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      maxWidth: "80%",
                      fontSize: 14.5,
                      lineHeight: 1.75,
                      padding: "13px 18px",
                      borderRadius: "var(--r-lg)",
                      background: "rgba(244,241,234,.12)",
                      boxShadow: "inset 0 0 0 1px rgba(244,241,234,.14)",
                      animation: "sk-rise .35s var(--ease) both",
                    }}
                  >
                    {t.text}
                  </div>
                </div>
              ) : (
                <div key={i} style={{ animation: "sk-rise .4s var(--ease) both" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                    <span style={{ color: "var(--a-300)" }}>
                      <SparkIcon size={15} />
                    </span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--a-300)" }}>مستشار سُكن</span>
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.9, whiteSpace: "pre-line", paddingInlineStart: 23 }}>
                    {t.text}
                  </div>
                  {t.cards && t.cards.length > 0 && (
                    <div style={{ display: "grid", gap: 11, marginTop: 16, paddingInlineStart: 23, gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
                      {t.cards.map((id) => {
                        const p = ranked.find((x) => x.id === String(id));
                        if (!p) return null;
                        return (
                          <InlineProjectCard
                            key={id}
                            project={p}
                            onOpen={() => onOpenProject(p.id)}
                            onBook={() => onBookProject(p.id)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              ),
            )
          )}

          {thinking && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingInlineStart: 2 }}>
              <span style={{ color: "var(--a-300)" }}>
                <SparkIcon size={15} />
              </span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--a-300)",
                      animation: `sk-typing 1.1s ${i * 0.15}s var(--ease) infinite`,
                    }}
                  />
                ))}
              </span>
              <span style={{ fontSize: 13, color: "var(--t-on-dark-soft)" }}>يفكّر…</span>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------ composer */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => void ask(s)}
                disabled={thinking}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: "9px 15px",
                  borderRadius: "var(--r-full)",
                  border: "none",
                  cursor: thinking ? "default" : "pointer",
                  background: "rgba(244,241,234,.08)",
                  color: "var(--t-on-dark-soft)",
                  boxShadow: "inset 0 0 0 1px rgba(244,241,234,.16)",
                  opacity: thinking ? 0.5 : 1,
                  transition: "background .18s var(--ease)",
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 8px 8px 18px",
              borderRadius: "var(--r-full)",
              background: "rgba(13,27,52,.5)",
              boxShadow: "inset 0 0 0 1px rgba(244,241,234,.18)",
              backdropFilter: "blur(8px)",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void ask(input);
              }}
              placeholder="اكتب سؤالك للمستشار…"
              aria-label="سؤالك للمستشار"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--t-on-dark)",
                fontSize: 15,
                padding: "10px 4px",
              }}
            />
            <button
              onClick={() => void ask(input)}
              disabled={!input.trim() || thinking}
              aria-label="إرسال"
              style={{
                width: 44,
                height: 44,
                flex: "none",
                borderRadius: "50%",
                border: "none",
                cursor: input.trim() && !thinking ? "pointer" : "default",
                background: input.trim() && !thinking ? "linear-gradient(135deg,var(--a-400),var(--a-600))" : "rgba(244,241,234,.12)",
                color: "var(--t-on-dark)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background .2s var(--ease)",
              }}
            >
              <SendIcon size={19} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------- inline project card */

function InlineProjectCard({
  project,
  onOpen,
  onBook,
}: {
  project: DiscoveryProjectViewModel;
  onOpen: () => void;
  onBook: () => void;
}) {
  return (
    <div
      style={{
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        background: "rgba(244,241,234,.07)",
        boxShadow: "inset 0 0 0 1px rgba(244,241,234,.16)",
        animation: "sk-rise .45s var(--ease) both",
      }}
    >
      <div style={{ height: 88, background: `url(${project.img}) center/cover`, position: "relative" }}>
        <span
          style={{
            position: "absolute",
            top: 10,
            insetInlineEnd: 10,
            fontSize: 11,
            fontWeight: 700,
            padding: "5px 11px",
            borderRadius: "var(--r-full)",
            background: "rgba(13,27,52,.7)",
            color: "var(--a-200)",
            backdropFilter: "blur(6px)",
          }}
        >
          توافق {project.match}%
        </span>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{project.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--t-on-dark-soft)", marginTop: 4 }}>
          <PinIcon size={13} />
          {project.district}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 14px" }}>
          <MetaPill icon={<WalletIcon size={12} />} label={project.priceLabel} tone="onDark" />
          <MetaPill icon={<BedIcon size={12} />} label={`${project.beds ?? "—"}`} tone="onDark" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onOpen}
            style={{ ...brandButton("onDark"), flex: 1, fontSize: 13, padding: "10px 12px" }}
          >
            التفاصيل
          </button>
          <button
            onClick={onBook}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              padding: "10px 12px",
              borderRadius: "var(--r-md)",
              border: "none",
              cursor: "pointer",
              background: "transparent",
              color: "var(--t-on-dark)",
              boxShadow: "inset 0 0 0 1.5px rgba(244,241,234,.3)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            احجز زيارة
            <ArrowIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
