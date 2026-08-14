import { Code, CheckItem, Screenshot, SectionHeading } from "./primitives";
import Reveal from "./Reveal";

export default function GroupChatShowcase() {
  return (
    <section id="groups" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Image first on desktop, second on mobile — the copy should lead
              on a phone, where the screenshot is the least readable. */}
          <Reveal variant="left" delay={120} className="order-2 lg:order-1">
            <Screenshot
              src="/landing-assets/group_messages.jpg"
              alt="An eight-member family group chat with bot throttling and per-agent lead tags"
              sizes="(min-width: 1024px) 50vw, 100vw"
              /*
                The render carries its own "WhatsApp Group Chat" title above
                the conversation, which would repeat the section heading. Trim
                that band off the top (20% of the source) and 3% off the
                bottom, and keep every pixel of width: the chat window sits at
                24–89% vertically, so it lands whole, and the callout labels
                either side survive intact rather than as clipped stubs.
              */
              trim={{ aspect: "1376 / 591", position: "50% 87%" }}
            />
          </Reveal>

          <Reveal variant="right" className="order-1 lg:order-2">
            <SectionHeading
              align="left"
              eyebrow="Multi-lead group CRM"
              eyebrowIcon="users"
              title="Negotiate in family groups."
              highlight="Without losing the thread."
              description="Umrah packages are agreed in an eight-person WhatsApp group, not a one-to-one email chain. HolyCRM makes the conversation the first-class record, so several family leads can live inside one chat."
            />

            <ul className="mt-8 space-y-4">
              <CheckItem title="Atomic group throttling.">
                <Code>bot_gate()</Code> enforces cooldowns and daily caps in SQL, so the
                assistant never talks over your agents.
              </CheckItem>
              <CheckItem title="Reply only when addressed.">
                The bot answers on @mention or an explicit trigger keyword — silence is
                the default in a customer group.
              </CheckItem>
              <CheckItem title="Per-agent lead tags.">
                Two agents can own two different leads in the same chat, with full
                message history and internal notes preserved.
              </CheckItem>
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
