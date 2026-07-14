import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Loader2,
  Pencil,
  Plus,
  Save,
  Square,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Database, Json } from '../../types/database';

type MarketingTaskRow = Database['public']['Tables']['marketing_tasks']['Row'];
type TaskType = MarketingTaskRow['task_type'];
type TaskStatus = MarketingTaskRow['status'];

type ChecklistItem = { label: string; done: boolean };

type StatusFilter = 'all' | TaskStatus;

const taskWriterRoles = ['owner', 'admin', 'editor'] as const;

const taskTypes: Array<{ value: TaskType; label: string }> = [
  { value: 'publish_reel', label: 'Publish Instagram Reel' },
  { value: 'launch_meta_ads', label: 'Launch Meta Ads' },
  { value: 'send_newsletter', label: 'Send Newsletter' },
  { value: 'review_google_ads', label: 'Review Google Ads' },
  { value: 'approve_campaign', label: 'Approve Campaign' },
  { value: 'custom', label: 'Custom task' },
];

// Default SOP checklists so a task type feels like a real procedure, not an empty shell.
const checklistTemplates: Record<TaskType, string[]> = {
  publish_reel: ['Video ready and on-brand', 'Caption and hashtags written', 'Cover frame selected', 'Scheduled or posted', 'Link in bio updated'],
  launch_meta_ads: ['Audience defined', 'Budget and schedule set', 'Creative approved', 'Tracking / pixel on', 'Campaign live'],
  send_newsletter: ['Subject line written', 'Content proofread', 'Segments selected', 'Test email sent', 'Newsletter scheduled'],
  review_google_ads: ['Spend vs budget checked', 'Search terms reviewed', 'Negative keywords added', 'Bids adjusted', 'Notes recorded'],
  approve_campaign: ['Brief matches brand', 'Assets on-brand', 'Copy and CTA checked', 'Compliance checked', 'Final approval given'],
  custom: [],
};

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'done', label: 'Done' },
  { value: 'archived', label: 'Archived' },
];

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'done', label: 'Done' },
];

// The natural forward step for the primary action button.
const nextStatus: Partial<Record<TaskStatus, TaskStatus>> = {
  todo: 'in_progress',
  in_progress: 'in_review',
  in_review: 'approved',
  approved: 'done',
};

type TaskForm = {
  title: string;
  taskType: TaskType;
  description: string;
  dueAt: string;
  expectedOutputs: string;
  checklist: ChecklistItem[];
};

const emptyForm: TaskForm = {
  title: '',
  taskType: 'publish_reel',
  description: '',
  dueAt: '',
  expectedOutputs: '',
  checklist: checklistTemplates.publish_reel.map((label) => ({ label, done: false })),
};

