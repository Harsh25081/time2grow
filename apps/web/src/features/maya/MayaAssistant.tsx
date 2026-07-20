import { type FormEvent, useMemo, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';

import { useAuth } from '../auth/AuthProvider';
import { edgeFunctionErrorMessage, errorMessage } from '../business-dna/edgeError';
import { supabase } from '../../lib/supabase';

type MayaRole = 'user' | 'assistant';

type MayaMessage = {
  id: string;
  role: MayaRole;
  text: string;
  highlights?: string[];
  recommendedActions?: string[];
  modules?: string[];
  confidenceNote?: string;
};

type MayaResponse = {
  answer: string;
  highlights: string[];
  recommendedActions: string[];
  modules: string[];
  sourceModules: string[];
  confidenceNote: string;
};

const starterQuestions = [
  'Give me today\'s executive brief.',
  'Which leads need attention?',
  'What campaign should I run next?',
  'Where is performance weak?',
];

export function MayaAssistant() {
  const { organization } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<MayaMessage[]>([
    {
      id: 'maya-welcome',
      role: 'assistant',
      text: 'Hi, I am Maya. Ask me about strategy, campaigns, content, posters, leads, competitors, analytics, scheduling, or today\'s executive brief.',
      modules: ['Business DNA', 'Workspace data'],
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const history = useMemo(
    () => messages
      .filter((message) => message.id !== 'maya-welcome')
      .slice(-6)
      .map((message) => ({ role: message.role, text: message.text })),
    [messages],
  );

  async function askMaya(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    if (!supabase || !organization?.id) {
      setError('Maya needs an active workspace first.');
      return;
    }

    const userMessage: MayaMessage = { id: crypto.randomUUID(), role: 'user', text: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-handler', {
        body: {
          action: 'ask_maya',
          orgId: organization.id,
          question: trimmed,
          history,
        },
      });
      if (invokeError) throw new Error(await edgeFunctionErrorMessage(invokeError, 'ai-handler'));
      const result = normalizeMayaResponse(data);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: result.answer,
          highlights: result.highlights,
          recommendedActions: result.recommendedActions,
          modules: result.modules.length > 0 ? result.modules : result.sourceModules,
          confidenceNote: result.confidenceNote,
        },
      ]);
    } catch (mayaError) {
      setError(errorMessage(mayaError, 'Maya could not answer right now.'));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askMaya(input);
  }

  return (
    <>
      <button className="maya-launcher" type="button" title="Maya AI Growth Partner" onClick={() => setOpen((current) => !current)}>
        <Bot size={22} />
        <span>Maya</span>
      </button>

      {open ? (
        <section className="maya-chat" aria-label="Maya AI Growth Partner">
          <header className="maya-chat__header">
            <div>
              <p className="eyebrow">Maya</p>
              <h3>AI Growth Partner</h3>
            </div>
            <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close Maya">
              <X size={18} />
            </button>
          </header>

          <div className="maya-chat__body">
            {messages.map((message) => (
              <article className={`maya-message ${message.role === 'user' ? 'user' : 'assistant'}`} key={message.id}>
                <p>{message.text}</p>
                {message.highlights && message.highlights.length > 0 ? (
                  <div className="maya-message__section">
                    <strong>Highlights</strong>
                    {message.highlights.map((highlight) => <span key={highlight}>{highlight}</span>)}
                  </div>
                ) : null}
                {message.recommendedActions && message.recommendedActions.length > 0 ? (
                  <div className="maya-message__section">
                    <strong>Next actions</strong>
                    {message.recommendedActions.map((action) => <span key={action}>{action}</span>)}
                  </div>
                ) : null}
                {message.modules && message.modules.length > 0 ? (
                  <div className="maya-source-list">
                    {message.modules.slice(0, 8).map((module) => <span key={module}>{module}</span>)}
                  </div>
                ) : null}
                {message.confidenceNote ? <small>{message.confidenceNote}</small> : null}
              </article>
            ))}
            {loading ? (
              <article className="maya-message assistant">
                <span className="maya-loading"><Loader2 className="spin" size={16} /> Maya is reading the workspace</span>
              </article>
            ) : null}
          </div>

          <div className="maya-starters" aria-label="Suggested Maya questions">
            {starterQuestions.map((question) => (
              <button key={question} type="button" onClick={() => askMaya(question)} disabled={loading}>
                <Sparkles size={14} />
                <span>{question}</span>
              </button>
            ))}
          </div>

          {error ? <p className="form-message warning">{error}</p> : null}

          <form className="maya-chat__composer" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Maya anything about this workspace"
              maxLength={1200}
            />
            <button type="submit" className="maya-send-button" disabled={loading || !input.trim()} aria-label="Ask Maya">
              {loading ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
            </button>
          </form>
        </section>
      ) : null}
    </>
  );
}

function normalizeMayaResponse(value: unknown): MayaResponse {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const answer = typeof record.answer === 'string' ? record.answer.trim() : '';
  if (!answer) throw new Error('Maya returned an empty answer.');

  return {
    answer,
    highlights: stringList(record.highlights, 5),
    recommendedActions: stringList(record.recommendedActions, 5),
    modules: stringList(record.modules, 8),
    sourceModules: stringList(record.sourceModules, 12),
    confidenceNote: typeof record.confidenceNote === 'string' ? record.confidenceNote.trim() : 'Based on available workspace data.',
  };
}

function stringList(value: unknown, max: number) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).slice(0, max)
    : [];
}
