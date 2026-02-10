import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { extract } from '@extractus/article-extractor';
import he from 'he';
import { TOPICS } from './topics.js';

const FEEDS = [
  {
    name: 'RBI Press Releases',
    url: 'https://rbi.org.in/pressreleases_rss.xml',
    priority: 4,
  },
  {
    name: 'RBI Notifications',
    url: 'https://rbi.org.in/notifications_rss.xml',
    priority: 4,
  },
  {
    name: 'RBI Speeches',
    url: 'https://rbi.org.in/speeches_rss.xml',
    priority: 3,
  },
  {
    name: 'PIB Press Releases (English)',
    url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=6',
    priority: 3,
  },
  {
    name: 'BIS Press Releases',
    url: 'https://www.bis.org/doclist/all_pressrels.rss',
    priority: 2,
  },
  {
    name: 'BIS Central Bank Speeches',
    url: 'https://www.bis.org/doclist/cbspeeches.rss',
    priority: 2,
  },
  {
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    priority: 1,
  },
  {
    name: 'The Guardian World',
    url: 'https://www.theguardian.com/world/rss',
    priority: 1,
  },
];

const CONTENT_DIR = path.join(process.cwd(), 'content');
const DATA_FILE = path.join(CONTENT_DIR, 'data.js');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FEED_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const MAX_ITEMS_PER_FEED = 6;
const MAX_CANDIDATES = 30;
const MIN_ARTICLE_CHARS = 1400;
const MIN_ARTICLE_WORDS = 350;
const MIN_TOPIC_SCORE = 2;
const TOPIC_LABELS = TOPICS.map((t) => t.name);

