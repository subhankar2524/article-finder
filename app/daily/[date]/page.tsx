import { notFound } from 'next/navigation';
import { data } from '../../../content/data.js';

export default function DailyPage({ params }: { params: { date: string } }) {
  const entry = data.find((item) => item.date === params.date);
  if (!entry) notFound();

  return (
    <article style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{entry.topic}</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        {entry.date} | {entry.source}
      </p>
      <section style={{ marginBottom: '1.5rem' }}>
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
    </article>
  );
}
