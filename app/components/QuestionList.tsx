'use client';

import { useState } from 'react';

type Question = {
  type?: string;
  question: string;
  options?: string[];
  answer: string;
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function QuestionList({ questions }: { questions: Question[] }) {
  const [openAnswers, setOpenAnswers] = useState<Record<number, boolean>>({});

  return (
    <ol style={{ paddingLeft: '1.25rem', display: 'grid', gap: '1rem' }}>
      {questions.map((q, i) => (
        <li
          key={i}
          style={{
            listStyle: 'decimal',
            background: '#ffffff',
            border: '1px solid #ece7e1',
            borderRadius: 12,
            padding: '1rem',
          }}
        >
          {q.type ? (
            <p style={{ marginBottom: '0.35rem', color: '#7b6f64', fontSize: '0.85rem' }}>
              {q.type}
            </p>
          ) : null}
          <p style={{ marginBottom: '0.75rem', fontWeight: 600 }}>{q.question}</p>
          {Array.isArray(q.options) && q.options.length ? (
            <ul style={{ paddingLeft: '1.1rem', marginBottom: '0.75rem' }}>
              {q.options.map((opt, idx) => (
                <li key={idx} style={{ marginBottom: '0.35rem' }}>
                  <strong style={{ marginRight: '0.35rem' }}>{OPTION_LABELS[idx] || ''}</strong>
                  {opt}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            onClick={() =>
              setOpenAnswers((prev) => ({
                ...prev,
                [i]: !prev[i],
              }))
            }
            style={{
              background: '#f5efe8',
              border: '1px solid #e1d7cd',
              padding: '0.45rem 0.75rem',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {openAnswers[i] ? 'Hide Answer' : 'Reveal Answer'}
          </button>
          {openAnswers[i] ? (
            <p style={{ marginTop: '0.75rem', color: '#2b2b2b' }}>
              <strong>Answer:</strong> {q.answer}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