export function TasksPage() {
  const { organization, user, membership } = useAuth();
  const [tasks, setTasks] = useState<MarketingTaskRow[]>([]);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canWrite = taskWriterRoles.some((role) => role === membership?.role);
  const readOnly = Boolean(membership?.role) && !canWrite;

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');

      if (!supabase || !organization?.id) {
        setTasks([]);
        setLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('marketing_tasks')
        .select('*')
        .eq('org_id', organization.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100);

      if (!active) return;

      if (loadError) setError(errorMessage(loadError, 'Could not load tasks.'));
      setTasks(data ?? []);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [organization?.id]);

  const counts = useMemo(() => {
    const map = new Map<StatusFilter, number>([['all', tasks.length]]);
    for (const task of tasks) map.set(task.status, (map.get(task.status) ?? 0) + 1);
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    if (statusFilter === 'all') return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [tasks, statusFilter]);

  function updateForm<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeTaskType(taskType: TaskType) {
    setForm((current) => {
      // Only replace the checklist with the template when the user has not customized it yet,
      // so switching type after editing does not silently wipe their work.
      const untouched =
        current.checklist.length === 0 ||
        current.checklist.every((item, index) => item.label === (checklistTemplates[current.taskType][index] ?? '__none__'));
      return {
        ...current,
        taskType,
        checklist: untouched ? checklistTemplates[taskType].map((label) => ({ label, done: false })) : current.checklist,
      };
    });
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId('');
  }

  function startCreate() {
    resetForm();
    setMessage('');
    setError('');
  }

  function startEdit(task: MarketingTaskRow) {
    if (!canWrite) return;
    setEditingId(task.id);
    setForm({
      title: task.title,
      taskType: task.task_type,
      description: task.description ?? '',
      dueAt: task.due_at ? task.due_at.slice(0, 10) : '',
      expectedOutputs: task.expected_outputs ?? '',
      checklist: parseChecklist(task.checklist),
    });
    setMessage('');
    setError('');
  }

  function addChecklistItem() {
    updateForm('checklist', [...form.checklist, { label: '', done: false }]);
  }

  function updateChecklistLabel(index: number, label: string) {
    updateForm('checklist', form.checklist.map((item, i) => (i === index ? { ...item, label } : item)));
  }

  function removeChecklistItem(index: number) {
    updateForm('checklist', form.checklist.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !organization?.id || !user?.id) return;

    if (!canWrite) {
      setError('Ask an owner, admin, or editor to manage tasks here.');
      return;
    }

    if (!form.title.trim()) {
      setError('Enter a task title first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    const checklist = form.checklist
      .map((item) => ({ label: item.label.trim(), done: item.done }))
      .filter((item) => item.label.length > 0);

    const payload = {
      title: form.title.trim(),
      task_type: form.taskType,
      description: form.description.trim() || null,
      expected_outputs: form.expectedOutputs.trim() || null,
      due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
      checklist: (checklist as unknown as Json),
    };

    try {
      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('marketing_tasks')
          .update(payload)
          .eq('id', editingId)
          .eq('org_id', organization.id)
          .select('*')
          .single();
        if (updateError) throw updateError;
        setTasks((current) => current.map((task) => (task.id === data.id ? data : task)));
        setMessage('Task updated.');
      } else {
        const { data, error: insertError } = await supabase
          .from('marketing_tasks')
          .insert({ ...payload, org_id: organization.id, created_by: user.id })
          .select('*')
          .single();
        if (insertError) throw insertError;
        setTasks((current) => [data, ...current]);
        setMessage('Task created.');
      }
      resetForm();
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not save task.'));
    } finally {
      setSaving(false);
    }
  }

  async function patchTask(task: MarketingTaskRow, patch: Database['public']['Tables']['marketing_tasks']['Update']) {
    if (!supabase || !organization?.id || !canWrite) return;
    setUpdatingId(task.id);
    setMessage('');
    setError('');
    try {
      const { data, error: updateError } = await supabase
        .from('marketing_tasks')
        .update(patch)
        .eq('id', task.id)
        .eq('org_id', organization.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      setTasks((current) => current.map((item) => (item.id === data.id ? data : item)));
    } catch (patchError) {
      setError(errorMessage(patchError, 'Could not update task.'));
    } finally {
      setUpdatingId('');
    }
  }

  function toggleChecklistItem(task: MarketingTaskRow, index: number) {
    const checklist = parseChecklist(task.checklist);
    const next = checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    patchTask(task, { checklist: next as unknown as Json });
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operate</p>
          <h2>Marketing Tasks</h2>
        </div>
        <span className={readOnly ? 'status-pill warning' : 'status-pill success'}>
          {readOnly ? 'Read only' : `${tasks.length} tasks`}
        </span>
      </header>

      {loading ? (
        <section className="empty-state" aria-label="Loading tasks">
          <Loader2 className="spin" size={28} />
          <h3>Loading tasks</h3>
        </section>
      ) : (
        <div className="content-creator-grid">
          <section className="draft-panel creator-panel" aria-label="Create or edit task">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SOP</p>
                <h3>{editingId ? 'Edit task' : 'New task'}</h3>
              </div>
              <CalendarDays size={21} />
            </div>

            {readOnly ? <p className="form-message warning">Ask an owner, admin, or editor to create and manage tasks.</p> : null}

            <form className="draft-form creator-form" onSubmit={handleSubmit}>
              <label>
                <span>Task type</span>
                <select value={form.taskType} onChange={(event) => changeTaskType(event.target.value as TaskType)}>
                  {taskTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>

              <label>
                <span>Title</span>
                <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="Example: Diwali reel for main handle" />
              </label>

              <label className="draft-body-field">
                <span>Description</span>
                <textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={3} placeholder="Optional context or brief" />
              </label>

              <label>
                <span>Due date</span>
                <input type="date" value={form.dueAt} onChange={(event) => updateForm('dueAt', event.target.value)} />
              </label>

              <div className="draft-body-field">
                <span className="field-label">Checklist</span>
                <div className="task-checklist-edit">
                  {form.checklist.map((item, index) => (
                    <div className="task-checklist-edit__row" key={index}>
                      <input
                        value={item.label}
                        onChange={(event) => updateChecklistLabel(index, event.target.value)}
                        placeholder="Checklist step"
                      />
                      <button type="button" className="icon-text-button" onClick={() => removeChecklistItem(index)} aria-label="Remove step">
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="icon-text-button" onClick={addChecklistItem}>
                    <Plus size={16} />
                    <span>Add step</span>
                  </button>
                </div>
              </div>

              <label className="draft-body-field">
                <span>Expected outputs</span>
                <textarea value={form.expectedOutputs} onChange={(event) => updateForm('expectedOutputs', event.target.value)} rows={2} placeholder="What done looks like" />
              </label>

              <div className="creator-actions draft-body-field">
                {editingId ? (
                  <button type="button" className="icon-text-button" onClick={startCreate}>
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                ) : null}
                <button className="primary-action" type="submit" disabled={saving || !canWrite}>
                  {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  <span>{saving ? 'Saving' : editingId ? 'Save changes' : 'Create task'}</span>
                </button>
              </div>
            </form>

            {message ? <p className="form-message success">{message}</p> : null}
            {error ? <p className="form-message error">{error}</p> : null}
          </section>

          <section className="draft-panel saved-content-panel" aria-label="Task list">
            <div className="section-heading content-library-heading">
              <div>
                <p className="eyebrow">Board</p>
                <h3>Tasks</h3>
              </div>
              <div className="library-filter-tabs" aria-label="Filter tasks by status">
                {statusFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    className={statusFilter === filter.value ? 'is-active' : ''}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    <span>{filter.label}</span>
                    <small>{counts.get(filter.value) ?? 0}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="saved-content-list">
              {visibleTasks.length > 0 ? visibleTasks.map((task) => {
                const checklist = parseChecklist(task.checklist);
                const doneCount = checklist.filter((item) => item.done).length;
                const forward = nextStatus[task.status];
                return (
                  <article className={`saved-content-row ${task.status === 'archived' ? 'is-archived' : ''}`} key={task.id}>
                    <div className="saved-content-row__main">
                      <strong>{task.title}</strong>
                      <div className="saved-content-row__meta">
                        <span>{taskTypeLabel(task.task_type)}</span>
                        <span>{statusLabel(task.status)}</span>
                        {checklist.length > 0 ? <span>{doneCount}/{checklist.length} done</span> : null}
                        {task.due_at ? <span>Due {formatDate(task.due_at)}</span> : null}
                      </div>

                      {checklist.length > 0 ? (
                        <ul className="task-checklist">
                          {checklist.map((item, index) => (
                            <li key={index}>
                              <button
                                type="button"
                                className="task-checklist__toggle"
                                onClick={() => toggleChecklistItem(task, index)}
                                disabled={!canWrite || updatingId === task.id}
                              >
                                {item.done ? <CheckSquare size={16} /> : <Square size={16} />}
                                <span className={item.done ? 'is-done' : ''}>{item.label}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {task.expected_outputs ? <p className="task-expected">Expected: {task.expected_outputs}</p> : null}
                    </div>

                    <div className="saved-content-row__side">
                      <small>{formatDate(task.created_at)}</small>
                      {canWrite ? (
                        <div className="saved-content-row__actions">
                          {forward ? (
                            <button type="button" className="icon-text-button" disabled={updatingId === task.id} onClick={() => patchTask(task, { status: forward })}>
                              {updatingId === task.id ? <Loader2 className="spin" size={16} /> : <CheckCircle2 size={16} />}
                              <span>{statusLabel(forward)}</span>
                            </button>
                          ) : null}
                          <label className="task-status-select">
                            <select
                              value={task.status}
                              disabled={updatingId === task.id}
                              onChange={(event) => patchTask(task, { status: event.target.value as TaskStatus })}
                            >
                              {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                            </select>
                          </label>
                          <button type="button" className="icon-text-button" onClick={() => startEdit(task)}>
                            <Pencil size={16} />
                            <span>Edit</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              }) : (
                <div className="queue-empty">
                  <CalendarDays size={20} />
                  <span>{tasks.length > 0 ? 'No tasks match this filter.' : 'No tasks yet.'}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function parseChecklist(value: Json | null): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === 'string' ? record.label : '';
      if (!label) return null;
      return { label, done: record.done === true };
    })
    .filter((item): item is ChecklistItem => Boolean(item));
}

function taskTypeLabel(value: TaskType) {
  return taskTypes.find((type) => type.value === value)?.label ?? value;
}

function statusLabel(value: TaskStatus) {
  return statusOptions.find((status) => status.value === value)?.label ?? value.replace('_', ' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (parts.length > 0) return parts.join(' - ');
  }
  return fallback;
}
