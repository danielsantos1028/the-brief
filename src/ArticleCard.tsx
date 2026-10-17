import { useState } from "react";
import type { Article } from "../shared/news";

export function ArticleCard({
  article,
  featured = false,
  demo,
}: {
  article: Article;
  featured?: boolean;
  demo: boolean;
}) {
  const [failedImage, setFailedImage] = useState(false);
  const timestamp = article.publishedAt
    ? new Date(article.publishedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const title = demo ? (
    <h3>{article.title}</h3>
  ) : (
    <h3>
      <a href={article.url} target="_blank" rel="noopener noreferrer">
        {article.title}
        <span className="sr-only"> (opens publisher in a new tab)</span>
      </a>
    </h3>
  );

  return (
    <article className={`story ${featured ? "story-featured" : ""}`}>
      {article.imageUrl && !failedImage ? (
        <div className="story-image">
          <img
            src={article.imageUrl}
            alt=""
            loading={featured ? "eager" : "lazy"}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(true)}
          />
        </div>
      ) : null}
      <div className="story-body">
        <div className="story-kicker">
          <span className="source-mark" aria-hidden="true">
            {article.source.charAt(0)}
          </span>
          <span>{article.source}</span>
          {featured ? <span className="lead-label">IN FOCUS</span> : null}
        </div>
        {title}
        {article.description ? (
          <p className="story-description">{article.description}</p>
        ) : null}
        <div className="story-footer">
          {timestamp ? (
            <time dateTime={article.publishedAt ?? undefined}>{timestamp}</time>
          ) : (
            <span>
              {demo ? "Sample story" : "Publication time unavailable"}
            </span>
          )}
          {!demo ? (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read ${article.title} at ${article.source} (new tab)`}
            >
              Read story <span aria-hidden="true">↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
