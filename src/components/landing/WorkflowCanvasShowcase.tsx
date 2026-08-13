import { CheckItem, Screenshot, SectionHeading } from "./primitives";
import Reveal from "./Reveal";

export default function WorkflowCanvasShowcase() {
  return (
    <section
      id="workflow"
      className="scroll-mt-24 border-y border-slate-900/5 bg-slate-50/70 py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <Reveal variant="left">
            <SectionHeading
              align="left"
              eyebrow="Visual agent configuration"
              eyebrowIcon="kanban"
              title="Configure the AI agent"
              highlight="on a drag-and-drop canvas."
              description="Design, test and publish the decision flow without touching code. Route inquiries by intent, fire inventory queries, advance the pipeline, or hand the conversation to a human."
            />

            <ul className="mt-8 space-y-4">
              <CheckItem title="Nodes for every stage.">
                Triggers, intent classifiers, JSON extractors, SQL queries and reply
                actions, wired together visually.
              </CheckItem>
              <CheckItem title="Intent classification.">
                A hotel rate request, a passport upload and a general question take
                three different paths automatically.
              </CheckItem>
              <CheckItem title="Human escalation rules.">
                Below a confidence threshold, custom packages route to a named sales
                agent instead of being guessed at.
              </CheckItem>
            </ul>
          </Reveal>

          <Reveal variant="right" delay={120}>
            <Screenshot
              src="/landing-assets/workflow_canvas.jpg"
              alt="The visual AI workflow canvas with trigger, classifier, SQL and escalation nodes"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