function toDateParts(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return { yyyy, mm, dd, iso: `${yyyy}-${mm}-${dd}` };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch article (${res.status}): ${url}`);
  }
  return res.text();
}

function sanitizeHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
}

function stripHtml(html) {
  return he.decode(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function getItemText(item) {
  const raw =
    item['content:encoded'] ||
    item.content ||
    item['content:encodedSnippet'] ||
    item.summary ||
    item.contentSnippet ||
    item.description;
  const text = stripHtml(raw);
  return text.length ? text : '';
}

function extractFromDom(html, url) {
  try {
    const safeHtml = sanitizeHtml(html);
    const dom = new JSDOM(safeHtml, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (article?.textContent) {
      return article.textContent.replace(/\s+/g, ' ').trim();
    }
    const articleNode = dom.window.document.querySelector('article, main');
    if (articleNode?.textContent) {
      return articleNode.textContent.replace(/\s+/g, ' ').trim();
    }
    const fallback = dom.window.document.body?.textContent || '';
    return fallback.replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function extractArticleText(html, url) {
  const safeHtml = sanitizeHtml(html);
  try {
    const extracted = await extract(url, { html: safeHtml });
    if (extracted?.content) {
      const clean = extracted.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean.length >= MIN_ARTICLE_CHARS) return clean;
    }
    if (extracted?.text) {
      const clean = extracted.text.replace(/\s+/g, ' ').trim();
      if (clean.length >= MIN_ARTICLE_CHARS) return clean;
      if (clean.length) return clean;
    }
  } catch {
    // fall through to domText
  }

  const domText = extractFromDom(safeHtml, url);
  if (domText && domText.length >= MIN_ARTICLE_CHARS) return domText;
  return domText;
}

function buildPrompt({ title, source, text, topicTag }) {
  return [
    'You are a banking exam coach. Use the article to create a high-quality reading comprehension set.',
    'Return ONLY valid JSON matching this schema:',
    '{"topicTag":"Economy","passage":"...","questions":[{"type":"Main Idea","question":"...","options":["A","B","C","D"],"answer":"B"}] }',
    'Requirements:',
    `- topicTag must be one of: ${TOPIC_LABELS.join(', ')}`,
    `- Use the provided topicTag if it fits: ${topicTag}`,
    '- Passage must preserve the full article meaning and retain at least 80% of the original word count',
    '- Tone: formal, clear, exam-ready',
    '- Keep facts accurate, avoid opinions',
    '- Remove dates and bylines unless essential',
    '- Provide exactly 5 multiple-choice questions',
    '- Each question must have 4 options',
    '- The answer must exactly match one of the option strings',
    '- Use exam-style question types: Main Idea, Inference, Vocabulary-in-Context, Tone/Style, Factual Detail'
  ].join('\n') + `\n\nTitle: ${title}\nSource: ${source}\n\nArticle (full text):\n${text}`;
}

async function rewriteWithAI({ title, source, text, topicTag }) {
  const prompt = buildPrompt({ title, source, text, topicTag });

  // Gemini example. Set GEMINI_API_KEY as a secret in GitHub Actions.
  if (process.env.GEMINI_API_KEY) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const outputText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (outputText) return outputText.trim();
  }

  // Fallback: short rewrite when no API key is provided.
  const fallback = {
    topicTag,
    passage: text.slice(0, 1200),
    questions: [
      {
        question: 'What is the central theme of the passage?',
        options: ['Economic policy shift', 'Sports event outcome', 'Entertainment awards', 'Weather updates'],
        answer: 'Economic policy shift',
        type: 'Main Idea',
      },
      {
        question: 'Which key fact is emphasized in the passage?',
        options: ['A primary factual detail', 'A celebrity rumor', 'A fictional claim', 'An unrelated anecdote'],
        answer: 'A primary factual detail',
        type: 'Factual Detail',
      },
      {
        question: 'What is a major cause or factor discussed?',
        options: ['A contributing factor', 'A minor coincidence', 'A sports strategy', 'A film review'],
        answer: 'A contributing factor',
        type: 'Inference',
      },
      {
        question: 'What is a significant consequence mentioned?',
        options: ['A notable outcome', 'A fashion trend', 'A travel tip', 'A food recipe'],
        answer: 'A notable outcome',
        type: 'Factual Detail',
      },
      {
        question: 'What inference can be drawn from the passage?',
        options: ['A logical inference', 'A movie spoiler', 'A sports forecast', 'A personal opinion'],
        answer: 'A logical inference',
        type: 'Inference',
      },
    ],
  };

  return JSON.stringify(fallback);
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function readDataFile() {
  if (!(await fileExists(DATA_FILE))) {
    await ensureDir(CONTENT_DIR);
    await fs.writeFile(DATA_FILE, 'export const data = [];\n', 'utf8');
    return [];
  }

  const file = await fs.readFile(DATA_FILE, 'utf8');
  const match = file.match(/export const data = ([\s\S]*);/);
  if (!match) return [];
  const parsed = safeJsonParse(match[1].trim());
  return Array.isArray(parsed) ? parsed : [];
}

async function writeDataFile(entries) {
  const output = `export const data = ${JSON.stringify(entries, null, 2)};\n`;
  await fs.writeFile(DATA_FILE, output, 'utf8');
}

async function loadFeed(parser, feed) {
  try {
    return await parser.parseURL(feed.url);
  } catch (err) {
    const res = await fetch(feed.url, { headers: FEED_HEADERS });
    if (!res.ok) {
      throw err;
    }
    const xml = await res.text();
    return parser.parseString(xml);
  }
}

async function findLatestItems(parser, feed) {
  const parsed = await loadFeed(parser, feed);
  const items = parsed.items || [];
  if (!items.length) return null;

  // Prefer most recent by pubDate/isoDate, fallback to first item.
  const sorted = items
    .map((item) => ({
      ...item,
      _ts: item.isoDate || item.pubDate || '',
    }))
    .sort((a, b) => new Date(b._ts).getTime() - new Date(a._ts).getTime());

  return sorted.slice(0, MAX_ITEMS_PER_FEED);
}

function looksPaywalled(text) {
  if (typeof text !== 'string') return true;
  const t = text.toLowerCase();
  if (t.includes('subscribe to read') || t.includes('subscribe now') || t.includes('sign in to continue')) {
    return true;
  }
  return text.length < MIN_ARTICLE_CHARS;
}

function scoreArticle(text) {
  const t = text.toLowerCase();
  let score = 0;
  for (const topic of TOPICS) {
    for (const kw of topic.keywords) {
      if (t.includes(kw)) score += 1;
    }
  }
  return score;
}

function pickTopic(text) {
  const t = text.toLowerCase();
  let best = { name: '', score: 0 };
  for (const topic of TOPICS) {
    let count = 0;
    for (const kw of topic.keywords) {
      if (t.includes(kw)) count += 1;
    }
    if (count > best.score) best = { name: topic.name, score: count };
  }
  return best.score > 0 ? best.name : '';
}

function shouldSkipUrl(url) {
  const u = url.toLowerCase();
  return (
    u.includes('/video/') ||
    u.includes('/gallery/') ||
    u.includes('/live/') ||
    u.endsWith('.pdf') ||
    u.endsWith('.doc') ||
    u.endsWith('.docx') ||
    u.endsWith('.xls') ||
    u.endsWith('.xlsx')
  );
}

async function run() {
  const parser = new Parser({
    headers: FEED_HEADERS,
  });

  const entries = await readDataFile();
  const today = toDateParts(new Date());

  if (entries.some((entry) => entry.date === today.iso)) {
    console.log(`Already generated for ${today.iso}`);
    return;
  }

  const candidates = [];

  for (const feed of FEEDS) {
    let items = null;
    try {
      items = await findLatestItems(parser, feed);
    } catch (err) {
      console.log(`Feed error for ${feed.name}: ${err?.message || err}`);
      continue;
    }
    if (!items?.length) {
      console.log(`No items found for ${feed.name}`);
      continue;
    }

    for (const item of items) {
      const link = item.link || item.guid;
      if (!link) continue;
      if (shouldSkipUrl(link)) {
        console.log(`Skipping non-article URL: ${link}`);
        continue;
      }

      let articleText = '';
      const feedText = getItemText(item);
      if (feedText.length >= MIN_ARTICLE_CHARS) {
        articleText = feedText;
      } else {
        console.log(`Fetching article: ${link}`);
        let html = '';
        try {
          html = await fetchHtml(link);
        } catch (err) {
          console.log(`Fetch failed: ${err?.message || err}`);
          continue;
        }

        articleText = await extractArticleText(html, link);
      }

      if (!articleText || looksPaywalled(articleText)) {
        console.log(`Article too short or paywalled for ${link}`);
        continue;
      }

      const wordCount = articleText.split(/\s+/).length;
      if (wordCount < MIN_ARTICLE_WORDS) {
        console.log(`Article too short for exam use: ${link}`);
        continue;
      }

      const topicScore = scoreArticle(articleText);
      const topicTag = pickTopic(articleText);
      const priority = feed.priority || 0;
      const score = topicScore * 10 + Math.min(wordCount / 100, 12) + priority * 2;

      candidates.push({
        title: item.title || 'Untitled',
        source: feed.name,
        url: link,
        text: articleText,
        topicScore,
        topicTag,
        score,
        wordCount,
      });

      if (candidates.length >= MAX_CANDIDATES) break;
    }
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  if (!candidates.length) {
    console.log('No suitable article found today.');
    return;
  }

  const sorted = candidates.sort((a, b) => b.score - a.score);
  const best =
    sorted.find((c) => c.topicScore >= MIN_TOPIC_SCORE && c.topicTag) || sorted[0];

  if (!best) {
    console.log('No suitable article found today.');
    return;
  }

  const aiText = await rewriteWithAI({
    title: best.title,
    source: best.source,
    text: best.text,
    topicTag: best.topicTag,
  });

  const aiJson = safeJsonParse(aiText);
  if (!aiJson?.passage || !Array.isArray(aiJson.questions)) {
    console.log('AI output missing required fields. Skipping.');
    return;
  }

  const passageText = String(aiJson.passage || '').trim();
  const originalWordCount = best.wordCount;
  const passageWordCount = passageText.split(/\s+/).length;
  const finalPassage =
    passageWordCount >= Math.floor(originalWordCount * 0.8) ? passageText : best.text;

  const entry = {
    date: today.iso,
    topic: best.title,
    topicTag: aiJson.topicTag || best.topicTag,
    source: best.source,
    url: best.url,
    wordCount: originalWordCount,
    passage: finalPassage,
    questions: aiJson.questions
      .map((q) => ({
        type: String(q.type || '').trim(),
        question: String(q.question || '').trim(),
        options: Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [],
        answer: String(q.answer || '').trim(),
      }))
      .filter((q) => q.question && q.answer && q.options.length === 4 && q.options.includes(q.answer))
      .slice(0, 5),
  };

  const updated = [entry, ...entries].sort((a, b) => b.date.localeCompare(a.date));
  await writeDataFile(updated);

  console.log(`Saved: ${DATA_FILE}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
