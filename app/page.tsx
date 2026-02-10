import Link from 'next/link';
import { data } from '../content/data.js';

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
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Daily Reading Comprehension</h1>
        <p>No articles yet. Run the generator to create the first entry.</p>
      </main>
    );
  }

  const prev = data[index + 1];
  const next = data[index - 1];

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Daily Reading Comprehension</h1>
        <p style={{ color: '#666' }}>
          {entry.date} | {entry.source}
        </p>
      </header>

      <section style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{entry.topic}</h2>
        <p style={{ lineHeight: 1.7 }}>{entry.passage}</p>
      </section>

      <section>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Questions</h3>
        <ol style={{ paddingLeft: '1.25rem' }}>
          {entry.questions.map((q: { question: string; answer: string }, i: number) => (
            <li key={i} style={{ marginBottom: '0.75rem' }}>
              <p style={{ marginBottom: '0.25rem' }}>{q.question}</p>
              <p style={{ color: '#444' }}>
                <strong>Answer:</strong> {q.answer}
              </p>
            </li>
          ))}
        </ol>
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
