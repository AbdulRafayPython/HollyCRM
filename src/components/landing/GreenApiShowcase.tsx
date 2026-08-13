import { CheckItem, Screenshot, SectionHeading } from "./primitives";
import Reveal from "./Reveal";

export default function GreenApiShowcase() {
  return (
    <section id="whatsapp" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Copy and screenshot enter from their own sides, the picture a beat
            behind the words — the reference never moves two things at once. */}
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal variant="left">
            <SectionHeading
              align="left"
              eyebrow="Green API gateway"
              eyebrowTone="emerald"
              title="Native WhatsApp messaging,"
              highlight="without API limitations."
              description="Connect your agency's own WhatsApp line through Green API. Direct chats and multi-member family groups arrive in the same inbox, with delivery receipts and media context intact."
            />

            <ul className="mt-8 space-y-4">
              <CheckItem tone="emerald" title="Groups and direct, equally.">
                Incoming messages, @mentions and delivery status stream in live —
                group chats are not a second-class citizen.
              </CheckItem>
              <CheckItem tone="emerald" title="Media mirrored to private storage.">
                Passport scans, hotel vouchers and voice notes land in an encrypted
                bucket the moment they arrive.
              </CheckItem>
              <CheckItem tone="emerald" title="Idempotent webhooks.">
                Sub-50ms processing with no duplicated messages and no silently
                dropped customer replies.
              </CheckItem>
            </ul>
          </Reveal>

          <Reveal variant="right" delay={120}>
            <Screenshot
              src="/landing-assets/green_api.jpg"
              alt="Green API instance status and live webhook event stream inside HollyCRM"
              sizes="(min-width: 1024px) 50vw, 100vw"
              zoom={1.12}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
