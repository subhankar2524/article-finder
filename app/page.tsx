import Link from 'next/link';
import { data } from '../content/data.js';
import QuestionList from './components/QuestionList';

function findIndexByDate(date?: string) {
  if (!date) return 0;
  const idx = data.findIndex((entry) => entry.date === date);
  return idx === -1 ? 0 : idx;
}

export default function Home({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  const index = findIndexByDate(searchParams?.date);
  const entry = data[index];

  if (!entry) {
    return (
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Daily Reading Comprehension</h1>
        <p>No articles yet. Run the generator to create the first entry.</p>
      </main>
    );
  }

  const prev = data[index + 1];
  const next = data[index - 1];

  return (
    <main
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '2.5rem 1.5rem',
        color: '#1b1b1b',
      }}
    >
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Daily Reading Comprehension</h1>
        <p style={{ color: '#5b5b5b', marginBottom: '0.35rem' }}>
          {entry.date} | {entry.source}
        </p>
        <p style={{ color: '#7b6f64', fontSize: '0.95rem' }}>
          {entry.topicTag ? `Topic: ${entry.topicTag}` : 'Topic: General'}{' '}
          {entry.wordCount ? `| Words: ${entry.wordCount}` : ''}
          {entry.url ? (
            <>
              {' '}
              |{' '}
              <a href={entry.url} target="_blank" rel="noreferrer">
                Source Link
              </a>
            </>
          ) : null}
        </p>
      </header>

      <section
        style={{
          marginBottom: '2rem',
          background: '#ffffff',
          border: '1px solid #e9e5df',
          borderRadius: 16,
          padding: '1.5rem',
          boxShadow: '0 6px 18px rgba(28, 28, 28, 0.06)',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>{entry.topic}</h2>
        <p style={{ lineHeight: 1.8 }}>{entry.passage}</p>
      </section>

      <section>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Questions</h3>
        <QuestionList questions={entry.questions} />
      </section>

      <nav style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        {prev ? (
          <Link href={`/?date=${prev.date}`}>&larr; Previous</Link>
        ) : (
          <span style={{ color: '#aaa' }}>&larr; Previous</span>
        )}
        {next ? (
          <Link href={`/?date=${next.date}`}>Next &rarr;</Link>
        ) : (
          <span style={{ color: '#aaa' }}>Next &rarr;</span>
        )}
      </nav>
    </main>
  );
}
