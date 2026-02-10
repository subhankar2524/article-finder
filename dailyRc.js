import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const FEEDS = [
  {
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  },
  {
    name: 'Indian Express',
    url: 'https://indianexpress.com/section/india/feed/',
  },
  {
    name: 'The Guardian World',
    url: 'https://www.theguardian.com/world/rss',
  },
  {
    name: 'Al Jazeera',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
  },
  {
    name: 'Hindustan Times',
    url: 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml',
  },
];

const CONTENT_DIR = path.join(process.cwd(), 'content');
const DATA_FILE = path.join(CONTENT_DIR, 'data.js');
const USER_AGENT = 'DailyRCBot/1.0 (+https://github.com/your-org/your-repo)';
const MAX_ITEMS_PER_FEED = 5;

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

function extractArticleText(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (article?.textContent) {
    return article.textContent.replace(/\s+/g, ' ').trim();
  }
  const fallback = dom.window.document.body?.textContent || '';
  return fallback.replace(/\s+/g, ' ').trim();
}

function buildPrompt({ title, source, text }) {
  return [
    'You are a banking exam coach. Rewrite the article as a reading comprehension passage.',
    'Return ONLY valid JSON matching this schema:',
    '{"passage":"...","questions":[{"question":"...","answer":"..."}] }',
    'Requirements:',
    '- Tone: formal, clear, exam-ready',
    '- Length: 250-400 words',
    '- Keep facts accurate, avoid opinions',
    '- Remove dates and bylines unless essential',
    '- Provide exactly 5 questions with correct answers'
  ].join('\n') + `\n\nTitle: ${title}\nSource: ${source}\n\nArticle:\n${text}`;
}

async function rewriteWithAI({ title, source, text }) {
  const prompt = buildPrompt({ title, source, text });

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
    passage: text.slice(0, 1200),
    questions: [
      {
        question: 'What is the central theme of the passage?',
        answer: 'The passage focuses on the main issue described in the article.',
      },
      {
        question: 'Which key fact is emphasized in the passage?',
        answer: 'A primary factual detail from the article is highlighted.',
      },
      {
        question: 'What is a major cause or factor discussed?',
        answer: 'The passage notes a major cause or contributing factor.',
      },
      {
        question: 'What is a significant consequence mentioned?',
        answer: 'It mentions a notable outcome of the situation.',
      },
      {
        question: 'What inference can be drawn from the passage?',
        answer: 'A logical inference can be made based on the passage details.',
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

async function findLatestItems(parser, feed) {
  const parsed = await parser.parseURL(feed.url);
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
  const t = text.toLowerCase();
  if (t.includes('subscribe to read') || t.includes('subscribe now') || t.includes('sign in to continue')) {
    return true;
  }
  return text.length < 400;
}

async function run() {
  const parser = new Parser({
    headers: { 'User-Agent': USER_AGENT },
  });

  const entries = await readDataFile();
  const today = toDateParts(new Date());

  if (entries.some((entry) => entry.date === today.iso)) {
    console.log(`Already generated for ${today.iso}`);
    return;
  }

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
      if (!item?.link) continue;

      console.log(`Fetching article: ${item.link}`);
      let html = '';
      try {
        html = await fetchHtml(item.link);
      } catch (err) {
        console.log(`Fetch failed: ${err?.message || err}`);
        continue;
      }

      const articleText = extractArticleText(html, item.link);
      if (!articleText || looksPaywalled(articleText)) {
        console.log(`Article too short or paywalled for ${item.link}`);
        continue;
      }

      const aiText = await rewriteWithAI({
        title: item.title || 'Untitled',
        source: feed.name,
        text: articleText,
      });

      const aiJson = safeJsonParse(aiText);
      if (!aiJson?.passage || !Array.isArray(aiJson.questions)) {
        console.log('AI output missing required fields. Skipping.');
        continue;
      }

      const entry = {
        date: today.iso,
        topic: item.title || 'Untitled',
        source: feed.name,
        url: item.link,
        passage: aiJson.passage,
        questions: aiJson.questions
          .map((q) => ({
            question: String(q.question || '').trim(),
            answer: String(q.answer || '').trim(),
          }))
          .filter((q) => q.question && q.answer)
          .slice(0, 5),
      };

      const updated = [entry, ...entries].sort((a, b) => b.date.localeCompare(a.date));
      await writeDataFile(updated);

      console.log(`Saved: ${DATA_FILE}`);
      return;
    }
  }

  console.log('No suitable article found today.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
