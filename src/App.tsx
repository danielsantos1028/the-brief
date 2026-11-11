import { useEffect, useState } from "react";
import {
  categories,
  categoryLabels,
  categorySchema,
  newsResponseSchema,
  type Category,
  type NewsResponse,
} from "../shared/news";
import { ArticleCard } from "./ArticleCard";
import { AboutProject } from "./AboutProject";

function initialCategory(): Category {
  const parsed = categorySchema.safeParse(
    new URLSearchParams(window.location.search).get("category"),
  );
  return parsed.success ? parsed.data : "general";
}

type FeedState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: NewsResponse };
const PAGE_SIZE = 12;

function Feed({ category }: { category: Category }) {
  const [state, setState] = useState<FeedState>({ status: "loading" });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/news?category=${category}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            response.status === 429
              ? "A lot of readers are here right now. Please try again in a moment."
              : "We couldn’t load the headlines. Please try again shortly.",
          );
        const data = newsResponseSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", data });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof TypeError
                ? "Check your connection, then try again."
                : error instanceof Error && !("issues" in error)
                  ? error.message
                  : "We couldn’t load the headlines. Please try again shortly.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [category, attempt]);

  if (state.status === "loading")
    return (
      <div
        className="loading-state"
        aria-busy="true"
        aria-label="Loading headlines"
      >
        <div className="skeleton skeleton-lead" />
        <div className="skeleton-grid">
          {[0, 1, 2].map((i) => (
            <div className="skeleton" key={i} />
          ))}
        </div>
        <span className="sr-only" role="status">
          Loading headlines
        </span>
      </div>
    );
  if (state.status === "error")
    return (
      <div className="empty-state" role="alert">
        <span className="state-eyebrow">A BRIEF PAUSE</span>
        <h3>The headlines will be back.</h3>
        <p>{state.message}</p>
        <button
          className="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        >
          Try again <span aria-hidden="true">↻</span>
        </button>
      </div>
    );

  const { data } = state;
  const visible = data.articles.slice(0, visibleCount);
  const [lead, ...rest] = visible;
  return (
    <>
      {data.demo ? (
        <div className="notice demo-notice">
          <strong>Sample edition</strong>
          <span>
            These stories are fictional. Add your NewsAPI key to read real
            headlines.
          </span>
        </div>
      ) : null}
      {data.stale ? (
        <div className="notice" role="status">
          <strong>Showing an earlier edition</strong>
          <span>
            Our news source is temporarily unavailable. These headlines were
            saved {new Date(data.fetchedAt).toLocaleString()}.
          </span>
        </div>
      ) : null}
      <div className="edition-meta">
        <span>{data.articles.length} headlines in this edition</span>
        <span>
          {data.demo
            ? "Preview edition"
            : `Updated ${new Date(data.fetchedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
        </span>
      </div>
      {!lead ? (
        <div className="empty-state">
          <span className="state-eyebrow">NOTHING HERE YET</span>
          <h3>A quieter moment.</h3>
          <p>
            No headlines are available in this category. Explore another topic.
          </p>
        </div>
      ) : (
        <>
          <ArticleCard article={lead} featured demo={data.demo} />
          <div className="section-divider">
            <h2>More to explore</h2>
            <span>{categoryLabels[category]}</span>
          </div>
          <div className="story-grid">
            {rest.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                demo={data.demo}
              />
            ))}
          </div>
          <div className="feed-end">
            <p>
              Showing {visible.length} of {data.articles.length} headlines
            </p>
            {visible.length < data.articles.length ? (
              <button
                className="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                More headlines <span aria-hidden="true">↓</span>
              </button>
            ) : (
              <span className="end-label">
                You’re up to date with this edition.
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function App() {
  const [category, setCategory] = useState<Category>(initialCategory);
  const [about, setAbout] = useState(() => new URLSearchParams(window.location.search).get("tab") === "about");
  useEffect(() => {
    const onPop = () => {
      setCategory(initialCategory());
      setAbout(new URLSearchParams(window.location.search).get("tab") === "about");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function selectCategory(next: Category) {
    if (next === category && !about) return;
    setAbout(false);
    setCategory(next);
    const url = new URL(window.location.href);
    url.search =
      next === "general"
        ? ""
        : new URLSearchParams({ category: next }).toString();
    window.history.pushState(null, "", url);
  }

  return (
    <>
      <a className="skip-link" href="#headlines">
        Skip to content
      </a>
      <header className="masthead shell">
        <div className="masthead-top">
          <span>THE DAILY EDITION</span>
          <time dateTime={new Date().toISOString().slice(0, 10)}>
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </time>
        </div>
        <div className="brand-row">
          <a className="wordmark" href="/" aria-label="The Brief home">
            The Brief<span>.</span>
          </a>
          <div className="edition-stamp">
            <span>U.S. HEADLINES</span>
            <span>Powered by NewsAPI</span>
          </div>
        </div>
        <nav className="categories" aria-label="News categories and project information">
          {categories.map((item) => (
            <button
              key={item}
              aria-pressed={!about && category === item}
              className={!about && category === item ? "category active" : "category"}
              onClick={() => selectCategory(item)}
            >
              {categoryLabels[item]}
            </button>
          ))}
          <button
            className={about ? "category project-tab active" : "category project-tab"}
            aria-pressed={about}
            onClick={() => {
              if (about) return;
              setAbout(true);
              const url = new URL(window.location.href);
              url.search = new URLSearchParams({ tab: "about" }).toString();
              window.history.pushState(null, "", url);
            }}
          >
            About the project
          </button>
        </nav>
      </header>
      <main className="shell" id="headlines" tabIndex={-1}>
        {about ? <AboutProject /> : <>
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR DAILY PERSPECTIVE</span>
            <h1>
              {categoryLabels[category]}
              <span className="heading-dot" aria-hidden="true">
                .
              </span>
            </h1>
          </div>
          <p>
            From the sources.
            <br />
            Across the stories.
          </p>
        </div>
        <Feed key={category} category={category} />
        </>}
      </main>
      <footer className="footer shell">
        <div>
          <a className="footer-brand" href="/">
            The Brief<span>.</span>
          </a>
          <p>A little perspective, every day.</p>
        </div>
        <div className="footer-note">
          <a
            href="https://newsapi.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            News provided by NewsAPI ↗
          </a>
          <p>
            Headlines link to their original publishers.
            <br />
            All reporting belongs to its respective source.
          </p>
        </div>
      </footer>
    </>
  );
}
