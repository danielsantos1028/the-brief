import { useState } from "react";

export function AboutProject() {
  const [deployment, setDeployment] = useState<"vercel" | "nginx">("vercel");
  const vercel = deployment === "vercel";
  return (
    <article className="about-project">
      <div className="section-heading">
        <div>
          <span className="eyebrow">BEHIND THE BRIEF</span>
          <h1>About the project<span className="heading-dot">.</span></h1>
        </div>
        <p>A closer look.<br />From request to headline.</p>
      </div>
      <div className="project-intro">
        <div>
          <h2>A little perspective.<br />Thoughtfully engineered.</h2>
          <p>The Brief is a news reader that brings U.S. headlines into one calm, focused edition. Browse seven categories, follow stories to their original publishers, and explore more headlines without another upstream request.</p>
          <div className="project-author"><span className="author-monogram" aria-hidden="true">DS</span><div><span className="eyebrow">CREATED BY</span><strong>Daniel Santos</strong></div></div>
        </div>
        <aside className="project-source">
          <span className="eyebrow">EXPLORE THE SOURCE</span>
          <h3>Built in the open spirit.</h3>
          <p>Explore the code, deployment configuration, and architecture decisions on GitHub.</p>
          <a className="button" href="https://github.com/danielsantos1028/the-brief" target="_blank" rel="noopener noreferrer">View on GitHub <span aria-hidden="true">↗</span></a>
          <small>Private repository · GitHub access required</small>
        </aside>
      </div>
      <section className="architecture" aria-labelledby="architecture-title">
        <div className="section-divider"><h2 id="architecture-title">The architecture</h2><span>One origin. A protected news source.</span></div>
        <div className="architecture-controls" aria-label="Architecture deployment">
          <button aria-pressed={vercel} onClick={() => setDeployment("vercel")}>Vercel deployment</button>
          <button aria-pressed={!vercel} onClick={() => setDeployment("nginx")}>Nginx / Docker</button>
        </div>
        <figure className="architecture-figure">
          <div className="architecture-flow" role="img" aria-label={`Browser sends requests to ${vercel ? "Vercel routing" : "Nginx reverse proxy"}, which serves React assets or forwards API requests to Fastify. Fastify uses ${vercel ? "shared Redis" : "persistent disk"} cache and calls NewsAPI server-side.`}>
            <div className="architecture-node"><span className="node-number">01 / CLIENT</span><strong>Browser</strong><span>React + TypeScript</span></div>
            <span className="flow-arrow" aria-hidden="true">→<small>HTTPS</small></span>
            <div className="architecture-node proxy-node"><span className="node-number">02 / REVERSE PROXY</span><strong>{vercel ? "Vercel routing" : "Nginx"}</strong><span>Static files → React<br />/api/news → backend</span><span className="proxy-label">ONE PUBLIC ENTRY POINT</span></div>
            <span className="flow-arrow" aria-hidden="true">→<small>/api/news</small></span>
            <div className="architecture-node"><span className="node-number">03 / SERVER</span><strong>Fastify API</strong><span>Validate · cache · normalize</span><span className="cache-label">{vercel ? "Shared Redis cache" : "Persistent disk cache"}</span></div>
            <span className="flow-arrow" aria-hidden="true">→<small>Server only</small></span>
            <div className="architecture-node"><span className="node-number">04 / SOURCE</span><strong>NewsAPI</strong><span>Original publisher headlines</span></div>
          </div>
          <figcaption>{vercel ? "The live site uses Vercel’s routing layer to serve the frontend and forward API requests to a server function, with Redis shared across instances." : "The Docker stack uses Nginx as a reverse proxy. It serves the built frontend, limits API traffic, and forwards requests to Fastify on a private loopback port."}</figcaption>
        </figure>
        <div className="proxy-explainer"><span className="eyebrow">WHY A REVERSE PROXY?</span><h3>A single front door. Clear responsibilities.</h3><p>Your browser uses the same origin for the page and its news requests. The routing layer separates static assets from API traffic; the backend authenticates with NewsAPI and returns normalized headlines. The API key stays on the server because the backend makes the upstream request.</p></div>
      </section>
      <div className="project-principles">
        <section><span className="eyebrow">01 / EFFICIENT</span><h3>One shared edition</h3><p>Headlines are cached for two hours by default. A daily request budget protects upstream usage, while pagination reveals articles already loaded.</p></section>
        <section><span className="eyebrow">02 / RESILIENT</span><h3>Built for a brief pause</h3><p>When the source is unavailable, a saved edition can be served within a bounded stale window, with a clear notice for readers.</p></section>
        <section><span className="eyebrow">03 / FOCUSED</span><h3>Respect the source</h3><p>Every headline links to its publisher. The Brief organizes the edition; the reporting belongs to the people who created it.</p></section>
      </div>
    </article>
  );
}
