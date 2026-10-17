import type { Article, Category } from "../shared/news.js";

const headlines: Record<Category, string[]> = {
  general: [
    "A new chapter for the places we call home",
    "Inside the ideas shaping tomorrow’s cities",
    "The small discoveries changing how we see the world",
    "Why the next generation of transport looks different",
    "A closer look at the week in science",
    "The people bringing local stories to life",
    "How communities are rethinking public spaces",
    "What comes next for the global economy",
    "Finding a new rhythm in everyday life",
    "The creative projects bringing people together",
    "A fresh perspective on the future of work",
    "The changing landscape of modern sport",
    "An unexpected connection between art and technology",
    "A new way to think about urban nature",
    "The conversation around a healthier future",
    "Exploring the frontiers of clean energy",
  ],
  business: [
    "Small businesses find new ways to connect with their communities",
    "A closer look at the forces shaping global trade",
    "The changing conversation around the future of work",
    "Inside a new generation of independent businesses",
    "How cities are investing in their next chapter",
    "The ideas behind a more circular economy",
    "Why local markets still matter",
    "New perspectives on long-term growth",
  ],
  technology: [
    "The next chapter of technology starts with better questions",
    "Inside the labs making computing more accessible",
    "A different approach to building digital communities",
    "The designers putting people at the center of new tools",
    "What repairable devices could mean for everyday life",
    "The quiet progress behind better batteries",
    "How open-source projects bring ideas to life",
    "A closer look at the changing web",
  ],
  science: [
    "A new perspective on the universe beyond our planet",
    "The researchers listening to the natural world",
    "What a tiny discovery can tell us about a bigger picture",
    "Inside the search for more resilient materials",
    "The next generation of ocean exploration",
    "How citizen scientists are mapping their surroundings",
    "A closer look at a changing atmosphere",
    "The questions driving tomorrow’s discoveries",
  ],
  health: [
    "The everyday spaces that help communities thrive",
    "A closer look at the science of better sleep",
    "The people making healthcare more accessible",
    "How neighborhoods are making room for movement",
    "New conversations about wellbeing at work",
    "The research behind building healthier routines",
    "Finding connection through community projects",
    "Designing public spaces with wellbeing in mind",
  ],
  sports: [
    "The next generation is changing the conversation in sport",
    "Inside the teams building stronger local communities",
    "The dedication behind a new personal best",
    "How a neighborhood club brings people together",
    "A fresh perspective on training and recovery",
    "The people working behind the scenes on match day",
    "Making more room for participation",
    "A closer look at the season ahead",
  ],
  entertainment: [
    "The artists finding inspiration in everyday places",
    "Inside a new wave of independent storytelling",
    "A community’s story comes to the stage",
    "The creative spaces bringing a city together",
    "How a new generation is rediscovering familiar sounds",
    "The craft behind a memorable performance",
    "A fresh look at the world of contemporary design",
    "The conversations shaping the next cultural chapter",
  ],
};

export async function demoHeadlines(category: Category): Promise<Article[]> {
  return headlines[category].map((title, index) => ({
    id: `demo-${category}-${index}`,
    title,
    description:
      "This is fictional sample content for exploring the reader. Connect your NewsAPI key to display headlines from real publishers.",
    url: "https://newsapi.org",
    imageUrl: null,
    source:
      ["Sample Journal", "Example Review", "The Demo Post"][index % 3] ??
      "Sample Journal",
    publishedAt: null,
  }));
}
