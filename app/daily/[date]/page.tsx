import { notFound } from 'next/navigation';
import { data } from '../../../content/data.js';
import QuestionList from '../../components/QuestionList';

export default function DailyPage({ params }: { params: { date: string } }) {
  const entry = data.find((item) => item.date === params.date);
  if (!entry) notFound();

  return (
    <article style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.5rem', color: '#1b1b1b' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{entry.topic}</h1>
      <p style={{ color: '#5b5b5b', marginBottom: '0.35rem' }}>
        {entry.date} | {entry.source}
      </p>
      <p style={{ color: '#7b6f64', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
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
      <section
        style={{
          marginBottom: '2rem',
          background: '#6e6e6e',
          border: '1px solid #e9e5df',
          borderRadius: 16,
          padding: '1.5rem',
          boxShadow: '0 6px 18px rgba(28, 28, 28, 0.06)',
        }}
      >
        <p style={{ lineHeight: 1.8 }}>{entry.passage}</p>
      </section>
      <section>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Questions</h3>
        <QuestionList questions={entry.questions} />
      </section>
    </article>
  );
}
